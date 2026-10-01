// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {GuidedListingFlow,useListingFlow} from './GuidedListingFlow';
import {WorkspaceOverview} from './WorkspaceOverview';
import {categoryRows,guidedCapabilities,guidedConnection,emptyGuidedDraft} from '@/tests/guidedListingFixture';
import {createStandardSelection} from '@/api/listingLicenses';
const mocks=vi.hoisted(()=>({source:vi.fn(),categories:vi.fn(),review:vi.fn(),publication:vi.fn(),account:vi.fn(),load:vi.fn(),draft:null as unknown}));
vi.mock('@/api/sellerListingSource',()=>({readListingSource:mocks.source,readSellerCategories:mocks.categories}));
vi.mock('@/api/sellerListingReview',()=>({readListingReview:mocks.review}));
vi.mock('@/api/sellerListingPublication',()=>({readPublication:mocks.publication}));
vi.mock('@/api/capabilities',()=>({getCapabilities:mocks.account}));
vi.mock('./SellerListingDraftStore',()=>({useSellerListingDraft:()=>({draft:mocks.draft,requestLoad:mocks.load,selectionSavePending:false,selectionSaveFailed:false})}));
const source={version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,objects:[],version_mode:'current' as const}};
const navigate=vi.fn();
function Harness(){return <GuidedListingFlow capabilities={guidedCapabilities} connections={[guidedConnection]} view="manage" navigate={navigate}><WorkspaceOverview connections={[guidedConnection]} view="manage" onViewChange={navigate}/><Probe/></GuidedListingFlow>;}
function Probe(){const flow=useListingFlow();return <button onClick={()=>flow?.sourceSaved({...source,version:2})}>Save new files</button>;}
afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeEach(()=>{
 mocks.source.mockResolvedValue(source);mocks.categories.mockResolvedValue(categoryRows);mocks.account.mockResolvedValue({seller:{effective_status:'active'},next_action:null});
 mocks.draft={version:2,updated_at:'2026-10-01T00:00:00Z',content:{...emptyGuidedDraft,title:'Sales',description:'Sales description',description_source_version:1,category:'financial-data',tags:'sales',price:'25',license_selection:{...createStandardSelection(),seller_acceptance:{signer_name:'Sam',signer_title:'Owner',authority_confirmed:true}}}};
 mocks.review.mockResolvedValue({draft_version:2,source_version:1,missing_fields:[],approval:null});mocks.publication.mockResolvedValue({publication_available:true,publication:null});
});
describe('checklist reads owned at the workspace page',()=>{
 it('renders the six task tabs plus Your listings, and one next action on every tab including manage',async()=>{
  render(<Harness/>);const checklist=screen.getByRole('complementary',{name:'Listing checklist'});
  await waitFor(()=>expect(within(checklist).getByRole('button',{name:'Next: Review →'})).toBeTruthy());
  expect(within(checklist).getAllByRole('listitem')).toHaveLength(6);expect(within(within(checklist).getByRole('list')).getAllByText(/· Next/)).toHaveLength(1);
  const sections=screen.getByRole('navigation',{name:'Workspace sections'});expect(within(sections).getAllByRole('button').map(b=>b.textContent)).toEqual(['Connect your storage','Choose your files','Choose a licence','Describe and price','Review','Publish','Your listings']);
  fireEvent.click(within(checklist).getByRole('button',{name:'Next: Review →'}));expect(navigate).toHaveBeenCalledWith('review');expect(mocks.review).toHaveBeenCalledOnce();
  const collapse=within(checklist).getByRole('button',{name:/Listing checklist/});expect(collapse.getAttribute('aria-expanded')).toBe('false');fireEvent.click(collapse);expect(collapse.getAttribute('aria-expanded')).toBe('true');
 });
 it('shows server refusal and marks Describe and price as Next',async()=>{
  mocks.review.mockResolvedValue({draft_version:2,source_version:1,missing_fields:['tags'],approval:null});render(<Harness/>);
  const checklist=screen.getByRole('complementary',{name:'Listing checklist'});await waitFor(()=>expect(within(checklist).getByRole('button',{name:'Next: Describe and price →'})).toBeTruthy());expect(screen.getByText('Add at least one tag in Describe and price, then save.')).toBeTruthy();
 });
 it('shows publication and start another from the lifted publication read',async()=>{
  mocks.review.mockResolvedValue({draft_version:2,source_version:1,missing_fields:[],approval:{id:'a'}});mocks.publication.mockResolvedValue({publication_available:true,publication:{approval_id:'a',slug:'synthetic-sales'}});render(<Harness/>);
  expect((await screen.findByRole('link',{name:'Published: view your listing'})).getAttribute('href')).toBe('/listings/synthetic-sales');const checklist=screen.getByRole('complementary',{name:'Listing checklist'});expect(within(checklist).queryByRole('button',{name:/^Next:/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Start another listing'}));expect(navigate).toHaveBeenCalledWith('data');expect(mocks.publication).toHaveBeenCalledOnce();
 });
 it('adds account setup above storage and delegates to the unchanged setup bar next action',async()=>{
  mocks.account.mockResolvedValue({seller:{effective_status:'provisioning'},next_action:{capability:'seller',step:'totp_enabled'}});const listener=vi.fn();window.addEventListener('seller-setup:next',listener);render(<Harness/>);
  fireEvent.click(await screen.findByRole('link',{name:'Finish account setup: 2FA'}));expect(listener).toHaveBeenCalledOnce();window.removeEventListener('seller-setup:next',listener);
 });
 it('withdraws approval and publication on a new source, retaining a plain description warning',async()=>{
  mocks.review.mockResolvedValue({draft_version:2,source_version:1,missing_fields:[],approval:{id:'a'}});mocks.publication.mockResolvedValue({publication_available:true,publication:{approval_id:'a',slug:'synthetic-sales'}});render(<Harness/>);await screen.findByRole('link',{name:'Published: view your listing'});
  fireEvent.click(screen.getByRole('button',{name:'Save new files'}));await waitFor(()=>expect(screen.queryByRole('link',{name:'Published: view your listing'})).toBeNull());expect(screen.getByText(/Your files changed after this description was written/)).toBeTruthy();
 });
});
