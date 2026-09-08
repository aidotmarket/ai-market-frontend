import {expect,it,vi} from 'vitest';
import {mergeSelection,resolveFolder} from './folderSelection';
import type {WorkspaceObject} from '@/api/sellerWorkspace';
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
