import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readListingReview, readReviewSourcePage, approveListingReview, type ListingReview } from './sellerListingReview';
const client = vi.hoisted(() => ({get:vi.fn(),post:vi.fn()}));
vi.mock('./client', () => ({api:client}));
const html = '<!doctype html><html><body>Regional retail — $25.00</body></html>';
const review = {presentation_version:'seller-listing-review-v2', rendered_html:html, render_hash:createHash('sha256').update(html).digest('hex')};
beforeEach(() => {vi.resetAllMocks();vi.stubGlobal('crypto',webcrypto);});
afterEach(() => vi.unstubAllGlobals());
it('returns only the exact render whose digest was prepared by the backend', async () => {
  client.get.mockResolvedValue({data:review});
  const signal = new AbortController().signal;
  expect(await readListingReview(signal)).toBe(review);
  expect(client.get).toHaveBeenCalledWith('/seller-workspace/listing-review',{signal});
});
it.each([
  {...review,rendered_html:html.replace('25.00','99.00')},
  {...review,presentation_version:'unknown-version'},
  {...review,render_hash:''},
  {...review,rendered_html:'x'.repeat(100001)},
])('rejects changed, unsupported or unbounded rendered reviews', async value => {
  client.get.mockResolvedValue({data:value});
  await expect(readListingReview(new AbortController().signal)).rejects.toThrow('Saved review could not be verified');
});
it('does not return a render after navigation cancels the request', async () => {
  client.get.mockResolvedValue({data:review});
  const controller = new AbortController();controller.abort();
  await expect(readListingReview(controller.signal)).rejects.toThrow('Saved review could not be verified');
});

it('sends only exact review identities and explicit confirmations, never source or HTML payloads', async () => {
  const prepared = {...review,review_hash:'c'.repeat(64),draft_version:1,source_version:2,confirmation_version:'seller-listing-confirmation-v1'} as ListingReview;
  const receipt = {id:'approval',review_hash:prepared.review_hash,render_hash:prepared.render_hash,draft_version:1,source_version:2,sample_decision:'none'};
  client.post.mockResolvedValue({data:receipt});
  const signal = new AbortController().signal;
  expect(await approveListingReview(prepared,'request-id',signal)).toEqual(receipt);
  const body = client.post.mock.calls[0][1];
  expect(body).toEqual({request_id:'request-id',review_hash:prepared.review_hash,render_hash:prepared.render_hash,confirmation_version:prepared.confirmation_version,sample_decision:'none',ownership_confirmed:true,privacy_confirmed:true,price_license_confirmed:true,public_disclosure_confirmed:true});
  client.post.mockResolvedValue({data:{...receipt,source_version:3}});
  await expect(approveListingReview(prepared,'request-id',signal)).rejects.toThrow('Approval could not be verified');
});


const page={review_hash:'a'.repeat(64),source_hash:'b'.repeat(64),source_version:1,offset:0,page_size:50,total_count:22000,total_size_bytes:22000,next_cursor:'next',files:Array.from({length:50},(_,i)=>({key:`private/${i}.csv`,size:1,etag:'e',version_id:null}))};
const complete={...review,review_hash:page.review_hash,source_hash:page.source_hash,source_version:1,approval_available:true,confirmation_version:'seller-listing-confirmation-v1',confirmation_statements:{ownership_confirmed:'Ownership',privacy_confirmed:'Privacy',price_license_confirmed:'Price/license',public_disclosure_confirmed:'Disclosure'},source_page:page} as ListingReview;
it('accepts a bounded first page for the full 22,000-file review',async()=>{
 client.get.mockResolvedValue({data:complete});
 expect(await readListingReview(new AbortController().signal)).toBe(complete);
});
it.each([
 {source_hash:'c'.repeat(64)}, {source_version:2}, {review_hash:'c'.repeat(64)},
 {total_count:21999}, {total_size_bytes:21999}, {offset:51}, {files:page.files.slice(0,0)},
 {next_cursor:null}, {files:[page.files[0],page.files[0]]}, {page_size:50001},
])('refuses a mismatched or incomplete subsequent page: %j',async change=>{
 client.get.mockResolvedValue({data:{...page,offset:50,...change}});
 await expect(readReviewSourcePage(complete,'next',50,new AbortController().signal)).rejects.toThrow('Saved review files could not be verified');
});
it('requests one cursor-bound page and refuses a cancelled response',async()=>{
 const next={...page,offset:50};client.get.mockResolvedValue({data:next});
 const controller=new AbortController();
 expect(await readReviewSourcePage(complete,'next',50,controller.signal)).toBe(next);
 expect(client.get).toHaveBeenCalledWith('/seller-workspace/listing-review/files',{params:{cursor:'next'},signal:controller.signal});
 controller.abort();
 await expect(readReviewSourcePage(complete,'next',50,controller.signal)).rejects.toThrow();
});
