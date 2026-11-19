// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AxiosError,type AxiosAdapter} from 'axios';
import {api} from '@/api/client';
import {nativeClient} from '@/api/connector-seller-settings';
import {EMPTY_LISTING_DRAFT,saveListingDraft,type SavedListingDraft} from '@/api/sellerListingDraft';
import type {SourceRead} from '@/api/sellerListingSource';
import {useAuthStore} from '@/store/auth';
import {guidedConnection,guidedObjects} from '@/tests/guidedListingFixture';
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import SavedWorkspaceData from './SavedWorkspaceData';

vi.mock('@/api/sellerWorkspace',async original=>({...await original<typeof import('@/api/sellerWorkspace')>(),
  listWorkspaceObjects:vi.fn(async()=>({objects:guidedObjects,next_cursor:null}))}));
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const org='00000000-0000-4000-8000-000000000003';
const token=`header.${btoa(JSON.stringify({sub:a,org_id:org,exp:4102444800}))}.signature`;
const originalApiAdapter=api.defaults.adapter,originalNativeAdapter=nativeClient.defaults.adapter;
beforeEach(()=>{useAuthStore.setState({token,user:{id:a} as never});resetSellerListingDraftOwnerForTests();});
afterEach(()=>{cleanup();api.defaults.adapter=originalApiAdapter;nativeClient.defaults.adapter=originalNativeAdapter;vi.restoreAllMocks();});

function backend(){
  // Model e0f06322: pointer precondition precedes creation/mutation, while
  // explicit draft_id alone enters native organization/lineage authorization.
  const drafts=new Map<string,SavedListingDraft & {organization_id:string|null}>();
  const sources=new Map<string,SourceRead>();
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
      if(config.url?.endsWith('/listing-draft'))data={draft:current?drafts.get(current):null};
      else if(config.url?.endsWith('/listing-source'))data={source:current?sources.get(current)??null:null};
      else throw new Error(`Unexpected GET ${config.url}`);
    }else{
      const body=JSON.parse(config.data);writes.push(body);
      if(config.url?.endsWith('/listing-draft')){
        expect(body.draft_id).toBeUndefined();
        const row=createOrdinary(a);row.content=body.content;data={draft:row};
      }else if(config.url?.endsWith('/listing-source')){
        const conflict=(code:string,message:string):never=>{throw new AxiosError('conflict','ERR_BAD_REQUEST',config,undefined,
          {status:409,statusText:'Conflict',headers:{},config,data:{detail:{code,message}}});};
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
        sources.set(current!,source);data={source};
      }else throw new Error(`Unexpected write ${config.url}`);
    }
    return {data,status:200,statusText:'OK',headers:{},config};
  };
  api.defaults.adapter=adapter;nativeClient.defaults.adapter=adapter;
  return {drafts,sources,writes,createOrdinary};
}
function mount(){return render(<SellerListingDraftProvider enabled sampleCapability={false}><SavedWorkspaceData enabled connections={[guidedConnection]}/></SellerListingDraftProvider>);}
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
