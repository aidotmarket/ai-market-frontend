// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const stream=vi.hoisted(() => vi.fn());
const fileGrant=vi.hoisted(() => vi.fn());
vi.mock('@/api/sellerWorkspaceDownload',async importOriginal => ({...await importOriginal<object>(),requestWorkspaceFile:fileGrant}));
vi.mock('./workspaceDownloadStream',async importOriginal => ({...await importOriginal<object>(),streamWorkspaceDownload:stream}));
import WorkspaceDownload from './WorkspaceDownload';
const bundle=()=>({delivery_type:'workspace_direct' as const,session_id:'00000000-0000-4000-8000-000000000001',download_number:1,downloads_remaining:2,files:[{index:0,filename:'retail.csv',size:3,
  url:'https://synthetic.s3.eu-west-1.amazonaws.com/file?X-Amz-SignedHeaders=host%3Bif-match',headers:{'If-Match':'"e"'},expires_at:new Date(Date.now()+60000).toISOString()}]});
afterEach(() => {cleanup();Reflect.deleteProperty(window,'showDirectoryPicker');vi.unstubAllGlobals();vi.restoreAllMocks();vi.resetAllMocks();});
const returnedFile=()=>({filename:'retail.csv',size:3,url:'https://synthetic.s3.eu-west-1.amazonaws.com/file?X-Amz-SignedHeaders=host%3Bif-match',headers:{'If-Match':'"e"'},expires_at:new Date(Date.now()+60000).toISOString()});
it('enables the browser download when the picker is absent and shows fallback copy',async () => {
  render(<WorkspaceDownload orderId="order-1" requestGrant={vi.fn()} />);
  const button=await screen.findByRole('button',{name:'Download files'});
  expect(button.hasAttribute('disabled')).toBe(false);
  expect(screen.getByText(/usual Downloads location/)).toBeTruthy();
  expect(screen.queryByText(/Create a folder inside Downloads/)).toBeNull();
  expect(screen.queryByText(/Use desktop Chrome or Edge/)).toBeNull();
});
it('saves each verified fallback file with a sanitized download name and revokes its URL',async () => {
  const data=bundle();data.files[0].filename='../retail.csv';data.files.push({...data.files[0],index:1,filename:'second.csv'});
  const grant=vi.fn(async (_orderId:string,_signal:AbortSignal,_requestId?:string) => data);
  fileGrant.mockImplementation(async (_order,_session,index) => ({...returnedFile(),filename:data.files[index].filename}));
  const fetcher=vi.fn(async () => new Response(new Uint8Array([1,2,3]),{status:200}));vi.stubGlobal('fetch',fetcher);
  const create=vi.fn(() => 'blob:synthetic');const revoke=vi.fn();
  vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:create,revokeObjectURL:revoke}));
  const clicks:string[]=[];vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicks.push(this.download);});
  render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(await screen.findByRole('button',{name:'Download files'}));
  await screen.findByText(/Saved 2 files/);
  expect(clicks).toEqual(['001-.._retail.csv','002-second.csv']);
  expect(create).toHaveBeenCalledTimes(2);expect(revoke).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenCalledWith(returnedFile().url,expect.objectContaining({headers:{'If-Match':'"e"'},credentials:'omit',redirect:'error'}));
  expect(fileGrant).toHaveBeenCalledTimes(2);
  expect(grant.mock.calls[0][2]).toBeTruthy();
});
it('rejects changed or truncated fallback files before triggering a browser save',async () => {
  fileGrant.mockResolvedValue(returnedFile());
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(() => undefined);
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:412})).mockResolvedValueOnce(new Response(new Uint8Array([1,2]),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  render(<WorkspaceDownload orderId="order-1" requestGrant={vi.fn(async () => bundle())} />);
  fireEvent.click(await screen.findByRole('button',{name:'Download files'}));
  expect((await screen.findByRole('alert')).textContent).toContain('file has changed');
  fireEvent.click(screen.getByRole('button',{name:'Download files'}));
  expect((await screen.findByRole('alert')).textContent).toContain('could not be completed');
  expect(click).not.toHaveBeenCalled();
});
it('cancels the fallback while waiting for a file grant',async () => {
  const grant=vi.fn(async () => bundle());
  fileGrant.mockImplementation((_order,_session,_index,signal,waiting) => {
    waiting(60);return new Promise((_resolve,reject) => signal.addEventListener('abort',() => reject(signal.reason),{once:true}));
  });
  render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(await screen.findByRole('button',{name:'Download files'}));
  await screen.findByText(/delivery is busy/);
  fireEvent.click(screen.getByRole('button',{name:'Cancel download'}));
  expect((await screen.findByText(/Download cancelled/)).textContent).toContain('Downloads location');
  expect(grant).toHaveBeenCalledOnce();
});
it('reuses the fallback allocation request ID after an unknown response',async () => {
  const grant=vi.fn((_orderId:string,_signal:AbortSignal,_requestId?:string) => Promise.reject(new Error('lost response')));
  render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(await screen.findByRole('button',{name:'Download files'}));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Download files'}));
  await screen.findByRole('alert');
  expect(grant.mock.calls[0][2]).toBeTruthy();
  expect(grant.mock.calls[0][2]).toBe(grant.mock.calls[1][2]);
});
it('reports a clear error when a fallback file cannot fit in memory',async () => {
  fileGrant.mockResolvedValue(returnedFile());
  vi.stubGlobal('fetch',vi.fn(async () => new Response(new Uint8Array([1,2,3]),{status:200})));
  const NativeBlob=Blob;
  vi.stubGlobal('Blob',class extends NativeBlob {constructor(parts?:BlobPart[],options?:BlobPropertyBag){
    if (parts?.length) throw new RangeError('out of memory');super(parts,options);
  }});
  render(<WorkspaceDownload orderId="order-1" requestGrant={vi.fn(async () => bundle())} />);
  fireEvent.click(await screen.findByRole('button',{name:'Download files'}));
  expect((await screen.findByRole('alert')).textContent).toContain('too large for your browser');
});
it('chooses a folder before requesting access and downloads only after an explicit click',async () => {
  const directory={};const picker=vi.fn(async () => directory);Object.defineProperty(window,'showDirectoryPicker',{value:picker,configurable:true});
  const grant=vi.fn(async () => {expect(picker).toHaveBeenCalledOnce();return bundle();});
  stream.mockResolvedValue('ai-market-synthetic');
  render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  expect(grant).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  expect(await screen.findByText(/Saved 1 file/)).toBeTruthy();
  expect(grant).toHaveBeenCalledOnce();expect(stream.mock.calls[0][1]).toBe(directory);
});
it('does not consume access when the folder picker is cancelled',async () => {
  Object.defineProperty(window,'showDirectoryPicker',{value:vi.fn(async () => {throw new DOMException('cancel','AbortError');}),configurable:true});
  const grant=vi.fn();render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  await screen.findByText(/Download cancelled/);
  expect(grant).not.toHaveBeenCalled();
});
it('ignores late grant responses after leaving the page',async () => {
  Object.defineProperty(window,'showDirectoryPicker',{value:vi.fn(async () => ({})),configurable:true});
  let resolve!: (value:ReturnType<typeof bundle>) => void;
  const grant=vi.fn(() => new Promise<ReturnType<typeof bundle>>(done => {resolve=done;}));
  const view=render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  await screen.findByText(/Checking access/);view.unmount();
  await act(async () => resolve(bundle()));
  expect(stream).not.toHaveBeenCalled();
});

it('reuses the allocation request after an unknown response',async () => {
  Object.defineProperty(window,'showDirectoryPicker',{value:vi.fn(async () => ({})),configurable:true});
  const grant=vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(bundle());
  stream.mockResolvedValue('ai-market-synthetic');
  render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  await screen.findByText(/Saved 1 file/);
  expect(grant.mock.calls[0][2]).toBe(grant.mock.calls[1][2]);
});

it('reports a browser save failure as an incomplete download, not user cancellation',async () => {
  Object.defineProperty(window,'showDirectoryPicker',{value:vi.fn(async () => ({})),configurable:true});
  stream.mockRejectedValue(new DOMException('write failed','AbortError'));
  render(<WorkspaceDownload orderId="order-1" requestGrant={vi.fn(async () => bundle())} />);
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  expect((await screen.findByRole('alert')).textContent).toContain('The download could not be completed');
  expect(screen.queryByText(/Download cancelled/)).toBeNull();
});

it('shows the rate wait and leaves cancellation available without allocating again',async () => {
  Object.defineProperty(window,'showDirectoryPicker',{value:vi.fn(async () => ({})),configurable:true});
  const grant=vi.fn(async () => bundle());
  fileGrant.mockImplementation((_order,_session,_index,signal,waiting) => {
    waiting(60);
    return new Promise((_resolve,reject) => signal.addEventListener('abort',() => reject(signal.reason),{once:true}));
  });
  stream.mockImplementation(async (value,_directory,_signal,_progress,loadGrant) => {await loadGrant(value.files[0]);});
  render(<WorkspaceDownload orderId="order-1" requestGrant={grant}/>);
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  await screen.findByText(/File 1 of 1: delivery is busy. Retrying in 60 seconds/);
  expect(grant).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'Cancel download'}));
  await screen.findByText(/Download cancelled/);
  expect(fileGrant).toHaveBeenCalledOnce();expect(grant).toHaveBeenCalledOnce();
});
