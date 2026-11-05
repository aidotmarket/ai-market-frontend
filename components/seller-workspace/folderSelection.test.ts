import {beforeEach,expect,it,vi} from 'vitest';
import {FolderRequestError,mergeSelection,resolveFolder} from './folderSelection';
import {listWorkspaceObjects, type WorkspaceObject} from '@/api/sellerWorkspace';
const transport=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/api/client',()=>({api:transport}));
beforeEach(()=>vi.resetAllMocks());
const transportError=(status?:number,detail?:unknown)=>({
 isAxiosError:true,message:'private provider text',
 response:status===undefined?undefined:{status,data:{detail,provider:'private provider text'}},
});
const file=(key:string,size=1)=>({key,size,etag:'e',version_id:null,last_modified:'',format_candidate:'csv'} as WorkspaceObject);
it('includes all pages and nested files, excludes folder markers, and counts overlap once',async()=>{
 const list=vi.fn().mockResolvedValueOnce({objects:[file('data/a.csv'),file('data/sub/')],next_cursor:'page2'}).mockResolvedValueOnce({objects:[file('data/sub/b.csv',500000000)],next_cursor:null});
 const result=await resolveFolder('c','data',list);
 expect(list.mock.calls).toEqual([['c','data/',undefined],['c','data/','page2']]);
 expect(mergeSelection([file('data/a.csv')],result)).toHaveLength(2);
 expect(result.reduce((sum,item)=>sum+item.size,0)).toBe(500000001);
});
it('never returns a partial folder after a later page fails',async()=>{
 const list=vi.fn().mockResolvedValueOnce({objects:[file('data/a')],next_cursor:'next'}).mockRejectedValueOnce(new Error('offline'));
 await expect(resolveFolder('c','data',list)).rejects.toThrow('offline');
});
it('rejects repeated cursors, out-of-folder files and oversized selections',async()=>{
 await expect(resolveFolder('c','data',vi.fn(async()=>({objects:[file('data/a')],next_cursor:'same'})))).rejects.toThrow('verified');
 await expect(resolveFolder('c','data',vi.fn(async()=>({objects:[file('data-other/a')],next_cursor:null})))).rejects.toThrow('verified');
 expect(()=>mergeSelection([],Array.from({length:50001},(_,index)=>file('data/'+index)))).toThrow('50,000');
 expect(()=>mergeSelection([],[file('data/a',Number.MAX_SAFE_INTEGER),file('data/b')])).toThrow('size');
});

it('counts all 22,000 nested files with progress and deduplicates overlapping choices', async () => {
 const files=Array.from({length:22000},(_,i)=>file(`data/region-${Math.floor(i/1000)}/file-${i}.csv`,i+1));
 const progress=vi.fn();
 const list=vi.fn(async(_id:string,_prefix:string,cursor?:string)=>{
  const offset=Number(cursor??0);
  return {objects:files.slice(offset,offset+1000),next_cursor:offset+1000<files.length?String(offset+1000):null};
 });
 const result=await resolveFolder('c','data',list,{onProgress:progress});
 expect(result).toEqual(files);
 expect(list).toHaveBeenCalledTimes(22);
 expect(progress).toHaveBeenLastCalledWith({files:22000,bytes:242011000});
 expect(mergeSelection(files.slice(0,100),result)).toHaveLength(22000);
});
it('rejects conflicting duplicate observations and stops fetching after leaving',async()=>{
 expect(()=>mergeSelection([file('data/a')],[file('data/a',2)])).toThrow('changed');
 let cancelled=false;
 const list=vi.fn(async()=>{cancelled=true;return {objects:[file('data/a')],next_cursor:'next'};});
 await expect(resolveFolder('c','data',list,{cancelled:()=>cancelled})).rejects.toThrow('cancelled');
 expect(list).toHaveBeenCalledOnce();
});

it('waits and retries only a rate rejection with the same cursor',async()=>{
 const rejected=Object.assign(new Error('rate limited'),{isAxiosError:true,response:{status:429}});
 const list=vi.fn().mockResolvedValueOnce({objects:[file('data/a')],next_cursor:'next'})
  .mockRejectedValueOnce(rejected).mockResolvedValueOnce({objects:[file('data/b')],next_cursor:null});
 const wait=vi.fn(async()=>{}), onRateLimit=vi.fn();
 expect(await resolveFolder('c','data',list,{wait,onRateLimit})).toHaveLength(2);
 expect(list.mock.calls.slice(1)).toEqual([['c','data/','next'],['c','data/','next']]);
 expect(wait).toHaveBeenCalledWith(60000);
 expect(onRateLimit.mock.calls).toEqual([[true],[false]]);
});

it('captures completed scan progress on an Axios page failure without returning partial files',async()=>{
 const failure={isAxiosError:true,message:'private provider message',response:{status:503,data:{detail:'File discovery is unavailable'}}};
 const list=vi.fn().mockResolvedValueOnce({objects:[file('data/a',178362778)],next_cursor:'next'}).mockRejectedValue(failure);
 const resolved=vi.fn();
 const scan=resolveFolder('c','data',list).then(resolved);
 await expect(scan).rejects.toBeInstanceOf(FolderRequestError);
 await expect(scan).rejects.toMatchObject({message:'File discovery is unavailable',progress:{files:1,bytes:178362778}});
 expect(resolved).not.toHaveBeenCalled();
 expect(list).toHaveBeenCalledTimes(2);
});

// Exercise safely() as well as the folder scanner: only the transport is mocked.
it.each([
 [400,'Folder listing cursor has expired; start again','Folder listing cursor has expired; start again'],
 [400,{provider:'private provider text'},'the folder listing request was invalid'],
 [401,undefined,'your sign-in or access to this connection changed'],
 [403,undefined,'your sign-in or access to this connection changed'],
 [404,undefined,'the connection or folder was not found'],
 [500,{provider:'private provider text'},'the storage provider did not respond'],
 [503,undefined,'the storage provider did not respond'],
 [503,'File discovery is unavailable','File discovery is unavailable'],
 [undefined,undefined,'the connection to ai.market was interrupted'],
])('reports cause and completed progress through the real wrapper for %s',async(status,detail,reason)=>{
 transport.get.mockResolvedValueOnce({data:{objects:[file('data/a',178362778),file('data/sub/')],next_cursor:'next'}})
  .mockRejectedValueOnce(transportError(status as number|undefined,detail));
 const progress=vi.fn(), selected=[file('existing/a')], applied=vi.fn();
 const scan=resolveFolder('c','data',listWorkspaceObjects,{onProgress:progress})
  .then(contents=>{selected.push(...contents);applied();});
 await expect(scan).rejects.toBeInstanceOf(FolderRequestError);
 await expect(scan).rejects.toMatchObject({message:reason,progress:{files:1,bytes:178362778}});
 await expect(scan).rejects.not.toThrow('private provider text');
 expect(progress.mock.calls).toEqual([[{files:1,bytes:178362778}]]);
 expect(selected).toEqual([file('existing/a')]);
 expect(applied).not.toHaveBeenCalled();
 expect(transport.get).toHaveBeenCalledTimes(2);
});
it('retries a wrapped 429 at the same cursor and completes',async()=>{
 transport.get.mockResolvedValueOnce({data:{objects:[file('data/a')],next_cursor:'next'}})
  .mockRejectedValueOnce(transportError(429))
  .mockResolvedValueOnce({data:{objects:[file('data/b',2)],next_cursor:null}});
 const wait=vi.fn(async()=>{}),onRateLimit=vi.fn(),onProgress=vi.fn();
 await expect(resolveFolder('c','data',listWorkspaceObjects,{wait,onRateLimit,onProgress}))
  .resolves.toEqual([file('data/a'),file('data/b',2)]);
 expect(transport.get.mock.calls[1]).toEqual(transport.get.mock.calls[2]);
 expect(transport.get.mock.calls[1][1].params.cursor).toBe('next');
 expect(wait.mock.calls).toEqual([[60000]]);
 expect(onRateLimit.mock.calls).toEqual([[true],[false]]);
 expect(onProgress).toHaveBeenLastCalledWith({files:2,bytes:3});
});
it('stops after four wrapped 429s and reports the rate cause with completed progress',async()=>{
 transport.get.mockResolvedValueOnce({data:{objects:[file('data/a',5)],next_cursor:'next'}})
  .mockRejectedValue(transportError(429));
 const wait=vi.fn(async()=>{}),onRateLimit=vi.fn();
 await expect(resolveFolder('c','data',listWorkspaceObjects,{wait,onRateLimit})).rejects.toMatchObject({
  message:'too many requests to your storage; wait a minute and try again',progress:{files:1,bytes:5},
 });
 expect(transport.get).toHaveBeenCalledTimes(5);
 for(const call of transport.get.mock.calls.slice(1))expect(call).toEqual(transport.get.mock.calls[1]);
 expect(wait.mock.calls).toEqual([[60000],[60000],[60000]]);
 expect(onRateLimit.mock.calls).toEqual([[true],[false],[true],[false],[true],[false]]);
});

it('traverses 12,001 root files over 13 pages without converting the root to a slash',async()=>{
 const files=Array.from({length:12001},(_,index)=>file(index%2?`nested/file-${index}`:`file-${index}`));
 const list=vi.fn(async(_id:string,prefix:string,cursor?:string)=>{
  expect(prefix).toBe('');const offset=Number(cursor??0);
  return {objects:files.slice(offset,offset+1000),next_cursor:offset+1000<files.length?String(offset+1000):null};
 });
 expect(await resolveFolder('c','',list)).toEqual(files);
 expect(list).toHaveBeenCalledTimes(13);
});
