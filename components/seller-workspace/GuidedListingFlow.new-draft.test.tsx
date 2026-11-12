// @vitest-environment jsdom
import {useState} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GuidedListingFlow,useListingFlow} from './GuidedListingFlow';
import {DraftChangedError,SellerListingDraftProvider,resetSellerListingDraftOwnerForTests,useSellerListingDraft} from './SellerListingDraftStore';
import SavedListingEditor from './SavedListingEditor';
import SavedLicenseStep from './SavedLicenseStep';
import SavedWorkspaceData from './SavedWorkspaceData';
import {api} from '@/api/client';
import {nativeClient} from '@/api/connector-seller-settings';
import {useAuthStore} from '@/store/auth';
import {sessionCsrf} from '@/lib/session-csrf';
import {EMPTY_LISTING_DRAFT} from '@/api/sellerListingDraft';
import {createStandardSelection} from '@/api/listingLicenses';
import {categoryRows,guidedCapabilities,guidedConnection} from '@/tests/guidedListingFixture';
const mocks=vi.hoisted(()=>({source:vi.fn(),review:vi.fn(),publication:vi.fn(),categories:vi.fn(),account:vi.fn()}));
const sampleObject=vi.hoisted(()=>({key:'data/example.csv',version_id:null,etag:'example',size:42,last_modified:null,format_candidate:'csv'}));
vi.mock('@/api/sellerWorkspace',async original=>({...await original<object>(),listWorkspaceObjects:vi.fn(async()=>({objects:[sampleObject],next_cursor:null}))}));
vi.mock('@/api/sellerLegalIdentity',async original=>({...await original<object>(),getSellerLegalIdentity:vi.fn(async()=>({status:'known',source:'stripe_connect',legal_name:'Sam Seller Ltd',jurisdiction:'US',version:4,seller_editable:false}))}));
vi.mock('@/api/sellerListingSource',()=>({readListingSource:mocks.source,readSellerCategories:mocks.categories}));
vi.mock('@/api/sellerListingReview',async original=>({...await original<object>(),readListingReview:mocks.review}));
vi.mock('@/api/sellerListingPublication',()=>({readPublication:mocks.publication}));
vi.mock('@/api/capabilities',()=>({getCapabilities:mocks.account}));
const oldDraft={draft_id:'00000000-0000-4000-8000-000000000002',version:4,updated_at:'2026-10-01T00:00:00Z',content:{...EMPTY_LISTING_DRAFT,title:'Old listing',description_source_version:1,description:'Description',category:'financial-data',tags:'sales',price:'25',license_selection:{...createStandardSelection(),seller_acceptance:{signer_name:'Sam',signer_title:'Owner',authority_confirmed:true}}}};
const newDraft={draft_id:'00000000-0000-4000-8000-000000000003',version:1,updated_at:'2026-11-01T00:00:00Z',content:EMPTY_LISTING_DRAFT};
const navigate=vi.fn();
let store:ReturnType<typeof useSellerListingDraft>;
function Probe(){
 store=useSellerListingDraft();const flow=useListingFlow();const [local,setLocal]=useState('');
 return <><input aria-label="Local file choice" value={local} onChange={e=>{setLocal(e.target.value);flow?.setFilesDirty(true);flow?.setLicenceDirty(true);}}/>
 <button onClick={flow?.startAnotherListing}>Start from panel</button>
 <output aria-label="Draft identity">{store.draft?.draft_id}</output><output aria-label="Licence saved">{store.draft?.content.license_selection?'yes':'no'}</output>
 <output aria-label="Source saved">{flow?.source?'yes':'no'}</output><output aria-label="Review saved">{flow?.review?'yes':'no'}</output></>;
}
function Harness({panels=false}:{panels?:boolean}){return <SellerListingDraftProvider enabled sampleCapability><GuidedListingFlow capabilities={guidedCapabilities} connections={[guidedConnection]} view="listing" navigate={navigate}><Probe/><SavedListingEditor active/>{panels&&<><SavedLicenseStep/><SavedWorkspaceData enabled connections={[guidedConnection]}/></>}</GuidedListingFlow></SellerListingDraftProvider>;}
beforeEach(()=>{
 resetSellerListingDraftOwnerForTests();useAuthStore.setState({token:'native-test-session'});
 vi.spyOn(api,'get').mockResolvedValue({data:{draft:oldDraft}});
 mocks.source.mockImplementation(async(id?:string)=>id===newDraft.draft_id?null:{version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,objects:[sampleObject],version_mode:'current'}});
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
 expect(screen.getByLabelText('Title').matches(':disabled')).toBe(true);
 await act(async()=>finish({data:{draft:newDraft}}));
 await waitFor(()=>expect(navigate).toHaveBeenCalledWith('data'));
 expect(screen.getByLabelText('Draft identity').textContent).toBe(newDraft.draft_id);
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
 expect(screen.getByLabelText('Licence saved').textContent).toBe('no');
 expect(screen.getByLabelText('Source saved').textContent).toBe('no');
 expect(screen.getByLabelText('Review saved').textContent).toBe('no');
 expect(screen.queryByRole('link',{name:'Published: view your listing'})).toBeNull();
 expect(post).toHaveBeenCalledOnce();
 expect(screen.getByLabelText('Title').matches(':disabled')).toBe(false);
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

it.each([1,oldDraft.version])('discards queued old licence, signer, samples and fields after delayed creation (new version %s)',async version=>{
 let finish!:(value:unknown)=>void;
 vi.spyOn(nativeClient,'post').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const put=vi.spyOn(api,'put');
 render(<Harness/>);await screen.findByRole('link',{name:'Published: view your listing'});
 const oldStore=store;
 fireEvent.click(screen.getByRole('button',{name:'Start another listing'}));
 await waitFor(()=>expect(nativeClient.post).toHaveBeenCalledOnce());
 // Exercise the store directly, including a caller admitted just before the
 // pending fieldset could prevent submission.
 const results=Promise.allSettled([
   oldStore.saveLicenseSelection(oldDraft.content.license_selection),
   oldStore.saveSamples([0]),
   oldStore.saveListingFields(oldDraft.content),
 ]);
 await act(async()=>{finish({data:{draft:{...newDraft,version}}});await results;});
 expect((await results).map(result=>result.status)).toEqual(['rejected','rejected','rejected']);
 for(const result of await results)if(result.status==='rejected')expect(result.reason).toBeInstanceOf(DraftChangedError);
 expect(put).not.toHaveBeenCalled();expect(store.draft).toEqual({...newDraft,version});
 expect(store.selectionSavePending).toBe(false);expect(store.selectionSaveFailed).toBe(false);
 // A retained old-panel callback is still bound after the transition.
 await expect(oldStore.saveLicenseSelection(oldDraft.content.license_selection)).rejects.toBeInstanceOf(DraftChangedError);
 await expect(oldStore.saveSamples([0])).rejects.toBeInstanceOf(DraftChangedError);
 expect(put).not.toHaveBeenCalled();
 const content={...EMPTY_LISTING_DRAFT,title:'New listing',description_source_version:null};
 put.mockResolvedValue({data:{draft:{...newDraft,version:version+1,content}}});
 await act(async()=>{await store.saveListingFields(content);});
 expect(put).toHaveBeenCalledExactlyOnceWith('/seller-workspace/listing-draft',{
   content,expected_version:version,request_id:expect.any(String),
 });
 expect(store.selectionSavePending).toBe(false);expect(store.selectionSaveFailed).toBe(false);
});

it('disables licence, sample and source controls during creation and restores them after a failure',async()=>{
 let reject!:(error:unknown)=>void;
 vi.spyOn(nativeClient,'post').mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));
 const put=vi.spyOn(api,'put');
 render(<Harness panels/>);await screen.findByRole('link',{name:'Published: view your listing'});
 const sample=await screen.findByRole('checkbox',{name:/Offer example.csv.*free sample/});
 const signer=screen.getByLabelText('Signer full name');
 const source=screen.getByRole('checkbox',{name:'Select data/example.csv'});
 await waitFor(()=>expect(signer.matches(':disabled')).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Start from panel'}));
 await waitFor(()=>expect(nativeClient.post).toHaveBeenCalledOnce());
 for(const control of [sample,signer,source])expect(control.matches(':disabled')).toBe(true);
 fireEvent.click(sample);fireEvent.click(source);
 expect(put).not.toHaveBeenCalled();
 await act(async()=>reject(new Error('offline')));
 for(const control of [sample,signer,source])expect(control.matches(':disabled')).toBe(false);
 expect(store.draft).toEqual(oldDraft);
});

it('adopts the backend result when an untouched new draft is movable again',async()=>{
 vi.spyOn(nativeClient,'post').mockResolvedValueOnce({data:{draft:newDraft}}).mockResolvedValueOnce({data:{draft:{...newDraft,draft_id:'next-empty-draft'}}});
 render(<Harness/>);await screen.findByRole('link',{name:'Published: view your listing'});
 fireEvent.click(screen.getByRole('button',{name:'Start from panel'}));
 await waitFor(()=>expect(store.draft?.draft_id).toBe(newDraft.draft_id));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Start from panel'}).matches(':disabled')).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Start from panel'}));
 await waitFor(()=>expect(store.draft?.draft_id).toBe('next-empty-draft'));
 expect(nativeClient.post).toHaveBeenCalledTimes(2);expect(store.draft?.content).toEqual(EMPTY_LISTING_DRAFT);
});

it.each(['UNAVAILABLE',{code:'UNAVAILABLE'}])('falls back to legacy in-place editing for 404 %j without resetting state',async detail=>{
 vi.spyOn(nativeClient,'post').mockRejectedValue({isAxiosError:true,response:{status:404,data:{detail}}});
 render(<Harness/>);await screen.findByRole('link',{name:'Published: view your listing'});
 fireEvent.change(screen.getByLabelText('Local file choice'),{target:{value:'keep these files'}});
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Keep my edits'}});
 const before=store.draft;
 fireEvent.click(screen.getByRole('button',{name:'Start from panel'}));
 await waitFor(()=>expect(navigate).toHaveBeenCalledWith('data'));
 expect(store.draft).toEqual(before);
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Keep my edits');
 expect((screen.getByLabelText('Local file choice') as HTMLInputElement).value).toBe('keep these files');
 expect(screen.getByLabelText('Source saved').textContent).toBe('yes');
 expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByLabelText('Title').matches(':disabled')).toBe(false);
});

it.each([[404,'NOT_FOUND'],[503,'UNAVAILABLE']])('keeps unrelated failure %s %s on the current screen',async(status,detail)=>{
 vi.spyOn(nativeClient,'post').mockRejectedValue({isAxiosError:true,response:{status,data:{detail}}});
 render(<Harness/>);await screen.findByRole('link',{name:'Published: view your listing'});
 fireEvent.click(screen.getByRole('button',{name:'Start another listing'}));
 expect((await screen.findByRole('alert')).textContent).toContain("We couldn't start a new listing.");
 expect(navigate).not.toHaveBeenCalled();expect(store.draft).toEqual(oldDraft);
 expect(screen.getByLabelText('Title').matches(':disabled')).toBe(false);
});
