// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SellerWorkspaceConnection } from '@/api/sellerWorkspace';
import SavedWorkspaceData from './SavedWorkspaceData';
const api = vi.hoisted(() => ({readListingSource:vi.fn(), saveListingSource:vi.fn(), listWorkspaceObjects:vi.fn()}));
vi.mock('@/api/sellerListingSource', () => api);
vi.mock('@/api/sellerWorkspace', () => api);
const connection = {id:'connection-1',version:1,status:'verified',bucket:'synthetic',prefix:'data'} as SellerWorkspaceConnection;
const object = {key:'data/example.csv',version_id:null,etag:'synthetic',size:42,last_modified:null,format_candidate:'csv'};
const content = {connection_id:connection.id,connection_version:1,version_mode:'current',objects:[{key:object.key,version_id:null,etag:object.etag,size:42}]};
afterEach(cleanup);
beforeEach(() => {vi.resetAllMocks(); api.listWorkspaceObjects.mockResolvedValue({objects:[object],next_cursor:null});});
it('restores the selected files from the account', async () => {
  api.readListingSource.mockResolvedValue({version:2, content, connection_current:true});
  render(<SavedWorkspaceData enabled connections={[connection]} />);
  const checkbox = await screen.findByRole('checkbox', {name:`Select ${object.key}`});
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(/File selection saved to your account/)).toBeTruthy();
});
it('retries an unknown save with the same version and identity', async () => {
  api.readListingSource.mockResolvedValue(null);
  api.saveListingSource.mockRejectedValueOnce(new Error('network')).mockResolvedValue({version:1,content,connection_current:true});
  render(<SavedWorkspaceData enabled connections={[connection]} />);
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
  render(<SavedWorkspaceData enabled connections={[connection]} />);
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
  render(<SavedWorkspaceData enabled connections={[connection, {...connection,id:'connection-2'}]} />);
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
  render(<SavedWorkspaceData enabled connections={[connection]} />);
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
 render(<SavedWorkspaceData enabled connections={[connection]}/>);
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
 render(<SavedWorkspaceData enabled connections={[connection]}/>);
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
