// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SellerWorkspaceConnection } from '@/api/sellerWorkspace';
import SavedWorkspaceData from './SavedWorkspaceData';
import {resetSellerListingDraftOwnerForTests,SellerListingDraftProvider,useSellerListingDraftStatus} from './SellerListingDraftStore';
const api = vi.hoisted(() => ({readListingSource:vi.fn(), saveListingSource:vi.fn(), listWorkspaceObjects:vi.fn(),readListingDraft:vi.fn(),saveListingDraft:vi.fn(),
  createIdempotencyKey:vi.fn(()=> 'sample-key'),uploadWorkspaceSample:vi.fn(),SAMPLE_MAX_FILES:10,SAMPLE_MAX_FILE_BYTES:64*1024*1024,SAMPLE_MAX_TOTAL_BYTES:256*1024*1024}));
vi.mock('@/api/sellerListingSource', () => api);
vi.mock('@/api/sellerListingDraft',()=>api);
vi.mock('@/api/sellerWorkspace', () => api);
const connection = {id:'connection-1',version:1,status:'verified',bucket:'synthetic',prefix:'data'} as SellerWorkspaceConnection;
const object = {key:'data/example.csv',version_id:null,etag:'synthetic',size:42,last_modified:null,format_candidate:'csv'};
const content = {connection_id:connection.id,connection_version:1,version_mode:'current',objects:[{key:object.key,version_id:null,etag:object.etag,size:42}]};
afterEach(()=>{cleanup();resetSellerListingDraftOwnerForTests();});
beforeEach(() => {vi.resetAllMocks(); api.listWorkspaceObjects.mockResolvedValue({objects:[object],next_cursor:null});api.readListingDraft.mockResolvedValue(null);});
const renderData=(connections=[connection],sampleCapability=false)=>render(<SellerListingDraftProvider enabled sampleCapability={sampleCapability}><SavedWorkspaceData enabled connections={connections} /></SellerListingDraftProvider>);
const renderLicensedData=()=>render(<SellerListingDraftProvider enabled sampleCapability={false}><SavedWorkspaceData enabled connections={[connection]} listingLicensesEnabled /></SellerListingDraftProvider>);
const DraftStatus=()=>{const status=useSellerListingDraftStatus();return <p data-testid="draft-status">{status.selectionSavePending?`pending:${status.sampleIndices.join(',')}`:status.selectionSaveFailed?'failed':'ready'}</p>;};
it('restores the selected files from the account', async () => {
  api.readListingSource.mockResolvedValue({version:2, content, connection_current:true});
  renderData();
  const checkbox = await screen.findByRole('checkbox', {name:`Select ${object.key}`});
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(/File selection saved to your account/)).toBeTruthy();
});
it('omits an incomplete licence choice from a draft save and explains what remains',async()=>{
 const draft={version:4,content:{brief:'brief',title:'Offer',description:'Description',category:'Retail',tags:'retail',price:'25',license:'Research'},updated_at:'2026-09-18T12:00:00Z'};
 api.readListingSource.mockResolvedValue({version:2,content,connection_current:true});
 api.readListingDraft.mockResolvedValue(draft);
 api.saveListingDraft.mockImplementation(async saved=>({version:5,content:saved,updated_at:draft.updated_at}));
 renderLicensedData();
 fireEvent.click(await screen.findByRole('button',{name:'Save licence choice'}));
 await waitFor(()=>expect(api.saveListingDraft).toHaveBeenCalledOnce());
 expect(api.saveListingDraft.mock.calls[0][0]).not.toHaveProperty('license_selection');
 expect(screen.getByText(/Draft saved without a licence choice/)).toBeTruthy();
});
it('saves only a complete licence selection',async()=>{
 const draft={version:4,content:{brief:'brief',title:'Offer',description:'Description',category:'Retail',tags:'retail',price:'25',license:'Research'},updated_at:'2026-09-18T12:00:00Z'};
 api.readListingSource.mockResolvedValue({version:2,content,connection_current:true});
 api.readListingDraft.mockResolvedValue(draft);
 api.saveListingDraft.mockImplementation(async saved=>({version:5,content:saved,updated_at:draft.updated_at}));
 renderLicensedData();
 await screen.findByRole('button',{name:'Save licence choice'});
 fireEvent.change(screen.getByLabelText('Signer full name'),{target:{value:'Sam Seller'}});
 fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
 const details=screen.getByText('Read the summary and full terms').closest('details')!;
 Object.defineProperty(details,'open',{value:true,configurable:true});
 fireEvent(details,new Event('toggle'));
 fireEvent.click(screen.getByLabelText('Confirm covenant and authority'));
 fireEvent.click(screen.getByRole('button',{name:'Save licence choice'}));
 await waitFor(()=>expect(api.saveListingDraft).toHaveBeenCalledOnce());
 expect(api.saveListingDraft.mock.calls[0][0].license_selection.seller_acceptance).toEqual({signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true});
});
it('round-trips the uploaded sample selection inside draft content',async()=>{
  const draft={version:4,content:{brief:'brief',title:'Offer',description:'Description',category:'Retail',tags:'retail',price:'25',license:'Research',sample_decision:'none',sample_object_indices:[]},updated_at:'2026-09-18T12:00:00Z'};
  api.readListingSource.mockResolvedValue({version:2,content,connection_current:true});api.readListingDraft.mockResolvedValue(draft);
  api.uploadWorkspaceSample.mockResolvedValue({index:0,size:42,sha256:'a'.repeat(64),binding:'size_only'});
  api.saveListingDraft.mockImplementation(async(saved)=>({version:5,content:saved,updated_at:draft.updated_at}));
  renderData([connection],true);
  fireEvent.click(await screen.findByRole('checkbox',{name:/Offer example.csv.*free sample/}));
  fireEvent.change(screen.getByLabelText(/Upload sample example.csv/),{target:{files:[new File([new Uint8Array(42)],'example.csv')]}});
  await screen.findByText('Uploaded and saved for review.');
  expect(api.saveListingDraft).toHaveBeenCalledWith({...draft.content,sample_decision:'member_files',sample_object_indices:[0]},4,expect.any(String));
});
it('rolls a tick back with the named alert when the draft PUT fails',async()=>{
  const draft={version:4,content:{brief:'brief',title:'Offer',description:'Description',category:'Retail',tags:'retail',price:'25',license:'Research'},updated_at:'2026-09-18T12:00:00Z'};
  api.readListingSource.mockResolvedValue({version:2,content,connection_current:true});api.readListingDraft.mockResolvedValue(draft);
  api.uploadWorkspaceSample.mockResolvedValue({index:0,size:42,sha256:'a'.repeat(64),binding:'size_only'});api.saveListingDraft.mockRejectedValue(new Error('network'));
  renderData([connection],true);
  const tick=await screen.findByRole('checkbox',{name:/Offer example.csv.*free sample/});fireEvent.click(tick);
  fireEvent.change(screen.getByLabelText(/Upload sample example.csv/),{target:{files:[new File([new Uint8Array(42)],'example.csv')]}});
  expect((await screen.findByRole('alert')).textContent).toContain('sample_selection_save_failed');
  expect((tick as HTMLInputElement).checked).toBe(false);
});
it('does not write the draft after a source save when no persisted sample selection exists',async()=>{
  api.readListingSource.mockResolvedValue(null);api.saveListingSource.mockResolvedValue({version:1,content,connection_current:true});
  renderData([connection],true);
  fireEvent.click(await screen.findByRole('checkbox',{name:`Select ${object.key}`}));fireEvent.click(screen.getByRole('button',{name:'Save selected files'}));fireEvent.click(screen.getByRole('button',{name:'Confirm selection'}));
  await screen.findByText(/File selection saved to your account/);
  expect(api.saveListingDraft).not.toHaveBeenCalled();
});
it('serializes an in-flight sample save and persists the latest visible ticks',async()=>{
  const draft={version:4,content:{brief:'brief',title:'Offer',description:'Description',category:'Retail',tags:'retail',price:'25',license:'Research'},updated_at:'2026-09-18T12:00:00Z'};
  api.readListingSource.mockResolvedValue({version:2,content,connection_current:true});api.readListingDraft.mockResolvedValue(draft);
  api.uploadWorkspaceSample.mockResolvedValue({index:0,size:42,sha256:'a'.repeat(64),binding:'size_only'});
  let finishFirst!:(value:unknown)=>void;
  api.saveListingDraft.mockImplementationOnce(()=>new Promise(resolve=>{finishFirst=resolve;}))
    .mockImplementationOnce(async(saved)=>({version:6,content:saved,updated_at:draft.updated_at}))
    .mockImplementationOnce(async(saved)=>({version:7,content:saved,updated_at:draft.updated_at}));
  renderData([connection],true);
  const tick=await screen.findByRole('checkbox',{name:/Offer example.csv.*free sample/});
  fireEvent.click(tick);
  fireEvent.change(screen.getByLabelText(/Upload sample example.csv/),{target:{files:[new File([new Uint8Array(42)],'example.csv')]}});
  await waitFor(()=>expect(api.saveListingDraft).toHaveBeenCalledTimes(1));
  fireEvent.click(tick);
  expect((tick as HTMLInputElement).checked).toBe(false);
  expect(api.saveListingDraft).toHaveBeenCalledTimes(1);
  await act(async()=>finishFirst({version:5,content:{...draft.content,sample_decision:'member_files',sample_object_indices:[0]},updated_at:draft.updated_at}));
  await waitFor(()=>expect(api.saveListingDraft).toHaveBeenCalledTimes(2));
  expect(api.saveListingDraft.mock.calls[1][0]).toEqual({...draft.content,sample_decision:'none',sample_object_indices:[]});
  expect(api.saveListingDraft.mock.calls[1][1]).toBe(5);
  fireEvent.click(tick);
  fireEvent.change(screen.getByLabelText(/Upload sample example.csv/),{target:{files:[new File([new Uint8Array(42)],'example.csv')]}});
  await waitFor(()=>expect(api.saveListingDraft).toHaveBeenCalledTimes(3));
  expect(api.saveListingDraft.mock.calls[2][0]).toEqual({...draft.content,sample_decision:'member_files',sample_object_indices:[0]});
  expect(api.saveListingDraft.mock.calls[2][1]).toBe(6);
});
it('fences an upload completion when a source save advances the transaction epoch',async()=>{
  const second={...object,key:'data/second.csv',etag:'second'};
  const draft={version:4,content:{brief:'brief',title:'Offer',description:'Description',category:'Retail',tags:'retail',price:'25',license:'Research',sample_decision:'none',sample_object_indices:[]},updated_at:'2026-09-18T12:00:00Z'};
  api.readListingSource.mockResolvedValue({version:2,content,connection_current:true});api.readListingDraft.mockResolvedValue(draft);
  api.saveListingDraft.mockImplementation(async saved=>({version:5,content:saved,updated_at:draft.updated_at}));
  api.listWorkspaceObjects.mockResolvedValue({objects:[object,second],next_cursor:null});
  let finishUpload!:(value:unknown)=>void;let finishSource!:(value:unknown)=>void;
  api.uploadWorkspaceSample.mockReturnValue(new Promise(resolve=>{finishUpload=resolve;}));
  api.saveListingSource.mockReturnValue(new Promise(resolve=>{finishSource=resolve;}));
  render(<SellerListingDraftProvider enabled sampleCapability><SavedWorkspaceData enabled connections={[connection]}/><DraftStatus/></SellerListingDraftProvider>);
  const sampleTick=await screen.findByRole('checkbox',{name:/Offer example.csv.*free sample/});fireEvent.click(sampleTick);
  fireEvent.change(screen.getByLabelText(/Upload sample example.csv/),{target:{files:[new File([new Uint8Array(42)],'example.csv')]}});
  fireEvent.click(screen.getByRole('checkbox',{name:'Select data/second.csv'}));
  fireEvent.click(screen.getByRole('button',{name:'Save selected files'}));fireEvent.click(screen.getByRole('button',{name:'Confirm selection'}));
  expect(screen.getByTestId('draft-status').textContent).toMatch(/^pending/);
  await act(async()=>finishSource({version:3,content:{...content,objects:[...content.objects,{key:second.key,version_id:null,etag:second.etag,size:42}]},connection_current:true}));
  await waitFor(()=>expect((sampleTick as HTMLInputElement).checked).toBe(false));
  await act(async()=>finishUpload({index:0,size:42,sha256:'a'.repeat(64),binding:'size_only'}));
  await waitFor(()=>expect(screen.getByTestId('draft-status').textContent).toBe('ready'));
  expect(api.saveListingDraft).toHaveBeenCalledTimes(1);
  expect(api.saveListingDraft.mock.calls[0][0]).toEqual({...draft.content,sample_decision:'none',sample_object_indices:[]});
});
it('retries an unknown save with the same version and identity', async () => {
  api.readListingSource.mockResolvedValue(null);
  api.saveListingSource.mockRejectedValueOnce(new Error('network')).mockResolvedValue({version:1,content,connection_current:true});
  renderData();
  fireEvent.click(await screen.findByRole('checkbox', {name:`Select ${object.key}`}));
  fireEvent.click(screen.getByRole('button', {name:'Save selected files'}));
  fireEvent.click(screen.getByRole('button', {name:'Confirm selection'}));
  await screen.findByText(/Saving could not be confirmed/);
  fireEvent.click(screen.getByRole('button', {name:'Save selected files'}));
  fireEvent.click(screen.getByRole('button', {name:'Confirm selection'}));
  await screen.findByText(/File selection saved to your account/);
  expect(api.saveListingSource.mock.calls[0]).toEqual(api.saveListingSource.mock.calls[1]);
  expect(api.saveListingSource.mock.calls[0][0]).toEqual(content);
  expect(api.saveListingSource.mock.calls[0][1]).toBe(0);
});
it('does not open an empty file picker when the saved selection cannot be loaded', async () => {
  api.readListingSource.mockRejectedValue(new Error('network'));
  renderData();
  await screen.findByRole('alert');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(api.listWorkspaceObjects).not.toHaveBeenCalled();
  api.readListingSource.mockResolvedValue(null);
  fireEvent.click(screen.getByRole('button', {name:'Try loading again'}));
  await waitFor(() => expect(api.listWorkspaceObjects).toHaveBeenCalledTimes(1));
});
it('keeps the connection fixed during a save and preserves newer checkbox edits', async () => {
  api.readListingSource.mockResolvedValue(null);
  let finish!: (value: unknown) => void;
  api.saveListingSource.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  renderData([connection,{...connection,id:'connection-2'}]);
  const checkbox = await screen.findByRole('checkbox', {name:`Select ${object.key}`});
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', {name:'Save selected files'}));
  fireEvent.click(screen.getByRole('button', {name:'Confirm selection'}));
  expect((screen.getByRole('combobox', {name:'Storage connection'}) as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  await act(async () => finish({version:1,content,connection_current:true}));
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/Your file choices have not been saved/)).toBeTruthy();
  expect((screen.getByRole('combobox', {name:'Storage connection'}) as HTMLSelectElement).disabled).toBe(false);
});
it('keeps a local selection change when retrying a failed file read', async () => {
  api.readListingSource.mockResolvedValue({version:1,content,connection_current:true});
  api.listWorkspaceObjects.mockRejectedValueOnce(new Error('network')).mockResolvedValue({objects:[object],next_cursor:null});
  renderData();
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', {name:'Clear selection'}));
  fireEvent.click(screen.getByRole('button', {name:'Try again'}));
  const checkbox = await screen.findByRole('checkbox', {name:`Select ${object.key}`});
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/Your file choices have not been saved/)).toBeTruthy();
});

it('checks a complete folder and requires count-and-size confirmation before saving',async()=>{
 api.readListingSource.mockResolvedValue(null);
 api.listWorkspaceObjects.mockResolvedValueOnce({objects:[object],next_cursor:'browse-next'})
  .mockResolvedValueOnce({objects:[object],next_cursor:'folder-next'})
  .mockResolvedValueOnce({objects:[{...object,key:'data/sub/second.csv',size:1048576}],next_cursor:null});
 api.saveListingSource.mockResolvedValue({version:1,content,connection_current:true});
 renderData();
 await screen.findByRole('checkbox',{name:`Select ${object.key}`});
 fireEvent.click(screen.getByRole('button',{name:'Select entire connected folder'}));
 await screen.findByText(/2 files selected/);
 fireEvent.click(screen.getByRole('button',{name:'Save selected files'}));
 expect(screen.getByText(/You have chosen 2 files totaling 1 MB/)).toBeTruthy();
 expect(api.saveListingSource).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Change selection'}));
 expect(screen.queryByRole('region',{name:'Confirm file selection'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Save selected files'}));
 fireEvent.click(screen.getByRole('button',{name:'Confirm selection'}));
 await waitFor(()=>expect(api.saveListingSource).toHaveBeenCalledOnce());
 expect(api.saveListingSource.mock.calls[0][0].objects).toHaveLength(2);
});

it('confirms 22,000 files while rendering only one selected-file preview page',async()=>{
 const files=Array.from({length:22000},(_,i)=>({...object,key:`data/sub/file-${i}.csv`,size:1024}));
 api.readListingSource.mockResolvedValue(null);
 api.listWorkspaceObjects.mockImplementation(async(_id:string,_prefix:string,cursor?:string,limit?:number)=>{
  if(!limit)return {objects:files.slice(0,100),next_cursor:'browse'};
  const offset=Number(cursor??0);
  return {objects:files.slice(offset,offset+1000),next_cursor:offset+1000<files.length?String(offset+1000):null};
 });
 api.saveListingSource.mockImplementation(async(content)=>({version:1,content,connection_current:true}));
 renderData();
 await screen.findByRole('checkbox',{name:`Select ${files[0].key}`});
 fireEvent.click(screen.getByRole('button',{name:'Select entire connected folder'}));
 await screen.findByText(/22000 files selected/);
 expect(screen.getByRole('list',{name:'Selected files'}).children).toHaveLength(50);
 fireEvent.click(screen.getByRole('button',{name:'Next selected files'}));
 expect(screen.getByText('Showing 51–100 of 22,000')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Save selected files'}));
 expect(screen.getByText(/You have chosen 22,000 files totaling 21.5 MB/)).toBeTruthy();
 expect(api.saveListingSource).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirm selection'}));
 await waitFor(()=>expect(api.saveListingSource).toHaveBeenCalledOnce());
 expect(api.saveListingSource.mock.calls[0][0].objects).toHaveLength(22000);
});
