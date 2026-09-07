import {describe,it,expect,vi} from 'vitest';
import {streamWorkspaceDownload, type DownloadDirectory} from './workspaceDownloadStream';
import {validateWorkspaceDownload, type WorkspaceDownload} from '@/api/sellerWorkspaceDownload';

const bundle = (): WorkspaceDownload => ({delivery_type:'workspace_direct',download_number:1,downloads_remaining:2,
  files:[{filename:'retail.csv',size:3,url:'https://synthetic.s3.eu-west-1.amazonaws.com/data/retail.csv?X-Amz-SignedHeaders=host%3Bif-match',headers:{'If-Match':'"e"'},expires_at:new Date(Date.now()+60000).toISOString()}]});
function disk() {
  const writer = {write:vi.fn(async (_data: Uint8Array) => undefined),close:vi.fn(async () => undefined),abort:vi.fn(async () => undefined)};
  const directory = {getDirectoryHandle:vi.fn(),getFileHandle:vi.fn(async (_name: string, _options: {create: boolean}) => ({createWritable:async () => writer}))};
  directory.getDirectoryHandle.mockResolvedValue(directory);
  return {writer,directory:directory as unknown as DownloadDirectory,handles:directory};
}
function network(bytes: number[]) {
  return vi.fn(async () => new Response(new ReadableStream({start(controller){
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));controller.close();
  }}),{status:200}));
}
describe('Workspace direct streaming', () => {
  it('writes bounded chunks with the signed header and no marketplace credentials',async () => {
    const {writer,directory,handles} = disk();const fetcher=network([1,2,3]);
    const folder = await streamWorkspaceDownload(bundle(),directory,new AbortController().signal,vi.fn(),fetcher as typeof fetch);
    expect(folder).toMatch(/^ai-market-/);
    expect(writer.write.mock.calls.map(call => call[0])).toEqual([new Uint8Array([1]),new Uint8Array([2]),new Uint8Array([3])]);
    expect(writer.close).toHaveBeenCalledOnce();expect(writer.abort).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({headers:{'If-Match':'"e"'},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}));
    expect(handles.getFileHandle).toHaveBeenCalledWith('001-retail.csv',{create:true});
  });
  it('does not commit truncated or oversized files',async () => {
    for (const bytes of [[1,2],[1,2,3,4]]) {
      const {writer,directory}=disk();
      await expect(streamWorkspaceDownload(bundle(),directory,new AbortController().signal,vi.fn(),network(bytes) as typeof fetch)).rejects.toMatchObject({code:'size_changed'});
      expect(writer.close).not.toHaveBeenCalled();expect(writer.abort).toHaveBeenCalledOnce();
    }
  });
  it('refuses changed provider objects before creating a file',async () => {
    const {directory,handles}=disk();
    await expect(streamWorkspaceDownload(bundle(),directory,new AbortController().signal,vi.fn(),vi.fn(async () => new Response(null,{status:412})) as typeof fetch)).rejects.toMatchObject({code:'file_changed'});
    expect(handles.getFileHandle).not.toHaveBeenCalled();
  });
  it('aborts the unfinished write when the user cancels',async () => {
    const {writer,directory}=disk();const controller=new AbortController();
    await expect(streamWorkspaceDownload(bundle(),directory,controller.signal,() => controller.abort(),network([1,2,3]) as typeof fetch)).rejects.toMatchObject({name:'AbortError'});
    expect(writer.abort).toHaveBeenCalledOnce();expect(writer.close).not.toHaveBeenCalled();
  });
  it('uses separate names for identical basenames',async () => {
    const {directory,handles}=disk();const data=bundle();data.files.push({...data.files[0]});
    await streamWorkspaceDownload(data,directory,new AbortController().signal,vi.fn(),network([1,2,3]) as typeof fetch);
    expect(handles.getFileHandle.mock.calls.map(call => call[0])).toEqual(['001-retail.csv','002-retail.csv']);
  });
  it('validates expiry, destinations and signed headers before downloading', () => {
    expect(validateWorkspaceDownload(bundle()).files).toHaveLength(1);
    for (const changed of [{url:'https://evil.example/file'},{url:'http://synthetic.s3.eu-west-1.amazonaws.com/file'},
      {expires_at:'2000-01-01'}, {headers:{Authorization:'secret'}},{size:-1}]) {
      const data=bundle();Object.assign(data.files[0],changed);
      expect(() => validateWorkspaceDownload(data)).toThrow();
    }
  });
});
