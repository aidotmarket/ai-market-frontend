// @vitest-environment jsdom
import {useState} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GuidedListingFlow,useListingFlow} from './GuidedListingFlow';
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests,useSellerListingDraft} from './SellerListingDraftStore';
import SavedListingEditor from './SavedListingEditor';
import {api} from '@/api/client';
import {nativeClient} from '@/api/connector-seller-settings';
import {useAuthStore} from '@/store/auth';
import {sessionCsrf} from '@/lib/session-csrf';
import {EMPTY_LISTING_DRAFT} from '@/api/sellerListingDraft';
import {createStandardSelection} from '@/api/listingLicenses';
import {categoryRows,guidedCapabilities,guidedConnection} from '@/tests/guidedListingFixture';
const mocks=vi.hoisted(()=>({source:vi.fn(),review:vi.fn(),publication:vi.fn(),categories:vi.fn(),account:vi.fn()}));
vi.mock('@/api/sellerListingSource',()=>({readListingSource:mocks.source,readSellerCategories:mocks.categories}));
vi.mock('@/api/sellerListingReview',async original=>({...await original<object>(),readListingReview:mocks.review}));
vi.mock('@/api/sellerListingPublication',()=>({readPublication:mocks.publication}));
vi.mock('@/api/capabilities',()=>({getCapabilities:mocks.account}));
const oldDraft={draft_id:'00000000-0000-4000-8000-000000000002',version:4,updated_at:'2026-10-01T00:00:00Z',content:{...EMPTY_LISTING_DRAFT,title:'Old listing',description_source_version:1,description:'Description',category:'financial-data',tags:'sales',price:'25',license_selection:{...createStandardSelection(),seller_acceptance:{signer_name:'Sam',signer_title:'Owner',authority_confirmed:true}}}};
const newDraft={draft_id:'00000000-0000-4000-8000-000000000003',version:1,updated_at:'2026-11-01T00:00:00Z',content:EMPTY_LISTING_DRAFT};
const navigate=vi.fn();
function Probe(){
 const store=useSellerListingDraft();const flow=useListingFlow();const [local,setLocal]=useState('');
 return <><input aria-label="Local file choice" value={local} onChange={e=>{setLocal(e.target.value);flow?.setFilesDirty(true);flow?.setLicenceDirty(true);}}/>
 <output aria-label="Draft identity">{store.draft?.draft_id}</output><output aria-label="Licence saved">{store.draft?.content.license_selection?'yes':'no'}</output>
 <output aria-label="Source saved">{flow?.source?'yes':'no'}</output><output aria-label="Review saved">{flow?.review?'yes':'no'}</output></>;
}
function Harness(){return <SellerListingDraftProvider enabled sampleCapability={false}><GuidedListingFlow capabilities={guidedCapabilities} connections={[guidedConnection]} view="listing" navigate={navigate}><Probe/><SavedListingEditor active/></GuidedListingFlow></SellerListingDraftProvider>;}
beforeEach(()=>{
 resetSellerListingDraftOwnerForTests();useAuthStore.setState({token:'native-test-session'});
 vi.spyOn(api,'get').mockResolvedValue({data:{draft:oldDraft}});
 mocks.source.mockImplementation(async(id?:string)=>id===newDraft.draft_id?null:{version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,objects:[],version_mode:'current'}});
 mocks.categories.mockResolvedValue(categoryRows);mocks.account.mockResolvedValue({seller:{effective_status:'active'}});
 mocks.review.mockResolvedValue({draft_version:4,source_version:1,missing_fields:[],approval:{id:'approval'}});
 mocks.publication.mockResolvedValue({publication_available:true,publication:{slug:'old-listing',approval_id:'approval'}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();resetSellerListingDraftOwnerForTests();});
it('posts one native new-draft request, adopts its content and resets panels before navigating to data',async()=>{
 let finish!:(value:unknown)=>void;
 const post=vi.spyOn(nativeClient,'post').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<Harness/>);await screen.findByRole('link',{name:'Published: view your listing'});
 fireEvent.click(screen.getByRole('button',{name:'Start another listing'}));
 await waitFor(()=>expect(post).toHaveBeenCalledOnce());
 const [path,body,config]=post.mock.calls[0];
 expect(path).toBe('/seller-workspace/listing-drafts');
 expect(body).toEqual({request_id:expect.stringMatching(/^[a-f0-9-]{36}$/),content:EMPTY_LISTING_DRAFT,csrf:sessionCsrf('native-test-session')});
 expect(config?.headers).toMatchObject({'X-CSRF-Token':sessionCsrf('native-test-session')});
 expect(navigate).not.toHaveBeenCalled();expect(screen.getByRole('link',{name:'Published: view your listing'})).toBeTruthy();
 await act(async()=>finish({data:{draft:newDraft}}));
 await waitFor(()=>expect(navigate).toHaveBeenCalledWith('data'));
 expect(screen.getByLabelText('Draft identity').textContent).toBe(newDraft.draft_id);
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
 expect(screen.getByLabelText('Licence saved').textContent).toBe('no');
 expect(screen.getByLabelText('Source saved').textContent).toBe('no');
 expect(screen.getByLabelText('Review saved').textContent).toBe('no');
 expect(screen.queryByRole('link',{name:'Published: view your listing'})).toBeNull();
 expect(post).toHaveBeenCalledOnce();
});
it('offers Start another listing on a published-draft save and clears dirty file and licence state',async()=>{
 const message='This listing is already published. Use Start another listing to begin a new one.';
 vi.spyOn(api,'put').mockRejectedValue({isAxiosError:true,response:{status:409,data:{detail:{code:'DRAFT_ALREADY_PUBLISHED',message}}}});
 vi.spyOn(nativeClient,'post').mockResolvedValue({data:{draft:newDraft}});
 render(<Harness/>);await screen.findByRole('link',{name:'Published: view your listing'});
 fireEvent.change(screen.getByLabelText('Local file choice'),{target:{value:'old file'}});
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Changed'}});
 fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));
 const alert=await screen.findByRole('alert');expect(alert.textContent).toBe(message+' Start another listing');
 expect(alert.textContent).not.toContain('[object Object]');expect(alert.textContent).not.toContain('{');
 expect(screen.queryByRole('button',{name:/refresh/i})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Start another listing'}));
 await waitFor(()=>expect(navigate).toHaveBeenCalledWith('data'));
 expect((screen.getByLabelText('Local file choice') as HTMLInputElement).value).toBe('');
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
});
