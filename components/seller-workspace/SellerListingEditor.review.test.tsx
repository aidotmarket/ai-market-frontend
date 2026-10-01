// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {GuidedListingFlow} from './GuidedListingFlow';
import SavedListingEditor from './SavedListingEditor';
import SellerReview from './SellerReview';
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import {categoryRows,guidedCapabilities,guidedConnection,emptyGuidedDraft} from '@/tests/guidedListingFixture';
import type {SavedListingDraft} from '@/api/sellerListingDraft';
const mocks=vi.hoisted(()=>({source:vi.fn(),categories:vi.fn(),review:vi.fn(),publication:vi.fn(),account:vi.fn(),read:vi.fn(),save:vi.fn()}));
vi.mock('@/api/sellerListingSource',()=>({readListingSource:mocks.source,readSellerCategories:mocks.categories}));
vi.mock('@/api/sellerListingDraft',()=>({readListingDraft:mocks.read,saveListingDraft:mocks.save}));
vi.mock('@/api/sellerListingReview',async original=>({...await original<object>(),readListingReview:mocks.review}));
vi.mock('@/api/sellerListingPublication',()=>({readPublication:mocks.publication}));
vi.mock('@/api/capabilities',()=>({getCapabilities:mocks.account}));
afterEach(()=>{cleanup();resetSellerListingDraftOwnerForTests();vi.resetAllMocks();});
it.each([false,true])('shows an accepted and saved title in Review; repeated stale response: %s',async repeated=>{
 let saved:SavedListingDraft={version:1,updated_at:'2026-10-01T00:00:00Z',content:{...emptyGuidedDraft,brief:'Weekly sales',title:'Old title',description:'Regional sales',description_source_version:1,category:'financial-data',tags:'sales',price:'25'}};
 const source={version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,objects:[],version_mode:'current'}};
 mocks.source.mockResolvedValue(source);mocks.categories.mockResolvedValue(categoryRows);mocks.account.mockResolvedValue({seller:{effective_status:'active'}});
 mocks.read.mockImplementation(async()=>saved);
 mocks.save.mockImplementation(async content=>{saved={...saved,version:2,content};return saved;});
 const review=(title:string,version:number)=>({draft_version:version,source_version:1,render_hash:title,review_hash:title,rendered_html:`<h1>${title}</h1>`,missing_fields:[],approval_available:false});
 const old=review('Old title',1);
 let release!:(value:typeof saved)=>void;
 mocks.review.mockResolvedValue(old);
 render(<SellerListingDraftProvider enabled sampleCapability={false}><GuidedListingFlow capabilities={{...guidedCapabilities,listing_licenses:false}} connections={[guidedConnection]} view="listing" navigate={vi.fn()}><SavedListingEditor active assistant={async()=>({source_version:1,message:'New suggestion',proposals:[{field:'title',value:'Accepted title',reasoning:''}]})}/><SellerReview active enabled/></GuidedListingFlow></SellerListingDraftProvider>);
 await screen.findByTitle('Saved listing buyers would see');
 fireEvent.click(screen.getByRole('button',{name:'Ask Allai to draft my listing'}));await screen.findByText('New suggestion');fireEvent.click(screen.getByRole('button',{name:'Use suggestion'}));
 mocks.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));
 await waitFor(()=>expect(saved.content.title).toBe('Accepted title'));
 await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(2));
 expect(screen.queryByTitle('Saved listing buyers would see')).toBeNull();
 if(!repeated)mocks.review.mockResolvedValue(review('Accepted title',2));
 await act(async()=>release({...saved}));
 if(repeated){
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The saved review is still out of date. Refresh Review to load your saved changes.');
  expect(screen.queryByTitle('Saved listing buyers would see')).toBeNull();
  mocks.review.mockResolvedValue(review('Accepted title',2));fireEvent.click(screen.getByRole('button',{name:'Refresh saved review'}));
 }
 await waitFor(()=>expect(screen.getByTitle('Saved listing buyers would see').getAttribute('srcdoc')).toBe('<h1>Accepted title</h1>'));
 expect(mocks.save.mock.calls[0][0].title).toBe('Accepted title');
});
