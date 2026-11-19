// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SellerListingDraftProvider,useSellerListingDraft,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import type {AuthorityImportRequest} from '@/api/sellerWorkspace';
const api=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),import:vi.fn()}));
vi.mock('@/api/sellerListingDraft',()=>({readListingDraft:api.read,saveListingDraft:api.save,createListingDraft:vi.fn()}));
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
