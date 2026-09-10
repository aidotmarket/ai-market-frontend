import {describe,it,expect,vi} from 'vitest';
import {streamWorkspaceDownload, type DownloadDirectory} from './workspaceDownloadStream';
import {validateWorkspaceDownload, validateWorkspaceFileGrant, type WorkspaceDownload, type WorkspaceFileEntry} from '@/api/sellerWorkspaceDownload';

const grant = () => ({filename:'retail.csv',size:3,url:'https://synthetic.s3.eu-west-1.amazonaws.com/data/retail.csv?X-Amz-SignedHeaders=host%3Bif-match',headers:{'If-Match':'"e"'},expires_at:new Date(Date.now()+60000).toISOString()});
const load = async (entry:WorkspaceFileEntry) => ({...grant(),filename:entry.filename,size:entry.size});
const bundle = (): WorkspaceDownload => ({delivery_type:'workspace_direct',session_id:'00000000-0000-4000-8000-000000000001',download_number:1,downloads_remaining:2,
  files:[{index:0,filename:'retail.csv',size:3}]});
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
    const folder = await streamWorkspaceDownload(bundle(),directory,new AbortController().signal,vi.fn(),load,fetcher as typeof fetch);
    expect(folder).toMatch(/^ai-market-/);
    expect(writer.write.mock.calls.map(call => call[0])).toEqual([new Uint8Array([1]),new Uint8Array([2]),new Uint8Array([3])]);
    expect(writer.close).toHaveBeenCalledOnce();expect(writer.abort).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({headers:{'If-Match':'"e"'},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}));
    expect(handles.getFileHandle).toHaveBeenCalledWith('001-retail.csv',{create:true});
  });
  it('does not commit truncated or oversized files',async () => {
    for (const bytes of [[1,2],[1,2,3,4]]) {
      const {writer,directory}=disk();
      await expect(streamWorkspaceDownload(bundle(),directory,new AbortController().signal,vi.fn(),load,network(bytes) as typeof fetch)).rejects.toMatchObject({code:'size_changed'});
      expect(writer.close).not.toHaveBeenCalled();expect(writer.abort).toHaveBeenCalledOnce();
    }
  });
  it('refuses changed provider objects before creating a file',async () => {
    const {directory,handles}=disk();
    await expect(streamWorkspaceDownload(bundle(),directory,new AbortController().signal,vi.fn(),load,vi.fn(async () => new Response(null,{status:412})) as typeof fetch)).rejects.toMatchObject({code:'file_changed'});
    expect(handles.getFileHandle).not.toHaveBeenCalled();
  });
  it('aborts the unfinished write when the user cancels',async () => {
    const {writer,directory}=disk();const controller=new AbortController();
    await expect(streamWorkspaceDownload(bundle(),directory,controller.signal,() => controller.abort(),load,network([1,2,3]) as typeof fetch)).rejects.toMatchObject({name:'AbortError'});
    expect(writer.abort).toHaveBeenCalledOnce();expect(writer.close).not.toHaveBeenCalled();
  });
  it('uses separate names for identical basenames',async () => {
    const {directory,handles}=disk();const data=bundle();data.files.push({...data.files[0]});
    await streamWorkspaceDownload(data,directory,new AbortController().signal,vi.fn(),load,network([1,2,3]) as typeof fetch);
    expect(handles.getFileHandle.mock.calls.map(call => call[0])).toEqual(['001-retail.csv','002-retail.csv']);
  });
  it('validates expiry, destinations and signed headers before downloading', () => {
    expect(validateWorkspaceDownload(bundle()).files).toHaveLength(1);
    for (const changed of [{url:'https://evil.example/file'},{url:'http://synthetic.s3.eu-west-1.amazonaws.com/file'},
      {expires_at:'2000-01-01'}, {headers:{Authorization:'secret'}},{size:-1}]) {
      expect(() => validateWorkspaceFileGrant({...grant(),...changed})).toThrow();
    }
  });
});

it('requests the next file only after the previous long transfer has finished',async () => {
  vi.useFakeTimers();
  try {
    const {directory,writer}=disk();const data=bundle();data.files.push({index:1,filename:'second.csv',size:3});
    writer.close.mockImplementationOnce(async () => {vi.setSystemTime(Date.now()+600000);});
    const grants=vi.fn(async (entry:WorkspaceFileEntry) => {
      if (entry.index===1) expect(writer.close).toHaveBeenCalledOnce();
      return load(entry);
    });
    await streamWorkspaceDownload(data,directory,new AbortController().signal,vi.fn(),grants,network([1,2,3]) as typeof fetch);
    expect(grants).toHaveBeenCalledTimes(2);expect(writer.close).toHaveBeenCalledTimes(2);
  } finally {vi.useRealTimers();}
});

it('streams all 22,000 files in one bundle without overlapping open writers',async()=>{
  const data=bundle();
  data.files=Array.from({length:22000},(_,index)=>({index,filename:`file-${String(index).padStart(5,'0')}.csv`,size:42}));
  validateWorkspaceDownload(data);
  const names=new Set<string>();
  let open=0,closed=0,bytes=0,requests=0,folders=0,grants=0;
  const directory:DownloadDirectory={
    async getDirectoryHandle(){folders++;return directory;},
    async getFileHandle(name){
      expect(open).toBe(0);
      expect(names.has(name)).toBe(false);names.add(name);
      return {async createWritable(){
        open++;
        return {
          async write(value){expect(value.byteLength).toBeLessThanOrEqual(42);bytes+=value.byteLength;},
          async close(){open--;closed++;},
          async abort(){throw new Error('unexpected aborted file');},
        };
      }};
    },
  };
  const fetcher=async()=>{requests++;return new Response(new Uint8Array(42),{status:200});};
  await streamWorkspaceDownload(data,directory,new AbortController().signal,()=>{},async entry=>{
    expect(closed).toBe(entry.index);grants++;return validateWorkspaceFileGrant(await load(entry));
  },fetcher as typeof fetch);
  expect({open,closed,bytes,requests,folders,grants}).toEqual({open:0,closed:22000,bytes:924000,requests:22000,folders:1,grants:22000});
  expect(names.has('001-file-00000.csv')).toBe(true);
  expect(names.has('22000-file-21999.csv')).toBe(true);
},20000);
