// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SellerListingDraftProvider,useSellerListingDraft,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import type {AuthorityImportRequest} from '@/api/sellerWorkspace';
const api=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),import:vi.fn(),create:vi.fn()}));
vi.mock('@/api/sellerListingDraft',()=>({readListingDraft:api.read,saveListingDraft:api.save,createListingDraft:api.create}));
vi.mock('@/api/sellerWorkspace',()=>({importAuthorityDraft:api.import}));
const fields={brief:'',title:'Existing',description:'Description',category:'Technology',tags:'',price:'',license:''};
const initial={draft_id:'original',version:1,content:fields,updated_at:''};
const imported={draft_id:'imported',version:1,content:{...fields,title:'Imported'},updated_at:''};
const receipt={import_id:'marker',draft_id:'imported',authority_version_id:'version',listing_id:null};
let store:ReturnType<typeof useSellerListingDraft>,result:Promise<unknown>;
function Consumer(){store=useSellerListingDraft();return <><p>{store.draft?.content.title}</p><button onClick={()=>{result=store.importDraft({} as AuthorityImportRequest);}}>Import</button></>;}
beforeEach(()=>{resetSellerListingDraftOwnerForTests();api.read.mockReset().mockResolvedValue(initial);api.import.mockReset().mockResolvedValue(receipt);api.save.mockReset();});
afterEach(()=>cleanup());
async function mount(){render(<SellerListingDraftProvider enabled sampleCapability={false}><Consumer/></SellerListingDraftProvider>);await screen.findByText('Existing');}
it('adopts the backend current pointer and retires callbacks captured for the old draft',async()=>{
 await mount();const saveOld=store.saveListingFields;
 api.read.mockResolvedValueOnce(imported);fireEvent.click(screen.getByRole('button',{name:'Import'}));await act(async()=>{await result;});
 await screen.findByText('Imported');await expect(saveOld(fields)).rejects.toThrow('changed');expect(api.save).not.toHaveBeenCalled();
});
it('duplicate receipts do not rewind a later current pointer locally',async()=>{
 await mount();api.read.mockResolvedValueOnce({...initial,draft_id:'later',content:{...fields,title:'Later draft'}});
 fireEvent.click(screen.getByRole('button',{name:'Import'}));await act(async()=>{expect(await result).toEqual(receipt);});
 await screen.findByText('Later draft');expect(store.draft?.draft_id).toBe('later');
});
it('does not replace current state or read a different draft on a refused import',async()=>{
 await mount();api.import.mockRejectedValueOnce(new Error('refused'));fireEvent.click(screen.getByRole('button',{name:'Import'}));
 await act(async()=>{await expect(result).rejects.toThrow('refused');});expect(store.draft).toEqual(initial);expect(api.read).toHaveBeenCalledOnce();
});
it('waits for already admitted saves before importing',async()=>{
 await mount();let done!:(value:unknown)=>void;api.save.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));
 const saving=store.saveListingFields({...fields,title:'Saving'});await waitFor(()=>expect(api.save).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByRole('button',{name:'Import'}));expect(api.import).not.toHaveBeenCalled();
 api.read.mockResolvedValueOnce(imported);
 await act(async()=>{done({...initial,version:2});await saving;await result;});
 expect(api.import).toHaveBeenCalledOnce();expect(store.draft).toEqual(imported);
});

it('HIGH 2 fences equal-version old editor saves after POST commits and GET fails until current-draft recovery',async()=>{
 await mount();const saveOld=store.saveListingFields;
 api.read.mockRejectedValueOnce(new Error('GET failed'));
 fireEvent.click(screen.getByRole('button',{name:'Import'}));
 await act(async()=>{await expect(result).rejects.toThrow('GET failed');});
 expect(store.loaded).toBe(false);expect(store.error).toBe(true);expect(store.draft).toBeNull();
 await expect(saveOld(fields)).rejects.toThrow();
 await expect(store.saveListingFields(fields)).rejects.toThrow();
 expect(api.save).not.toHaveBeenCalled();
 api.read.mockResolvedValueOnce(imported);await act(async()=>{await store.reload();});
 expect(store.loaded).toBe(true);expect(store.draft).toEqual(imported);
 await expect(saveOld(fields)).rejects.toThrow();
});

it('#1172 unpublished imported current draft allows a later import and Start another listing',async()=>{
 api.read.mockResolvedValue(imported);await mountImported();
 fireEvent.click(screen.getByRole('button',{name:'Import'}));await act(async()=>{await result;});
 expect(api.import).toHaveBeenCalledOnce();
 api.create.mockResolvedValue({...initial,draft_id:'new'});
 await act(async()=>{await store.startNewDraft('fresh-request');});
 expect(api.create).toHaveBeenCalledWith('fresh-request');expect(store.draft?.draft_id).toBe('new');
});
async function mountImported(){render(<SellerListingDraftProvider enabled sampleCapability={false}><Consumer/></SellerListingDraftProvider>);await screen.findByText('Imported');}

it('DRAFT_SUPERSEDED on save adopts current draft and retires old callbacks',async()=>{
 await mount();const oldSave=store.saveListingFields;
 const failure={response:{status:409,data:{detail:{code:'DRAFT_SUPERSEDED',message:'This draft was replaced by a newer listing draft'}}}};
 api.save.mockRejectedValueOnce(failure);api.read.mockResolvedValueOnce({...imported,authority_version_id:'durable'});
 await act(async()=>{await expect(oldSave({...fields,title:'Old edit'})).rejects.toEqual(failure);});
 expect(store.draft?.draft_id).toBe('imported');expect(store.draft?.authority_version_id).toBe('durable');
 await expect(oldSave(fields)).rejects.toThrow('changed');expect(api.save).toHaveBeenCalledOnce();
});

it('failed current-draft recovery after DRAFT_SUPERSEDED fences saves until load retry',async()=>{
 await mount();const failure={response:{status:409,data:{detail:{code:'DRAFT_SUPERSEDED'}}}};
 api.save.mockRejectedValueOnce(failure);api.read.mockRejectedValueOnce(new Error('offline'));
 await act(async()=>{await expect(store.saveListingFields({...fields,title:'Old edit'})).rejects.toEqual(failure);});
 expect(store.loaded).toBe(false);expect(store.error).toBe(true);
 await expect(store.saveListingFields(fields)).rejects.toThrow('Load');
 api.read.mockResolvedValueOnce(imported);await act(async()=>{await store.reload();});
 expect(store.loaded).toBe(true);expect(store.error).toBe(false);expect(store.draft?.draft_id).toBe('imported');
});

it('superseded sample save clears old selection bookkeeping after current-draft reload',async()=>{
 await mount();const failure={response:{status:409,data:{detail:{code:'DRAFT_SUPERSEDED'}}}};
 api.save.mockRejectedValueOnce(failure);api.read.mockResolvedValueOnce(imported);
 await act(async()=>{store.setVisibleSampleIndices([1]);await expect(store.saveSamples([1])).rejects.toEqual(failure);});
 expect(store.draft?.draft_id).toBe('imported');expect(store.selectionSavePending).toBe(false);expect(store.selectionSaveFailed).toBe(false);
});
