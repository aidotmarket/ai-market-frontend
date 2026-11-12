import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readListingReview, readReviewSourcePage, approveListingReview, type ListingReview } from './sellerListingReview';
import {nativeClient,nativeSession} from './connector-seller-settings';
import {useAuthStore} from '@/store/auth';
import {id, instrument} from '@/tests/fixtures/seller-authority';
import savedWire from '@/tests/fixtures/s1922-saved-review-wire.json';
import publicWire from '@/tests/fixtures/s1922-backend-wire.json';
import {preparationRequest, prepareListing} from './sellerListingPreparation';
import {readSigningInstruments, signInstruments} from './seller-batch-signing';
import {createStandardSelection} from './listingLicenses';
const client = vi.hoisted(() => ({get:vi.fn(),post:vi.fn()}));
vi.mock('./client', () => ({api:client}));
const html = '<!doctype html><html><body>Regional retail — $25.00</body></html>';
const review = {presentation_version:'seller-listing-review-v2', rendered_html:html, render_hash:createHash('sha256').update(html).digest('hex')};
beforeEach(() => {vi.resetAllMocks();vi.stubGlobal('crypto',webcrypto);});
afterEach(() => vi.unstubAllGlobals());
it.each(['seller-listing-review-v2','seller-listing-review-v3','seller-listing-review-v4'])('returns the exact verified %s render', async presentation_version => {
  const value={...review,presentation_version};
  client.get.mockResolvedValue({data:value});
  const signal = new AbortController().signal;
  expect(await readListingReview(signal)).toBe(value);
  expect(client.get).toHaveBeenCalledWith('/seller-workspace/listing-review',{signal});
});
it.each([
  {...review,rendered_html:html.replace('25.00','99.00')},
  {...review,presentation_version:'seller-listing-review-v4',rendered_html:html.replace('25.00','99.00')},
  {...review,presentation_version:'unknown-version'},
  {...review,presentation_version:'seller-listing-review-v5'},
  {...review,render_hash:''},
  {...review,rendered_html:'x'.repeat(100001)},
  {...review,presentation_version:'seller-listing-review-v4',rendered_html:'x'.repeat(100001)},
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

it('sends the v2 member-file confirmation without client-authored indices',async()=>{
 const prepared={...review,review_hash:'c'.repeat(64),draft_version:1,source_version:2,confirmation_version:'seller-listing-confirmation-v2' as const,
  sample_decision:'member_files' as const,sample_object_indices:[1,4]} as ListingReview;
 const receipt={id:'approval',review_hash:prepared.review_hash,render_hash:prepared.render_hash,draft_version:1,source_version:2,sample_decision:'member_files'};
 client.post.mockResolvedValue({data:receipt});
 await approveListingReview(prepared,'request-id',new AbortController().signal);
 expect(client.post.mock.calls[0][1]).toMatchObject({confirmation_version:'seller-listing-confirmation-v2',sample_decision:'member_files',sample_files_confirmed:true});
 expect(client.post.mock.calls[0][1]).not.toHaveProperty('sample_object_indices');
});
it('replaces the combined price/license checkbox with explicit licence and covenant facts',async()=>{
 const selection={...createStandardSelection(),seller_acceptance:{signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true}};
 const prepared={...review,review_hash:'c'.repeat(64),draft_version:1,source_version:2,confirmation_version:'seller-listing-confirmation-v3' as const,
  sample_decision:'none' as const,license_selection:selection} as ListingReview;
 const receipt={id:'approval',review_hash:prepared.review_hash,render_hash:prepared.render_hash,draft_version:1,source_version:2,sample_decision:'none',license_selection:selection};
 client.post.mockResolvedValue({data:receipt});
 expect((await approveListingReview(prepared,'request-id',new AbortController().signal)).license_selection).toEqual(selection);
 const body=client.post.mock.calls[0][1];
 expect(body).toMatchObject({price_confirmed:true,license_confirmed:true,covenant_authority_confirmed:true,license_selection:selection});
 expect(body).not.toHaveProperty('price_license_confirmed');
 client.post.mockResolvedValue({data:{...receipt,license_selection:{...selection,ai_training:false}}});
 await expect(approveListingReview(prepared,'request-id',new AbortController().signal)).rejects.toThrow('Approval could not be verified');
});
it('matches the exact backend flag-on ListingApprovalRequest fields for member files',async()=>{
 // Copied from ListingApprovalRequest at backend 7a222a13 (LISTING_LICENSES_ENABLED=true; extra=forbid).
 const allowed=['request_id','review_hash','render_hash','confirmation_version','sample_decision',
  'sample_files_confirmed','ownership_confirmed','privacy_confirmed','public_disclosure_confirmed',
  'license_selection','price_confirmed','license_confirmed','covenant_authority_confirmed'];
 const selection={...createStandardSelection(),seller_acceptance:{signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true}};
 const prepared={...review,review_hash:'c'.repeat(64),draft_version:1,source_version:2,confirmation_version:'seller-listing-confirmation-v3' as const,
  sample_decision:'member_files' as const,sample_object_indices:[0],license_selection:selection} as ListingReview;
 client.post.mockResolvedValue({data:{id:'approved',review_hash:prepared.review_hash,render_hash:prepared.render_hash,draft_version:1,source_version:2,sample_decision:'member_files',license_selection:selection}});
 await approveListingReview(prepared,'request-id',new AbortController().signal);
 const body=client.post.mock.calls[0][1];
 expect(Object.keys(body).sort()).toEqual(allowed.sort());
 const matchesBackendSchema=(value:Record<string,unknown>)=>Object.keys(value).every(key=>allowed.includes(key));
 expect(matchesBackendSchema(body)).toBe(true);
 expect(matchesBackendSchema({...body,sample_object_indices:[0]})).toBe(false);
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

it('keeps named draft identity through review, pagination, restored approval and approval POST',async()=>{
  useAuthStore.setState({token:'native-session'});
  const named={...complete,draft_id:id(101),draft_version:3,approval:{id:id(201),review_hash:complete.review_hash,render_hash:complete.render_hash,draft_version:3,source_version:1,sample_decision:'none' as const}};
  const signal=new AbortController().signal;
  client.get.mockResolvedValueOnce({data:named});
  const saved=await readListingReview(signal,id(101));
  expect(client.get).toHaveBeenCalledWith('/seller-workspace/listing-review',{signal,params:{draft_id:id(101)}});
  expect(saved.approval?.draft_id).toBe(id(101));
  client.get.mockResolvedValueOnce({data:{...page,offset:50}});
  await readReviewSourcePage(saved,'next',50,signal);
  expect(client.get).toHaveBeenLastCalledWith('/seller-workspace/listing-review/files',{params:{cursor:'next',draft_id:id(101)},signal});
  const post=vi.spyOn(nativeClient,'post').mockResolvedValue({data:named.approval});
  try {
    const receipt=await approveListingReview(saved,id(9),signal);
    expect(receipt.draft_id).toBe(id(101));expect(receipt.draft_version).toBe(3);
    expect(post).toHaveBeenCalledWith('/seller-workspace/listing-approval',expect.objectContaining({draft_id:id(101),review_hash:saved.review_hash,csrf:nativeSession().csrf}),{signal,headers:nativeSession().headers});
  } finally {post.mockRestore();}
});

// Independent cases: do not derive refusal expectations from implementation keys.
const c=publicWire.public[2].corrected;
const correctionVariants = [
 {presentation_kind:c.presentation_kind}, {presentation_kind:'unknown-correction-v9'}, {presentation_kind:null},
 {provenance:c.provenance}, {provenance:'unknown'}, {provenance:null},
 {license_label:c.license_label}, {original_render_hash:c.original_render_hash},
 {original_admitted_render_hash:c.original_admitted_render_hash}, {correction_id:c.correction_id},
 {correction_digest:c.correction_digest}, {correction_digest:null},
 {license_display:{license_label:c.license_label,provenance:c.provenance,correction_id:c.correction_id,correction_digest:c.correction_digest}},
 {license_display:null}, {public_presentation:c}, {approved_presentation:c}, {...c},
];

it.each(savedWire.fixtures)('reads actual backend saved-review $name and preserves pagination, approval and original requests',async fixture=>{
 const value=structuredClone(fixture.review) as ListingReview;
 const original=structuredClone(value);
 const signal=new AbortController().signal;
 client.get.mockResolvedValueOnce({data:value});
 const saved=await readListingReview(signal,value.draft_id);
 expect(saved).toEqual({...original,approval:{...original.approval,draft_id:value.draft_id}});
 expect(saved.listing_id).toBe(fixture.review.listing_id);
 expect(saved.base_listing_version_id).toBe(fixture.review.base_listing_version_id);
 expect(saved.source_page?.files).toHaveLength(2);
 client.get.mockResolvedValueOnce({data:fixture.next_page});
 expect(await readReviewSourcePage(saved,saved.source_page!.next_cursor!,2,signal)).toEqual(fixture.next_page);
 expect(client.get).toHaveBeenLastCalledWith('/seller-workspace/listing-review/files',{
  params:{cursor:saved.source_page!.next_cursor,draft_id:saved.draft_id},signal});
 useAuthStore.setState({token:'synthetic-r1-session'});
 const post=vi.spyOn(nativeClient,'post').mockResolvedValueOnce({data:fixture.review.approval});
 try {
  const approved=await approveListingReview(saved,id(91),signal);
  const expected={request_id:id(91),draft_id:saved.draft_id,review_hash:original.review_hash,render_hash:original.render_hash,
   confirmation_version:original.confirmation_version,sample_decision:'none',ownership_confirmed:true,privacy_confirmed:true,
   public_disclosure_confirmed:true,...(original.license_selection ? {price_confirmed:true,license_confirmed:true,covenant_authority_confirmed:true,
    license_selection:original.license_selection} : {price_license_confirmed:true}),csrf:nativeSession().csrf};
  expect(post).toHaveBeenCalledWith('/seller-workspace/listing-approval',expected,{signal,headers:nativeSession().headers});
  const request=preparationRequest(approved);
  expect(request).toEqual({request_id:expect.any(String),draft_id:saved.draft_id,expected_draft_version:original.draft_version,
   approval_id:fixture.review.approval.id,review_hash:original.review_hash,render_hash:original.render_hash});
  // Synthetic preparation I/O; actual frontend verifiers and signing functions.
  const seed=instrument();
  const prepared={...seed,binding:{...seed.binding,draft_id:saved.draft_id!,draft_version:original.draft_version,
   approval_id:approved.id,listing_id:saved.listing_id??seed.binding.listing_id,base_version_id:saved.base_listing_version_id??null,
   source_hash:original.source_hash,render_hash:original.render_hash},
   ...(original.license_selection ? {license_selection:original.license_selection} : {})};
  post.mockResolvedValueOnce({data:prepared});
  const result=await prepareListing(request,approved,signal);
  expect(post.mock.lastCall?.[1]).toEqual({...request,csrf:nativeSession().csrf});
  expect(result.binding).toEqual(prepared.binding);
  if(original.license_selection){
   const get=vi.spyOn(nativeClient,'get').mockResolvedValueOnce({data:prepared});
   try {
    const [signing]=await readSigningInstruments([prepared.id]);
    const body={request_id:id(92),csrf:nativeSession().csrf,instruments:[{preparation_id:signing.id,
     coverage_hash:signing.coverage_hash,selection:signing.license_selection}]};
    const signed={...prepared,status:'signed',signed_coverage_hash:prepared.coverage_hash,acceptance_id:id(93),signing_required:false};
    post.mockResolvedValueOnce({data:{instruments:[signed]}});
    expect(await signInstruments(body,signal)).toEqual([signed]);
    expect(post).toHaveBeenLastCalledWith('/seller-workspace/listing-licences/sign',body,{signal,headers:nativeSession().headers});
    expect(body.instruments).toEqual([{preparation_id:prepared.id,coverage_hash:seed.coverage_hash,selection:original.license_selection}]);
    expect(signed.binding.render_hash).toBe(original.render_hash);
    expect(signed.binding.source_hash).toBe(original.source_hash);
   } finally {get.mockRestore();}
  }
  expect(saved.rendered_html).toBe(original.rendered_html);
  expect(saved.fields).toEqual(original.fields);
  expect(saved.license_selection).toEqual(original.license_selection);
 } finally {post.mockRestore();}
});

it.each(correctionVariants)('refuses independently named correction variant %j in saved evidence before reading or posting',async marker=>{
 const base=structuredClone(savedWire.fixtures[0].review) as ListingReview;
 const post=vi.spyOn(nativeClient,'post');
 try {
  for(const location of ['review','fields','approval','license_selection'] as const){
   const invalid=location==='review' ? {...base,...marker} : {...base,[location]:{...base[location],...marker}};
   client.get.mockResolvedValue({data:invalid});
   await expect(readListingReview(new AbortController().signal)).rejects.toThrow(/original .*evidence/i);
   await expect(approveListingReview(invalid,id(9),new AbortController().signal)).rejects.toThrow(/original .*evidence/i);
  }
  expect(client.post).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
 } finally {post.mockRestore();}
});

it.each(savedWire.fixtures.filter(fixture=>!!fixture.review.license_selection))('retains selection, source and restored approval refusals for $name',async fixture=>{
 const value=structuredClone(fixture.review) as ListingReview;
 const mutations=[
  {...value,approval:{...value.approval!,render_hash:'0'.repeat(64)}},
  {...value,approval:{...value.approval!,license_selection:{...value.license_selection!,ai_training:false}}},
  {...value,source_page:{...value.source_page!,source_hash:'0'.repeat(64)}},
  {...value,draft_id:id(999)},
 ];
 for(const invalid of mutations){
  client.get.mockResolvedValue({data:invalid});
  await expect(readListingReview(new AbortController().signal,value.draft_id)).rejects.toThrow('Saved review could not be verified');
 }
});
