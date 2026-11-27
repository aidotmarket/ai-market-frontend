import {beforeEach,expect,it,vi} from 'vitest';
import {authorityAvailable,confirmAuthorityReview,importAuthorityDraft,type AuthorityImportRequest,type AuthorityReview} from './sellerWorkspace';
import {nativeClient,nativeSession} from './connector-seller-settings';
import {useAuthStore} from '@/store/auth';
const id='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.restoreAllMocks();useAuthStore.setState({token:'token',user:{id} as never});});
it('requires enabled, known contract and native version',()=>{
 expect(authorityAvailable({import_enabled:true,contract_version:'listing-authority-v1',handoff_versions:[1]})).toBe(true);
 for(const c of [{import_enabled:false,contract_version:'listing-authority-v1',handoff_versions:[1]},{import_enabled:true,contract_version:'unknown',handoff_versions:[1]},{import_enabled:true,contract_version:'listing-authority-v1',handoff_versions:[2]}])expect(authorityAvailable(c)).toBe(false);
});
it('T1 pairs CSRF headers/body, preserves exact import keys and accepts duplicate receipts',async()=>{
 const receipt={import_id:id,draft_id:id,listing_id:null,authority_version_id:id};
 const post=vi.spyOn(nativeClient,'post').mockResolvedValue({data:receipt});
 const request:AuthorityImportRequest={contract_version:'listing-authority-v1',handoff:'compressed',idempotency_key:id,account_id:id,account_confirmed:true,target_confirmed:true,target:{type:'gateway',gateway_id:id,file_ids:['a'],expected_metadata_revision:9}};
 expect(await importAuthorityDraft(request)).toEqual(receipt);expect(await importAuthorityDraft(request)).toEqual(receipt);
 expect(post.mock.calls[0]).toEqual(['/listing-authority/imports',{...request,csrf:nativeSession().csrf},{headers:nativeSession().headers}]);
 expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
});
it('passes a 409 unchanged for the reviewed customer-code mapping',async()=>{
 const refusal={response:{status:409,data:{detail:{code:'AUTHORITY_DRAFT_IN_PROGRESS'}}}};
 vi.spyOn(nativeClient,'post').mockRejectedValue(refusal);
 await expect(importAuthorityDraft({} as AuthorityImportRequest)).rejects.toBe(refusal);
});
it('sends only the server binding/hash/revision for purchaser confirmation, never private terms or inventory',async()=>{
 const post=vi.spyOn(nativeClient,'post').mockResolvedValue({data:{event_id:id}});
 const view={authority_version_id:id,binding_hash:'binding',gateway_metadata_revision:9,purchaser_view_hash:'hash',purchaser_view:{files:[{delivery_name:'private'}]},identity_terms:['secret']} as unknown as AuthorityReview;
 await confirmAuthorityReview(view,'purchaser',id);
 expect(post.mock.calls[0][1]).toEqual({contract_version:'listing-authority-v1',authority_version_id:id,expected_binding_hash:'binding',idempotency_key:id,confirmed:true,gateway_metadata_revision:9,view_hash:'hash',csrf:nativeSession().csrf});
});
