import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAuthStore} from '@/store/auth';
import {readListingSource,saveListingSource} from './sellerListingSource';
import {saveListingDraft} from './sellerListingDraft';
import {api} from './client';
import {id} from '@/tests/fixtures/seller-authority';
beforeEach(()=>useAuthStore.setState({token:'native-session'}));
afterEach(()=>vi.restoreAllMocks());
it('carries the draft ID into source reads and current-draft saves on the refreshing client',async()=>{
  const content={connection_id:id(2),connection_version:1,version_mode:'current' as const,objects:[{key:'data.csv',etag:'e',size:1,version_id:null}]};
  const get=vi.spyOn(api,'get').mockResolvedValue({data:{source:{version:1,content},current_draft_id:id(101)}});
  expect(await readListingSource(id(101))).toMatchObject({source:{version:1},current_draft_id:id(101)});
  expect(get).toHaveBeenCalledWith('/seller-workspace/listing-source',{params:{draft_id:id(101)}});
  const put=vi.spyOn(api,'put').mockResolvedValue({data:{source:{version:1,content},current_draft_id:id(101),draft:{draft_id:id(101),version:4}}});
  expect(await saveListingSource(content,1,id(8),id(101))).toMatchObject({source:{version:1},current_draft_id:id(101)});
  expect(put).toHaveBeenCalledWith('/seller-workspace/listing-source',{content,expected_version:1,request_id:id(8),expected_current_draft_id:id(101)});
  const draft={brief:'',title:'Sales',description:'Sales data',category:'finance',tags:'sales',price:'25',license:''};
  expect((await saveListingDraft(draft,3,id(9))).draft_id).toBe(id(101));
  expect(put).toHaveBeenLastCalledWith('/seller-workspace/listing-draft',{content:draft,expected_version:3,request_id:id(9)});
});

it('serializes null for an observed empty draft rather than dropping the precondition',async()=>{
  const content={connection_id:id(2),connection_version:1,version_mode:'current' as const,objects:[]};
  const put=vi.spyOn(api,'put').mockResolvedValue({data:{source:{version:1,content},current_draft_id:id(101)}});
  expect(await saveListingSource(content,0,id(8),null)).toMatchObject({source:{version:1},current_draft_id:id(101)});
  expect(put).toHaveBeenCalledWith('/seller-workspace/listing-source',{content,expected_version:0,request_id:id(8),expected_current_draft_id:null});
});

it('exposes the current pointer even when the source is empty',async()=>{
  vi.spyOn(api,'get').mockResolvedValue({data:{source:null,current_draft_id:id(101)}});
  expect(await readListingSource()).toEqual({source:null,current_draft_id:id(101)});
});
