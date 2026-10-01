// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
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
