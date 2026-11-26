// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AxiosError,type AxiosAdapter} from 'axios';
import {api} from '@/api/client';
import {nativeClient} from '@/api/connector-seller-settings';
import {EMPTY_LISTING_DRAFT,saveListingDraft,type SavedListingDraft} from '@/api/sellerListingDraft';
import type {SourceRead} from '@/api/sellerListingSource';
import {useAuthStore} from '@/store/auth';
import {categoryRows,guidedCapabilities,guidedConnection,guidedObjects} from '@/tests/guidedListingFixture';
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests,useSellerListingDraft} from './SellerListingDraftStore';
import SavedWorkspaceData from './SavedWorkspaceData';
import {GuidedListingFlow} from './GuidedListingFlow';
import {RecoverableWorkspacePanel} from './WorkspacePanel';
vi.mock('@/api/capabilities',()=>({getCapabilities:vi.fn(async()=>({}))}));

vi.mock('@/api/sellerWorkspace',async original=>({...await original<typeof import('@/api/sellerWorkspace')>(),
  listWorkspaceObjects:vi.fn(async()=>({objects:[...guidedObjects,{...guidedObjects[0],key:'weekly/extra.csv'}],next_cursor:null}))}));
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const org='00000000-0000-4000-8000-000000000003';
const token=`header.${btoa(JSON.stringify({sub:a,org_id:org,exp:4102444800}))}.signature`;
const originalApiAdapter=api.defaults.adapter,originalNativeAdapter=nativeClient.defaults.adapter;
beforeEach(()=>{useAuthStore.setState({token,user:{id:a} as never});resetSellerListingDraftOwnerForTests();});
afterEach(()=>{cleanup();api.defaults.adapter=originalApiAdapter;nativeClient.defaults.adapter=originalNativeAdapter;vi.restoreAllMocks();});

function backend(){
  // Model bf46896b: pointer precondition precedes creation/mutation, while
  // explicit draft_id alone enters native organization/lineage authorization.
  const drafts=new Map<string,SavedListingDraft & {organization_id:string|null}>();
  const sources=new Map<string,SourceRead>();
  const receipts=new Map<string,{source:SourceRead;current_draft_id:string}>();
  let loseResponse=false;let draftReads=0;
  let beforeSourceRead:((id:string|null)=>void)|undefined;
  let afterSourceSave:(()=>void)|undefined;
  let readDraft:(()=>Promise<SavedListingDraft|null>)|undefined;
  const sourceReads:Array<string|null>=[];
  const writes:Array<Record<string,unknown>>=[];
  let current:string|null=null;
  const createOrdinary=(id:string)=>{
    const draft={draft_id:id,authority_version_id:null,organization_id:null,version:1,content:{...EMPTY_LISTING_DRAFT},updated_at:''};
    drafts.set(id,draft);current=id;return draft;
  };
  const adapter:AxiosAdapter=async config=>{
    expect(config.headers.get('Authorization')).toBe(`Bearer ${token}`);
    let data:unknown;
    if(config.method==='get'){
      if(config.url?.endsWith('/listing-draft')){draftReads++;data={draft:readDraft?await readDraft():current?drafts.get(current):null};}
      else if(config.url?.endsWith('/categories'))data=categoryRows;
      else if(config.url?.endsWith('/listing-source')){
        const requested=config.params?.draft_id??null;sourceReads.push(requested);beforeSourceRead?.(requested);
        const target=requested??current;
        data={source:target?sources.get(target)??null:null,current_draft_id:current};
      }
      else throw new Error(`Unexpected GET ${config.url}`);
    }else{
      const body=JSON.parse(config.data);writes.push(body);
      if(config.url?.endsWith('/listing-draft')){
        expect(body.draft_id).toBeUndefined();
        const row=current?drafts.get(current)!:createOrdinary(a);row.content=body.content;data={draft:row};
      }else if(config.url?.endsWith('/listing-source')){
        const conflict=(code:string,message:string):never=>{throw new AxiosError('conflict','ERR_BAD_REQUEST',config,undefined,
          {status:409,statusText:'Conflict',headers:{},config,data:{detail:{code,message}}});};
        const receipt=receipts.get(body.request_id);
        if(receipt&&receipt.current_draft_id===current&&receipt.source===sources.get(current!))return {data:receipt,status:200,statusText:'OK',headers:{},config};
        if(Object.hasOwn(body,'expected_current_draft_id')&&body.expected_current_draft_id!==current)
          conflict('CURRENT_DRAFT_CHANGED','The current listing draft changed. Reload it before saving again.');
        // Ordinary rows have no organization; an explicit target must fail in
        // this org-scoped session, even if the source version matches.
        if(body.draft_id&&drafts.get(body.draft_id)?.organization_id!==org)
          conflict('NATIVE_DRAFT_FORBIDDEN','Native draft authorization failed.');
        const existing=current?sources.get(current):undefined;
        expect(body.expected_version).toBe(existing?.version??0);
        if(!current)createOrdinary(a);
        const source={version:(existing?.version??0)+1,content:body.content,connection_current:true};
        sources.set(current!,source);
        receipts.set(body.request_id,{source,current_draft_id:current!});
        afterSourceSave?.();data={source,current_draft_id:current};
        if(loseResponse){loseResponse=false;throw new Error("lost response");}
      }else throw new Error(`Unexpected write ${config.url}`);
    }
    return {data,status:200,statusText:'OK',headers:{},config};
  };
  api.defaults.adapter=adapter;nativeClient.defaults.adapter=adapter;
  return {drafts,sources,writes,sourceReads,createOrdinary,onSourceSave:(callback:()=>void)=>{afterSourceSave=callback;},onDraftRead:(callback:()=>Promise<SavedListingDraft|null>)=>{readDraft=callback;},onSourceRead:(callback:(id:string|null)=>void)=>{beforeSourceRead=callback;},get draftReads(){return draftReads;},loseNextResponse:()=>{loseResponse=true;}};
}
function DraftStatus(){const {draft,sampleIndices,selectionSavePending,selectionSaveFailed}=useSellerListingDraft();return <output data-testid="draft-id" data-sample-decision={draft?.content.sample_decision} data-sample-indices={JSON.stringify(sampleIndices)} data-samples-blocked={selectionSavePending||selectionSaveFailed}>{draft?.draft_id??"empty"}</output>;}
function mount(enabled=true,guided=false,sampleCapability=false){
  const editor=<><DraftStatus/><SavedWorkspaceData enabled connections={[guidedConnection]}/></>;
  return render(<SellerListingDraftProvider enabled={enabled} sampleCapability={sampleCapability}>{guided?<GuidedListingFlow capabilities={{...guidedCapabilities,review:{enabled:false,status:'unavailable',reason:'disabled'},listing_licenses:false}} connections={[guidedConnection]} view="data" navigate={vi.fn()}>{editor}</GuidedListingFlow>:editor}</SellerListingDraftProvider>);
}
async function select(){fireEvent.click(await screen.findByRole('checkbox',{name:'Select weekly/sales.csv'}));}
function save(){fireEvent.click(screen.getByRole('button',{name:'Save selected files'}));fireEvent.click(screen.getByRole('button',{name:'Confirm selection'}));}

it('saves an uncontended first selection with an explicit null current-draft precondition',async()=>{
  const model=backend();mount();await select();save();
  await screen.findByText(/File selection saved to your account\./);
  expect(model.writes).toHaveLength(1);
  expect(model.writes[0]).toMatchObject({expected_current_draft_id:null,expected_version:0,request_id:expect.any(String)});
  expect(model.writes[0]).not.toHaveProperty('draft_id');
  expect(model.sources.get(a)?.content.objects).toEqual(guidedObjects.map(({key,etag,size,version_id})=>({key,etag,size,version_id})));
});

it('handles a draft created after the empty GET without touching it and offers a plain reload action',async()=>{
  const model=backend();mount();await select();
  // This tab has observed no draft. Another tab now creates B, with no source.
  const before=structuredClone(model.createOrdinary(b));save();
  const alert=await screen.findByRole('alert');
  expect(alert.textContent).toContain('Your listing draft changed. Reload the current draft before saving your files again.');
  expect(screen.getByRole('button',{name:'Reload current draft'})).toBeTruthy();
  expect(alert.textContent).not.toMatch(/CURRENT_DRAFT_CHANGED|409|precondition|pointer/);
  expect(model.writes).toHaveLength(1);
  expect(model.writes[0]).toMatchObject({expected_current_draft_id:null,expected_version:0});
  expect(model.drafts.size).toBe(1);expect(model.drafts.get(b)).toEqual(before);
  expect(model.sources.size).toBe(0);
  expect((screen.getByRole('checkbox',{name:'Select weekly/sales.csv'}) as HTMLInputElement).checked).toBe(true);
});

function RecoverableDataStep({fail}:{fail:boolean}){
  if(fail)throw new Error('Synthetic data-step render failure');
  return <SavedWorkspaceData enabled connections={[guidedConnection]}/>;
}

it('keeps a guided source-save refusal across panel retry and only shows the current source after reload',async()=>{
  const model=backend();
  model.createOrdinary(a);
  const source:SourceRead={version:1,connection_current:true,content:{
    connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:guidedObjects}};
  model.sources.set(a,source);
  const capabilities={...guidedCapabilities,review:{enabled:false,status:'unavailable' as const,reason:'disabled'},listing_licenses:false};
  const workspace=(fail:boolean)=><SellerListingDraftProvider enabled sampleCapability={false}>
    <GuidedListingFlow capabilities={capabilities} connections={[guidedConnection]} view="data" navigate={vi.fn()}>
      <DraftStatus/>
      <RecoverableWorkspacePanel active><RecoverableDataStep fail={fail}/></RecoverableWorkspacePanel>
    </GuidedListingFlow>
  </SellerListingDraftProvider>;
  const {rerender}=render(workspace(false),{onCaughtError:vi.fn()});
  await screen.findByText(/File selection saved to your account/);
  fireEvent.click(screen.getByRole('checkbox',{name:'Select weekly/extra.csv'}));
  model.createOrdinary(b);
  model.sources.set(b,{...source,content:{...source.content,objects:[{...guidedObjects[0],key:'weekly/extra.csv'}]}});
  save();
  await screen.findByRole('button',{name:'Reload current draft'});
  expect(model.writes).toHaveLength(1);
  const readsBeforeRetry=model.sourceReads.slice();

  rerender(workspace(true));
  await screen.findByRole('button',{name:'Retry this step'});
  rerender(workspace(false));
  fireEvent.click(screen.getByRole('button',{name:'Retry this step'}));
  await screen.findByRole('button',{name:'Reload current draft'});
  expect(screen.getByRole('alert').textContent).toContain('Your listing draft changed.');
  expect(screen.queryByText(/File selection saved to your account/)).toBeNull();
  expect(model.sourceReads).toEqual(readsBeforeRetry);
  expect(model.writes).toHaveLength(1);

  fireEvent.click(screen.getByRole('button',{name:'Reload current draft'}));
  const extra=await screen.findByRole('checkbox',{name:'Select weekly/extra.csv'}) as HTMLInputElement;
  expect(extra.checked).toBe(true);
  expect((screen.getByRole('checkbox',{name:'Select weekly/sales.csv'}) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByTestId('draft-id').textContent).toBe(b);
  expect(model.sourceReads).toContain(b);
  expect(model.writes).toHaveLength(1);
});

it('reloads an ordinary draft created without an organization and saves its source in an org-scoped session',async()=>{
  const model=backend();
  // Exercise the ordinary workspace save, then load its returned ID afresh.
  await saveListingDraft({...EMPTY_LISTING_DRAFT,title:'Ordinary listing'},0,crypto.randomUUID());
  expect(model.drafts.get(a)?.organization_id).toBeNull();
  mount();await select();save();
  await screen.findByText(/File selection saved to your account\./);
  await waitFor(()=>expect(model.sources.get(a)?.version).toBe(1));
  expect(model.writes).toHaveLength(2);
  expect(model.writes[1]).toMatchObject({expected_current_draft_id:a,expected_version:0});
  expect(model.writes[1]).not.toHaveProperty('draft_id');
  expect(model.drafts.get(a)?.content.title).toBe('Ordinary listing');
});

it.each([{enabled:true,guided:false},{enabled:true,guided:true},{enabled:false,guided:false},{enabled:false,guided:true}])('saves two successive selections from empty: %j',async({enabled,guided})=>{
  const model=backend();mount(enabled,guided);await select();save();
  await screen.findByText(/File selection saved to your account/);
  if(enabled)expect(model.draftReads).toBeGreaterThan(1);else expect(model.draftReads).toBe(0);
  fireEvent.click(await screen.findByRole('checkbox',{name:'Select weekly/extra.csv'}));save();
  await waitFor(()=>expect(model.sources.get(a)?.version).toBe(2));
  expect(model.writes.map(write=>write.expected_current_draft_id)).toEqual([null,a]);
});

it.each([{replacement:false,hasSource:false},{replacement:true,hasSource:false},{replacement:false,hasSource:true},{replacement:true,hasSource:true}])('uses the source pointer with drafts off: %j',async({replacement,hasSource})=>{
  const model=backend();model.createOrdinary(a);
  if(hasSource)model.sources.set(a,{version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:guidedObjects}});
  mount(false);
  if(hasSource)fireEvent.click(await screen.findByRole('checkbox',{name:'Select weekly/extra.csv'}));else await select();
  expect(model.draftReads).toBe(0);
  const before=replacement?structuredClone(model.createOrdinary(b)):null;
  save();
  if(replacement){await screen.findByRole('button',{name:'Reload current draft'});expect(model.drafts.get(b)).toEqual(before);expect(model.sources.has(b)).toBe(false);expect(model.sources.get(a)?.version).toBe(hasSource?1:undefined);}
  else {await screen.findByText(/File selection saved to your account/);expect(model.sources.get(a)?.version).toBe(hasSource?2:1);}
  expect(model.writes[0].expected_current_draft_id).toBe(a);
});

it('retries a committed first save after a lost response with exactly the same body',async()=>{
  const model=backend();model.loseNextResponse();mount();await select();save();
  await screen.findByText(/Saving could not be confirmed/);save();
  await screen.findByText(/File selection saved to your account/);
  expect(model.writes).toHaveLength(2);expect(model.writes[1]).toEqual(model.writes[0]);
  expect(model.sources.get(a)?.version).toBe(1);
});


it.each([{guided:false,hasSource:false},{guided:true,hasSource:false},{guided:false,hasSource:true},{guided:true,hasSource:true}])('blocks A source with B current until the seller reloads and reviews B: %j',async({guided,hasSource})=>{
  const model=backend();model.createOrdinary(a);
  const bSource:SourceRead={version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:[{...guidedObjects[0],key:'weekly/extra.csv'}]}};
  let before:SavedListingDraft|undefined;
  model.onSourceRead(id=>{if(id===a){before=structuredClone(model.createOrdinary(b));if(hasSource)model.sources.set(b,bSource);}});
  mount(true,guided);
  await screen.findByRole('button',{name:'Reload current draft'});
  expect(screen.getByRole('alert').textContent).toContain('Your listing draft changed.');
  expect(screen.queryByRole('button',{name:'Confirm selection'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Save selected files'})).toBeNull();
  expect(model.sourceReads).toContain(a);expect(model.writes).toHaveLength(0);
  expect(model.sources.has(a)).toBe(false);expect(model.sources.get(b)).toEqual(hasSource?bSource:undefined);expect(model.drafts.get(b)).toEqual(before);
  fireEvent.click(screen.getByRole('button',{name:'Reload current draft'}));
  await waitFor(()=>expect(screen.getByTestId('draft-id').textContent).toBe(b));
  const extra=await screen.findByRole('checkbox',{name:'Select weekly/extra.csv'});
  expect((extra as HTMLInputElement).checked).toBe(hasSource);
  expect((screen.getByRole('checkbox',{name:'Select weekly/sales.csv'}) as HTMLInputElement).checked).toBe(false);
  expect(model.sourceReads).toContain(b);expect(model.writes).toHaveLength(0);expect(model.sources.get(b)).toEqual(hasSource?bSource:undefined);
  await select();save();
  await waitFor(()=>expect(model.sources.get(b)?.version).toBe(hasSource?2:1));
  expect(model.writes).toHaveLength(1);expect(model.writes[0]).toMatchObject({expected_current_draft_id:b,expected_version:hasSource?1:0});
  expect(model.writes[0]).not.toHaveProperty('draft_id');
});

it.each([false,true])('saves normally when the loaded draft and source pointer agree: guided=%s',async guided=>{
  const model=backend();model.createOrdinary(a);mount(true,guided);await select();save();
  await waitFor(()=>expect(model.sources.get(a)?.version).toBe(1));
  expect(model.writes).toHaveLength(1);expect(model.writes[0]).toMatchObject({expected_current_draft_id:a,expected_version:0});
});


it.each([false,true])('fences A while the successful PUT reports B and the draft reload is pending: guided=%s',async guided=>{
  const model=backend();model.createOrdinary(a);mount(true,guided);await select();
  let finishReload!:(draft:SavedListingDraft)=>void;
  let replacement!:SavedListingDraft;
  model.onSourceSave(()=>{
    replacement=model.createOrdinary(b);
    model.onDraftRead(()=>new Promise(resolve=>{finishReload=resolve;}));
  });
  save();
  await screen.findByRole('button',{name:'Reload current draft'});
  expect(screen.queryByRole('checkbox',{name:'Select weekly/sales.csv'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Confirm selection'})).toBeNull();
  expect(model.writes).toHaveLength(1);expect(model.sources.has(b)).toBe(false);
  model.onDraftRead(async()=>replacement);
  finishReload(replacement);
  const sales=await screen.findByRole('checkbox',{name:'Select weekly/sales.csv'});
  expect((sales as HTMLInputElement).checked).toBe(false);
  expect(screen.getByTestId('draft-id').textContent).toBe(b);
  expect(model.sourceReads).toContain(b);expect(model.sources.has(b)).toBe(false);expect(model.writes).toHaveLength(1);
});


it.each([false,true])('preserves B samples with zero writes through disagreement and reload: guided=%s',async guided=>{
  const model=backend();const original=model.createOrdinary(a);
  original.content={...original.content,sample_decision:'member_files',sample_object_indices:[0]};
  const bSource:SourceRead={version:7,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:[{...guidedObjects[0],key:'weekly/extra.csv'},...guidedObjects]}};
  let replacement!:SavedListingDraft;
  model.onSourceRead(id=>{
    if(id===a){
      const next=model.createOrdinary(b);
      next.content={...next.content,sample_decision:'member_files',sample_object_indices:[1]};
      replacement=structuredClone(next);
      model.sources.set(a,{version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:guidedObjects}});
      model.sources.set(b,bSource);
    }
  });
  mount(true,guided,true);
  await screen.findByRole('button',{name:'Reload current draft'});
  expect(model.writes).toHaveLength(0);expect(model.drafts.get(b)).toEqual(replacement);expect(model.sources.get(b)).toEqual(bSource);
  fireEvent.click(screen.getByRole('button',{name:'Reload current draft'}));
  const sample=await screen.findByRole('checkbox',{name:'Offer sales.csv (file 2) as free sample'});
  await waitFor(()=>{
    expect(screen.getByTestId('draft-id').textContent).toBe(b);
    expect(screen.getByTestId('draft-id').getAttribute('data-sample-decision')).toBe('member_files');
    expect(screen.getByTestId('draft-id').getAttribute('data-sample-indices')).toBe('[1]');
    expect(screen.getByTestId('draft-id').getAttribute('data-samples-blocked')).toBe('false');
  });
  expect((sample as HTMLInputElement).checked).toBe(true);
  expect(model.sourceReads).toContain(b);expect(model.writes).toHaveLength(0);
  expect(model.drafts.get(b)).toEqual(replacement);expect(model.sources.get(b)).toEqual(bSource);
  expect(model.drafts.get(a)).toEqual(original);
});
