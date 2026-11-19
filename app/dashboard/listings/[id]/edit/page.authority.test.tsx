// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import EditListingPage from './page';
import VectoraizImport from '@/components/seller-workspace/VectoraizImport';
import {useAuthStore} from '@/store/auth';
import {VECTOR_ATTESTATION,VECTOR_NAMES} from '@/lib/vectoraizHandoff';
import type {AuthorityReview} from '@/api/sellerWorkspace';
const wire=vi.hoisted(()=>({get:vi.fn(),patch:vi.fn(),read:vi.fn(),write:vi.fn(),consume:vi.fn()}));
const router=vi.hoisted(()=>({push:vi.fn()}));
const toast=vi.hoisted(()=>vi.fn());
vi.mock('@/api/client',async original=>({...await original<typeof import('@/api/client')>(),api:{get:wire.get,patch:wire.patch}}));
vi.mock('@/api/connector-seller-settings',async original=>({...await original<typeof import('@/api/connector-seller-settings')>(),nativeRead:wire.read,nativeWrite:wire.write}));
vi.mock('@/lib/vectoraizHandoff',async original=>({...await original<typeof import('@/lib/vectoraizHandoff')>(),consumeHandoff:wire.consume}));
vi.mock('next/navigation',()=>({useParams:()=>({id:'listing-1'}),useRouter:()=>router}));
vi.mock('@/components/Toast',()=>({useToast:()=>({toast})}));
vi.mock('@/components/listings/SellerAtAGlance',()=>({default:()=>null}));
vi.mock('@/components/listings/SellerShareControls',()=>({default:()=>null}));
vi.mock('@/components/listing/ListingDocumentsEditor',()=>({default:()=>null}));
vi.mock('@/components/gateways/ListingGatewaySource',()=>({default:()=>null}));
const gatewayFiles=VECTOR_NAMES.map((name,i)=>({file_id:String(i),display_name:name.replace('examples/',''),size_bytes:10+i,present:true,changed_at:'2026-01-01',description:{state:'described',described_at:'2026-01-02',sha256:String(i).repeat(64)}}));
vi.mock('@/api/sellerGateways',()=>({
 listSellerGateways:async()=>[{gateway_id:'gateway',name:'My gateway',door_url:'https://neutral.example',gateway_metadata_revision:7}],
 readAuthorityGatewayFiles:async()=>({revision:7,files:gatewayFiles}),
}));
const version='00000000-0000-4000-8000-000000000002';
const draftId='00000000-0000-4000-8000-000000000001';
const listing={id:'listing-1',title:'Vector pack',description:'Useful vectors',category:'Technology',tags:[],status:'draft',price:10};
const review:AuthorityReview={authority_version_id:version,binding_hash:'binding',native_confirmed:true,purchaser_confirmed:true,
 public_review:{public_fields:{title:'Vector pack'},rendered_html:'',render_hash:'render',presentation_version:'seller-listing-review-v3-authority-vector-v1',inventory_version:'public-surface-inventory-v2'},
 purchaser_view:{door_host:'neutral.example',seller_attestation:VECTOR_ATTESTATION,files:[{file_id:'0',delivery_name:'chunks.parquet',size_bytes:10,columns:[{name:'value',type:'number'}]}]},purchaser_view_hash:'view',gateway_metadata_revision:7};
let ownerVersion:string|null,enabled:boolean,currentReview:AuthorityReview;
beforeEach(()=>{
 vi.clearAllMocks();sessionStorage.clear();ownerVersion=version;enabled=true;currentReview=review;
 useAuthStore.setState({user:{id:'seller'} as never,token:'token'});
 // Owner access-window GET and current draft use their actual HTTP envelopes.
 wire.get.mockImplementation(async(path:string)=>({data:path==='/listings/listing-1/access-window'?{listing_id:listing.id,access_window_days:7,authority_version_id:ownerVersion}:path==='/seller-workspace/listing-draft'?{draft:{draft_id:draftId,version:1,authority_version_id:ownerVersion,content:{brief:'',title:'Vector pack',description:'Useful vectors',category:'Technology',tags:'',price:'10',license:''},updated_at:'2026-11-19T00:00:00Z'}}:path==='/seller-workspace/capabilities'?{}:listing}));
 wire.read.mockImplementation(async(path:string)=>path==='/listing-authority/capabilities'?{import_enabled:enabled,contract_version:'listing-authority-v1',handoff_versions:[1]}:currentReview);
 wire.write.mockImplementation(async(path:string)=>{
  if(path==='/listing-authority/imports')return {import_id:draftId,draft_id:draftId,listing_id:'listing-1',authority_version_id:version};
  currentReview={...currentReview,purchaser_confirmed:true};return {event_id:'event',authority_version_id:currentReview.authority_version_id};
 });
 wire.consume.mockResolvedValue(null);
});
afterEach(cleanup);
it('import → Continue editing → refresh without receipt → metadata change → reconfirm buyer names',async()=>{
 wire.consume.mockResolvedValueOnce({handoff:{version:1,pack_id:draftId,draft:{title:'Vector pack',description:'Useful vectors',brief:'',category:'Technology',tags:''},files:gatewayFiles.map(f=>({size:f.size_bytes,sha256:f.description.sha256}))},encoded:'compressed',expires:Date.now()+60000,account:'seller',route:'/dashboard/gateways',key:draftId});
 const importer=render(<VectoraizImport mode="gateway"/>);
 await screen.findByRole('option',{name:'My gateway'});
 fireEvent.click(screen.getByRole('button',{name:'Check uploaded files'}));
 await screen.findByLabelText(/Import for my signed-in account/);
 fireEvent.click(screen.getByLabelText(/Import for my signed-in account/));fireEvent.click(screen.getByLabelText(/I reviewed this draft/));
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));
 const link=await screen.findByRole('link',{name:'Continue editing the listing'});
 expect(link.getAttribute('href')).toBe('/dashboard/listings/listing-1/edit');
 importer.unmount();
 const editor=render(<EditListingPage/>);await screen.findByText('Buyer names confirmed.');
 expect(wire.get).toHaveBeenCalledWith('/listings/listing-1/access-window',{adapter:'fetch',fetchOptions:{cache:'no-store'}});
 editor.unmount();sessionStorage.clear();render(<EditListingPage/>);await screen.findByText('Buyer names confirmed.');
 // A gateway-only change yields a new review version but retains native consent.
 currentReview={...review,authority_version_id:'00000000-0000-4000-8000-000000000003',binding_hash:'next-binding',purchaser_confirmed:false,purchaser_view_hash:'next-view',gateway_metadata_revision:8,
 purchaser_view:{...review.purchaser_view!,files:[{...review.purchaser_view!.files[0],delivery_name:'renamed.parquet'}]}};
 fireEvent.click(screen.getByRole('button',{name:'Refresh review'}));await screen.findByText('renamed.parquet');
 expect(screen.getByText('Pack review confirmed.')).toBeTruthy();
 const panel=within(screen.getByRole('region',{name:'vectorAIz review'}));
 const confirm=panel.getByRole('button',{name:'Confirm buyer names'}) as HTMLButtonElement;expect(confirm.disabled).toBe(true);
 fireEvent.click(panel.getByLabelText('I reviewed the names my buyer will see.'));fireEvent.click(confirm);
 await screen.findByText('Buyer names confirmed.');
 expect(wire.write).toHaveBeenLastCalledWith('/listing-authority/versions/'+currentReview.authority_version_id+'/confirm-purchaser',expect.objectContaining({authority_version_id:currentReview.authority_version_id,expected_binding_hash:'next-binding',gateway_metadata_revision:8,view_hash:'next-view',confirmed:true}));
 expect(wire.write.mock.calls.filter(([path])=>path.includes('confirm-native'))).toHaveLength(0);
});
it.each(['null','disabled','foreign'] as const)('shows no new review for %s owner recovery',async kind=>{
 if(kind==='null')ownerVersion=null;if(kind==='disabled')enabled=false;
 if(kind==='foreign')wire.get.mockImplementation(async(path:string)=>{if(path==='/listings/listing-1/access-window')throw {response:{status:404}};return {data:path==='/seller-workspace/capabilities'?{}:{...listing,authority_version_id:version}};});
 render(<EditListingPage/>);await screen.findByRole('button',{name:'Save Draft'});await act(async()=>{});
 expect(screen.queryByRole('region',{name:'vectorAIz review'})).toBeNull();
 expect(wire.read.mock.calls.some(([path])=>path.includes('/review'))).toBe(false);
});
it('an access-window PATCH without an authority field leaves the recovered GET review intact',async()=>{
 render(<EditListingPage/>);await screen.findByText('Buyer names confirmed.');
 wire.patch.mockResolvedValueOnce({data:{listing_id:'listing-1',access_window_days:30}});
 const {updateListingAccessWindow}=await import('@/api/listings');
 await act(async()=>{await updateListingAccessWindow('listing-1',30);});
 expect(screen.getByText('Buyer names confirmed.')).toBeTruthy();
 expect(wire.get.mock.calls.filter(([path])=>path==='/listings/listing-1/access-window')).toHaveLength(1);
 expect(wire.get.mock.calls.some(([path])=>path==='/listings/mine')).toBe(false);
});
it('a superseded import has a null owner version even with an older session receipt',async()=>{
 ownerVersion=null;
 const {saveAuthorityReceipt}=await import('@/lib/vectoraizHandoff');
 saveAuthorityReceipt('seller',{import_id:draftId,draft_id:draftId,listing_id:'listing-1',authority_version_id:version});
 render(<EditListingPage/>);await screen.findByRole('button',{name:'Save Draft'});
 await waitFor(()=>expect(wire.get).toHaveBeenCalledWith('/listings/listing-1/access-window',expect.anything()));
 await act(async()=>{});
 expect(screen.queryByRole('region',{name:'vectorAIz review'})).toBeNull();
 expect(wire.read.mock.calls.some(([path])=>path.includes('/review'))).toBe(false);
});
