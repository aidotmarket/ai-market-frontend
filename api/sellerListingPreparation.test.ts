import * as client from './client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {lookupPreparation,prepareListing,preparationRequest,preparationError} from './sellerListingPreparation';
import {nativeClient,nativeSession} from './connector-seller-settings';
import {useAuthStore} from '@/store/auth';
import {instrument,id,hash} from '@/tests/fixtures/seller-authority';
import type {ApprovalReceipt} from './sellerListingReview';
const row=instrument();
const approval={id:row.binding.approval_id,draft_id:row.binding.draft_id,draft_version:3,review_hash:hash,render_hash:hash,license_selection:row.license_selection} as ApprovalReceipt;
beforeEach(()=>useAuthStore.setState({token:'session'}));
afterEach(()=>vi.restoreAllMocks());
it('sends exactly seven fields and reuses the action binding across refreshed CSRF',async()=>{
  const post=vi.spyOn(nativeClient,'post').mockRejectedValueOnce(new Error('lost response')).mockResolvedValue({data:row});
  const request=preparationRequest(approval);const signal=new AbortController().signal;
  await expect(prepareListing(request,approval,signal)).rejects.toThrow('lost response');
  useAuthStore.setState({token:'refreshed-session'});
  await prepareListing(request,approval,signal);
  const first=post.mock.calls[0][1] as Record<string,unknown>,second=post.mock.calls[1][1] as Record<string,unknown>;
  expect(Object.keys(second).sort()).toEqual(['request_id','draft_id','expected_draft_version','approval_id','review_hash','render_hash','csrf'].sort());
  expect({...first,csrf:second.csrf}).toEqual(second);expect(first.csrf).not.toBe(second.csrf);
  expect(second.csrf).toBe(nativeSession().csrf);
  expect(second.expected_draft_version).toBe(approval.draft_version);
  expect(post.mock.calls[1][2]).toEqual({signal,headers:nativeSession().headers});
});
it('looks up the exact named revision and treats only NOT_FOUND as an absent preparation',async()=>{
  const get=vi.spyOn(nativeClient,'get').mockResolvedValue({data:row});const signal=new AbortController().signal;
  expect(await lookupPreparation(approval,signal)).toEqual(row);
  expect(get).toHaveBeenCalledWith('/seller-workspace/listing-preparation',{signal,headers:nativeSession().headers,params:{draft_id:approval.draft_id,draft_version:3}});
  get.mockRejectedValue({isAxiosError:true,response:{status:404,data:{detail:'NOT_FOUND'}}});expect(await lookupPreparation(approval,signal)).toBeNull();
  get.mockRejectedValue({isAxiosError:true,response:{status:404,data:{detail:'UNAVAILABLE'}}});await expect(lookupPreparation(approval,signal)).rejects.toBeDefined();
  get.mockResolvedValue({data:{...row,binding:{...row.binding,draft_id:id(999)}}});await expect(lookupPreparation(approval,signal)).rejects.toThrow('INVALID_PREPARATION');
});
it.each([
  [409,'LICENSE_ACCEPTANCE_STALE','re-select the licence and covenant at the current version'],
  [409,{code:'LICENSE_ACCEPTANCE_STALE'},'re-select the licence and covenant at the current version'],
  [409,'PREPARATION_EXISTS','already exists'],[409,'IDEMPOTENCY_CONFLICT','no longer matches'],
  [409,'LICENSE_SIGNING_UNAVAILABLE','signing is currently unavailable'],[409,'PREPARATION_STALE','files changed'],
  [401,'FIRST_PARTY_SESSION_REQUIRED','Sign in again'],[403,'POLICY_DENIED','seller policy'],[404,'UNAVAILABLE','currently unavailable'],
  [503,'APPROVAL_UNAVAILABLE','Approval or policy'],[409,'FUTURE_BACKEND_CODE','could not be confirmed'],
])('maps %s %s safely', (status,detail,copy)=>{
  expect(preparationError({isAxiosError:true,response:{status,data:{detail}}})).toContain(copy);
});

it('preserves lookup parameters and cancellation across one session refresh', async () => {
  const signal = new AbortController().signal;
  const get = vi.spyOn(nativeClient, 'get')
    .mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    .mockResolvedValueOnce({ data: row });
  const refresh = vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    useAuthStore.setState({ token: 'fresh-lookup-session' });
    return 'fresh-lookup-session';
  });
  expect(await lookupPreparation(approval, signal)).toEqual(row);
  expect(refresh).toHaveBeenCalledOnce();
  expect(get).toHaveBeenLastCalledWith('/seller-workspace/listing-preparation', {
    signal, headers: nativeSession().headers, params: { draft_id: approval.draft_id, draft_version: 3 },
  });
});

it('refuses correction inputs before constructing a signing preparation or writing it',async()=>{
 const {default:wire}=await import('@/tests/fixtures/s1922-backend-wire.json');
 const c=wire.public[2].corrected;
 const post=vi.spyOn(nativeClient,'post');
 for(const key of ['presentation_kind','original_render_hash','original_admitted_render_hash','correction_id','correction_digest','provenance','license_label'] as const){
  const invalid={...approval,[key]:c[key]};
  expect(()=>preparationRequest(invalid)).toThrow('Original signing evidence');
  await expect(prepareListing({request_id:id(9),draft_id:approval.draft_id!,expected_draft_version:3,approval_id:approval.id,review_hash:hash,render_hash:hash},invalid,new AbortController().signal)).rejects.toThrow();
 }
 expect(post).not.toHaveBeenCalled();
});

// Backend20bc449 seller_listing_publication.preparation_view omits selection;
// read_preparation adds approval.public_fields.get(), hence JSON null or object.
// These status reads do not grant signing authority (covered in batch tests).
const {license_selection: savedSelection,...baseView}=row;
const {license_selection: _selection,...unlicensedApproval}=approval;
it.each([
  {name:'omitted POST selection',data:baseView,owner:unlicensedApproval},
  {name:'null GET selection',data:{...baseView,license_selection:null},owner:unlicensedApproval},
  {name:'selected GET instrument',data:{...baseView,license_selection:savedSelection},owner:approval},
])('recovers $name with its original binding and signed coverage',async({data,owner})=>{
  const signed={...data,status:'signed',signing_required:false,acceptance_id:id(20),signed_coverage_hash:'b'.repeat(64)};
  vi.spyOn(nativeClient,'get').mockResolvedValue({data:signed});
  expect(await lookupPreparation(owner,new AbortController().signal)).toEqual(signed);
});
it('keeps an omitted POST selection omitted locally unless the approval supplies it',async()=>{
  vi.spyOn(nativeClient,'post').mockResolvedValue({data:baseView});
  const signal=new AbortController().signal;
  const plain=await prepareListing(preparationRequest(unlicensedApproval),unlicensedApproval,signal);
  expect(plain).toEqual(baseView);
  expect(Object.hasOwn(plain,'license_selection')).toBe(false);
  expect(await prepareListing(preparationRequest(approval),approval,signal)).toEqual({...baseView,license_selection:savedSelection});
});
it.each([
  {name:'explicit undefined',selection:undefined},
  {name:'unknown discriminator',selection:{...savedSelection,presentation_kind:'future-correction'}},
  {name:'null discriminator',selection:{...savedSelection,presentation_kind:null}},
  {name:'correction digest',selection:{...savedSelection,correction_digest:hash}},
])('refuses $name in preparation selection',async({selection})=>{
  vi.spyOn(nativeClient,'get').mockResolvedValue({data:{...baseView,license_selection:selection}});
  await expect(lookupPreparation(approval,new AbortController().signal)).rejects.toThrow();
});
it.each([
  {name:'foreign approval',binding:{...baseView.binding,approval_id:id(999)}},
  {name:'foreign draft',binding:{...baseView.binding,draft_id:id(999)}},
  {name:'stale draft revision',binding:{...baseView.binding,draft_version:4}},
  {name:'changed original render',binding:{...baseView.binding,render_hash:'c'.repeat(64)}},
  {name:'corrected binding',binding:{...baseView.binding,correction_digest:hash}},
  {name:'invalid signed coverage',signed_coverage_hash:null},
  {name:'unknown presentation',presentation_kind:'future-correction'},
])('still refuses $name when recovery has a null selection',async({name:_name,...change})=>{
  const signed={...baseView,license_selection:null,status:'signed',signing_required:false,acceptance_id:id(20),signed_coverage_hash:'b'.repeat(64),...change};
  vi.spyOn(nativeClient,'get').mockResolvedValue({data:signed});
  await expect(lookupPreparation(unlicensedApproval,new AbortController().signal)).rejects.toThrow();
});
