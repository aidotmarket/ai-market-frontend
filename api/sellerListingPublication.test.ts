import {beforeEach,expect,it,vi} from 'vitest';
import {readPublication,publishListing,readPublicationPage} from './sellerListingPublication';
import type {ApprovalReceipt} from './sellerListingReview';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));vi.mock('./client',()=>({api}));
const id='00000000-0000-4000-8000-000000000001';
const approval={id,review_hash:'a'.repeat(64),render_hash:'b'.repeat(64)} as ApprovalReceipt;
const receipt={id,approval_id:id,listing_id:id,listing_version_id:id,title:'Retail',slug:'retail',status:'published',is_listed:true,published_at:'2026-09-08T00:00:00Z',review_hash:approval.review_hash,render_hash:approval.render_hash};
beforeEach(()=>vi.resetAllMocks());
it('publishes only the approval binding and stable request identity',async()=>{
  api.post.mockResolvedValue({data:receipt});const signal=new AbortController().signal;
  expect(await publishListing(approval,id,signal)).toEqual(receipt);
  expect(api.post).toHaveBeenCalledWith('/seller-workspace/listing-publication',{
    request_id:id,approval_id:id,review_hash:approval.review_hash,render_hash:approval.render_hash},{signal});
});
it('refuses a receipt from a different approved render',async()=>{
  api.get.mockResolvedValue({data:{publication_available:true,publication:{...receipt,render_hash:'c'.repeat(64)}}});
  await expect(readPublication(approval,new AbortController().signal)).rejects.toThrow(/verified/);
});
it('rejects a page for a different request and ignores cancelled responses',async()=>{
  api.get.mockResolvedValue({data:{items:[receipt],page:1,has_more:false}});
  await expect(readPublicationPage(0,new AbortController().signal)).rejects.toThrow(/verified/);
  api.get.mockResolvedValue({data:{publication_available:true,publication:receipt}});
  const request=new AbortController();request.abort();await expect(readPublication(approval,request.signal)).rejects.toThrow();
});
