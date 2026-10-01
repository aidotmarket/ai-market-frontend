// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {useState} from 'react';
import {AxiosError} from 'axios';
import type {WorkspaceView} from './WorkspaceOverview';
import SavedListingEditor from './SavedListingEditor';
import SavedLicenseStep from './SavedLicenseStep';
import SellerReview from './SellerReview';
import {GuidedListingFlow,useListingFlow} from './GuidedListingFlow';
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import {categoryRows,guidedCapabilities,guidedConnection,emptyGuidedDraft} from '@/tests/guidedListingFixture';
import {createStandardSelection} from '@/api/listingLicenses';
const mocks=vi.hoisted(()=>({get:vi.fn(),draft:vi.fn(),save:vi.fn(),review:vi.fn()}));
vi.mock('@/api/client',()=>({api:{get:mocks.get}}));
vi.mock('@/api/sellerListingDraft',()=>({readListingDraft:mocks.draft,saveListingDraft:mocks.save}));
vi.mock('@/api/sellerListingReview',async original=>({...await original<typeof import('@/api/sellerListingReview')>(),readListingReview:mocks.review}));
vi.mock('@/api/capabilities',()=>({getCapabilities:vi.fn().mockResolvedValue({})}));
vi.mock('@/api/sellerLegalIdentity',async original=>({...await original<typeof import('@/api/sellerLegalIdentity')>(),getSellerLegalIdentity:vi.fn().mockResolvedValue({status:'known',source:'stripe_connect',legal_name:'Synthetic Seller',jurisdiction:'ES',version:1})}));
const source={version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,objects:[],version_mode:'current' as const}};
const draft={version:1,updated_at:'now',content:{...emptyGuidedDraft,title:'Sales',description:'Sales description',description_source_version:1,category:'financial-data',tags:'sales',price:'25',license_selection:{...createStandardSelection(),seller_acceptance:{signer_name:'Sam',signer_title:'Owner',authority_confirmed:true}}}};
function Probe(){const flow=useListingFlow()!;return <><SellerReview active enabled/><output data-testid="completion">{flow.steps[3].state}</output></>;}
function start(){render(<SellerListingDraftProvider enabled sampleCapability={false}><GuidedListingFlow capabilities={guidedCapabilities} connections={[guidedConnection]} view="review" navigate={()=>{}}><Probe/></GuidedListingFlow></SellerListingDraftProvider>);}
async function readyApproval(){
 await screen.findByRole('button',{name:'Approve this review'});fireEvent.load(screen.getByTitle('Saved listing buyers would see'));screen.getAllByRole('checkbox').forEach(box=>fireEvent.click(box));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Approve this review'}) as HTMLButtonElement).disabled).toBe(false));
}
beforeEach(()=>{resetSellerListingDraftOwnerForTests();mocks.get.mockImplementation(async url=>({data:url.endsWith('categories')?categoryRows:{source}}));mocks.draft.mockResolvedValue(draft);mocks.review.mockResolvedValue({approval_available:true,review_hash:'r',render_hash:'r',rendered_html:'<p>Saved listing</p>',confirmation_statements:{},draft_version:1,source_version:1,missing_fields:[],approval:null});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('reloads an externally changed source and draft on Review refresh and blocks a stale description',async()=>{
 start();await readyApproval();expect(screen.getByTestId('completion').textContent).toBe('done');
 let finishSource!:(value:unknown)=>void;
 mocks.get.mockImplementation(url=>url.endsWith('categories')?Promise.resolve({data:categoryRows}):new Promise(resolve=>{finishSource=resolve;}));
 mocks.draft.mockResolvedValue({...draft,version:2});mocks.review.mockResolvedValue({approval_available:true,review_hash:'r',render_hash:'r',rendered_html:'<p>Saved listing</p>',confirmation_statements:{},draft_version:2,source_version:2,missing_fields:[],approval:null});
 fireEvent.click(screen.getByRole('button',{name:'Refresh saved review'}));
 await waitFor(()=>expect(screen.getAllByText(/The saved review changed elsewhere/).length).toBeGreaterThan(0));expect((screen.getByRole('button',{name:'Approve this review'}) as HTMLButtonElement).disabled).toBe(true);
 await waitFor(()=>expect(finishSource).toBeTruthy());finishSource({data:{source:{...source,version:2}}});
 await waitFor(()=>expect(screen.getAllByText(/Your files changed after this description/).length).toBeGreaterThan(0));expect(screen.getByTestId('completion').textContent).not.toBe('done');expect(mocks.draft).toHaveBeenCalledTimes(2);expect(mocks.save).not.toHaveBeenCalled();
});
it('withdraws step 4 for a refreshed missing-fields refusal after an external draft change',async()=>{
 start();await readyApproval();expect(screen.getByTestId('completion').textContent).toBe('done');
 mocks.draft.mockResolvedValue({...draft,version:2});mocks.review.mockResolvedValue({approval_available:true,review_hash:'r',render_hash:'r',rendered_html:'<p>Saved listing</p>',confirmation_statements:{},draft_version:2,source_version:1,missing_fields:['tags'],approval:null});
 fireEvent.click(screen.getByRole('button',{name:'Refresh saved review'}));
 await waitFor(()=>expect(screen.getAllByText('Add at least one tag in Describe and price, then save.').length).toBeGreaterThan(0));expect(screen.getByTestId('completion').textContent).not.toBe('done');expect(screen.queryByRole('button',{name:'Approve this review'})).toBeNull();expect(mocks.draft).toHaveBeenCalledTimes(2);
});
it.each([{},[{slug:'x'}],[{slug:1,name:'Invalid'}]])('routes invalid category response %j through read recovery',async data=>{
 mocks.get.mockImplementation(async url=>({data:url.endsWith('categories')?data:{source}}));start();await screen.findByText(/Your saved files and category list could not be loaded/);expect(screen.getByTestId('completion').textContent).not.toBe('done');expect(mocks.save).not.toHaveBeenCalled();
});
it('keeps a pre-stamp existing approval visible without saving while step 4 asks for confirmation',async()=>{
 mocks.draft.mockResolvedValue({...draft,content:{...draft.content,description_source_version:null}});
 mocks.review.mockResolvedValue({approval_available:true,review_hash:'r',render_hash:'r',rendered_html:'<p>Saved listing</p>',confirmation_statements:{},draft_version:1,source_version:1,missing_fields:[],approval:{id:'existing'}});
 start();await screen.findByText('Review approved and saved.');expect(screen.getByTestId('completion').textContent).not.toBe('done');expect(screen.getAllByText(/Your files changed after this description/).length).toBeGreaterThan(0);expect(mocks.save).not.toHaveBeenCalled();
});
it('keeps approval blocked with a recovery reason when authoritative reload fails',async()=>{
 start();await readyApproval();expect(screen.getByTestId('completion').textContent).toBe('done');
 mocks.review.mockResolvedValue({approval_available:true,review_hash:'r2',render_hash:'r2',rendered_html:'<p>Saved listing</p>',confirmation_statements:{},draft_version:2,source_version:2,missing_fields:[],approval:null});mocks.get.mockRejectedValue(new Error('offline'));
 fireEvent.click(screen.getByRole('button',{name:'Refresh saved review'}));await waitFor(()=>expect(screen.getAllByText(/Your saved review could not be reconciled/).length).toBeGreaterThan(0));expect(screen.getByTestId('completion').textContent).not.toBe('done');expect((screen.getByRole('button',{name:'Approve this review'}) as HTMLButtonElement).disabled).toBe(true);expect(mocks.save).not.toHaveBeenCalled();
});

function MountedEditorFlow({withLicense=false}:{withLicense?:boolean}){
 const [view,setView]=useState<WorkspaceView>('listing');
 return <SellerListingDraftProvider enabled sampleCapability={false}><GuidedListingFlow capabilities={guidedCapabilities} connections={[guidedConnection]} view={view} navigate={setView}>
  <div hidden={view!=='listing'}><SavedListingEditor active={view==='listing'}/></div>
  {withLicense&&<div hidden={view!=='license'}><SavedLicenseStep/></div>}
  <div hidden={view!=='review'}><SellerReview active={view==='review'} enabled/></div>
 </GuidedListingFlow></SellerListingDraftProvider>;
}
it('advances a dirty mounted editor baseline after saving a licence without losing either edit',async()=>{
 mocks.draft.mockResolvedValue({...draft,content:{...draft.content,license_selection:{...draft.content.license_selection,identity_version:1}}});
 let version=1;
 mocks.save.mockImplementation(async(content,expectedVersion)=>{
  if(expectedVersion!==version)throw new AxiosError('Conflict',undefined,undefined,undefined,{status:409,data:{},headers:{},statusText:'Conflict',config:{} as never});
  const saved={version:++version,updated_at:'now',content};
  mocks.draft.mockResolvedValue(saved);
  mocks.review.mockResolvedValue({approval_available:true,review_hash:'r',render_hash:'r',rendered_html:'<p>Saved listing</p>',confirmation_statements:{},draft_version:version,source_version:1,missing_fields:[],approval:null});
  return saved;
 });
 render(<MountedEditorFlow withLicense/>);
 await screen.findByDisplayValue('Sales');
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'My dirty title'}});
 fireEvent.click(screen.getByRole('button',{name:/3\. Choose a licence/}));
 await screen.findByText('Legal name on the licence: Synthetic Seller (ES)');
 fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
 fireEvent.click(screen.getByRole('button',{name:'Save licence choice'}));
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Save licence choice'})).toBeNull());
 expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({title:'Sales',license_selection:expect.objectContaining({seller_acceptance:expect.objectContaining({signer_title:'Director'})})}),1,expect.any(String));
 fireEvent.click(screen.getByRole('button',{name:/4\. Describe and price/}));
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('My dirty title');
 fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(2));
 expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({title:'My dirty title',license_selection:mocks.save.mock.calls[0][0].license_selection}),2,expect.any(String));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Save private draft'})).toBeNull());
 expect(version).toBe(3);
});
async function refreshExternalTitle(){
 mocks.draft.mockResolvedValue({...draft,version:2,content:{...draft.content,title:'New external title'}});
 mocks.review.mockResolvedValue({approval_available:true,review_hash:'r2',render_hash:'r2',rendered_html:'<p>New external title</p>',confirmation_statements:{},draft_version:2,source_version:1,missing_fields:[],approval:null});
 fireEvent.click(screen.getByRole('button',{name:/5\. Review/}));
 fireEvent.click(await screen.findByRole('button',{name:'Refresh saved review'}));
 await waitFor(()=>expect(mocks.draft).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(screen.queryByText(/The saved review changed elsewhere/)).toBeNull());
 fireEvent.click(screen.getByRole('button',{name:/4\. Describe and price/}));
}
it('reconciles a pristine mounted editor and its baseline before saving a different field',async()=>{
 mocks.save.mockImplementation(async content=>({version:3,updated_at:'now',content}));
 render(<MountedEditorFlow/>);
 await screen.findByDisplayValue('Sales');
 expect(screen.queryByRole('button',{name:'Save private draft'})).toBeNull();
 await refreshExternalTitle();
 await screen.findByDisplayValue('New external title');
 expect(screen.queryByRole('button',{name:'Save private draft'})).toBeNull();
 fireEvent.change(screen.getByLabelText('Your price (USD)'),{target:{value:'30'}});
 fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
 expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({title:'New external title',price:'30'}),2,expect.any(String));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Save private draft'})).toBeNull());
 // A successful save advances the editor baseline for its next edit as well.
 fireEvent.change(screen.getByLabelText('Your price (USD)'),{target:{value:'35'}});
 fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(2));
 expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({title:'New external title',price:'35'}),3,expect.any(String));
});
it('keeps dirty mounted edits on their original baseline and conflicts instead of overwriting an external title',async()=>{
 let saved={...draft,version:2,content:{...draft.content,title:'New external title'}};
 mocks.save.mockImplementation(async(content,version)=>{
  if(version!==saved.version)throw new AxiosError('Conflict',undefined,undefined,undefined,{status:409,data:{},headers:{},statusText:'Conflict',config:{} as never});
  saved={...saved,version:version+1,content};return saved;
 });
 render(<MountedEditorFlow/>);
 await screen.findByDisplayValue('Sales');
 fireEvent.change(screen.getByLabelText('Your price (USD)'),{target:{value:'30'}});
 await refreshExternalTitle();
 expect((screen.getByLabelText('Title') as HTMLTextAreaElement).value).toBe('Sales');
 expect((screen.getByLabelText('Your price (USD)') as HTMLInputElement).value).toBe('30');
 fireEvent.change(screen.getByLabelText('Tags'),{target:{value:'edited tags'}});
 fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));
 await screen.findByText(/This draft was saved elsewhere\. Your edits are still here\./);
 expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({title:'Sales',price:'30',tags:'edited tags'}),1,expect.any(String));
 expect(saved.content.title).toBe('New external title');expect(saved.version).toBe(2);
 expect((screen.getByLabelText('Your price (USD)') as HTMLInputElement).value).toBe('30');
 expect(screen.getByRole('button',{name:'Save private draft'})).toBeTruthy();
});
