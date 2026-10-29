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
