import * as client from './client';
import type {User} from '@/types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeClient, nativeSession, nativeWrite, nativeAuthError, newDecision, readAuthority, reviewAuthority, setAuthority, reviewStopAuthority, stopAuthority, readPreview, reviewRevokePreview, revokePreview, validLimits } from './connector-seller-settings';
import { useAuthStore } from '@/store/auth';
import { authority, limits, hash, id, preview } from '@/tests/fixtures/seller-authority';
beforeEach(() => { useAuthStore.setState({ user: {id:id(99)} as User, token: 'retained-native-credential' }); });
afterEach(() => vi.restoreAllMocks());
it('reads the exact authority path with retained authorization and CSRF', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ data: authority }); expect(await readAuthority()).toEqual(authority);
  expect(get).toHaveBeenCalledWith('/connector-seller-settings', { headers: nativeSession().headers });
});
it('renders a stopped authority with no prior limits safely', async () => {
  vi.spyOn(nativeClient, 'get').mockResolvedValue({ data: { ...authority, enabled: false, limits: {} } }); expect((await readAuthority()).limits).toEqual({});
});
it('reviews exact material then posts the same typed body/hash, retaining credential and CSRF', async () => {
  const body = { ...newDecision(4), limits }; const { csrf: _csrf, ...decision } = body;
  const post = vi.spyOn(nativeClient, 'post').mockResolvedValueOnce({ data: { action: 'aim.seller.connector_limits.set', decision, review_hash: hash } }).mockResolvedValueOnce({ data: { decision_id: id(90), version: 5, enabled: true } });
  const review = await reviewAuthority(body); await setAuthority({ ...body, review_hash: review.review_hash });
  expect(post.mock.calls[0]).toEqual(['/connector-seller-settings/authority/review', body, { headers: nativeSession().headers }]);
  expect(post.mock.calls[1]).toEqual(['/connector-seller-settings/authority', { ...body, review_hash: hash }, { headers: nativeSession().headers }]);
});
it.each(['changed-material', 'wrong-action', 'missing-hash'])('refuses server review mismatch %s', async reason => {
  const body = { ...newDecision(4), limits }; const { csrf: _csrf, ...decision } = body;
  vi.spyOn(nativeClient, 'post').mockResolvedValue({ data: { action: reason === 'wrong-action' ? 'other' : 'aim.seller.connector_limits.set', decision: reason === 'changed-material' ? { ...decision, expected_version: 3 } : decision, review_hash: reason === 'missing-hash' ? '' : hash } });
  await expect(reviewAuthority(body)).rejects.toThrow('EXACT_REVIEW_REQUIRED');
});
it('does not replay a decision after credential rotation', async () => {
  const body = newDecision(4); useAuthStore.setState({ token: 'another-session' }); const post = vi.spyOn(nativeClient, 'post');
  await expect(stopAuthority(body)).rejects.toThrow('SESSION_CHANGED'); expect(post).not.toHaveBeenCalled();
});
it.each(['stop', 'preview'] as const)('uses the 44a13668 dedicated %s review then matching hash and native proof', async kind => {
  const body = { ...newDecision(kind === 'stop' ? 4 : 3), reauth_token: 'native-proof', ...(kind === 'preview' ? { listing_id: id(10), publication_version_id: id(12), sample_set_hash: hash } : {}) };
  const { csrf: _csrf, reauth_token: _proof, ...decision } = body;
  const path = kind === 'stop' ? '/authority/stop' : '/preview-consent/revoke';
  const action = kind === 'stop' ? 'aim.seller.connector_limits.revoke' : 'aim.listing.ai_preview_consent.revoke';
  const post = vi.spyOn(nativeClient, 'post').mockResolvedValueOnce({ data: { action, decision, review_hash: hash } }).mockResolvedValueOnce({ data: { decision_id: id(90), version: body.expected_version + 1, enabled: false } });
  const review = kind === 'stop' ? await reviewStopAuthority(body) : await reviewRevokePreview(body as Parameters<typeof reviewRevokePreview>[0]);
  const submission = { ...body, review_hash: review.review_hash };
  if (kind === 'stop') await stopAuthority(submission); else await revokePreview(submission as Parameters<typeof revokePreview>[0]);
  expect(post.mock.calls).toEqual([[`/connector-seller-settings${path}/review`, body, { headers: nativeSession().headers }], [`/connector-seller-settings${path}`, submission, { headers: nativeSession().headers }]]);
});
it('reads preview status for the exact listing', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ data: preview }); await readPreview(id(10));
  expect(get).toHaveBeenCalledWith(`/connector-seller-settings/preview-consent/${id(10)}`, { headers: nativeSession().headers });
});
it.each([{ max_batch: 51 }, { concurrent_operations: 0 }, { daily_items: {} }, { operations: ['publish', 'publish'] }, { expires_at: '2099-01-01' }, { price_min_cents: 10001 }])('refuses unsafe standing limits %j', patch => { expect(validLimits({ ...limits, ...patch })).toBe(false); });

it.each(['listing-approval','listing-preparation','listing-licences/sign','listing-publication'])('refreshes once for %s with the same action and a fresh credential pair', async endpoint => {
  const expired = {isAxiosError:true,response:{status:401}};
  const post = vi.spyOn(nativeClient,'post').mockRejectedValueOnce(expired).mockResolvedValue({data:{ok:true}});
  const refresh = vi.spyOn(client,'refreshAccessToken').mockImplementation(async()=>{
    useAuthStore.setState({token:'fresh-native-session'});
    return 'fresh-native-session';
  });
  const firstSession = nativeSession();
  const body = {request_id:id(91),approval_id:id(92)};
  expect(await nativeWrite('/seller-workspace/'+endpoint,body)).toEqual({ok:true});
  expect(refresh).toHaveBeenCalledOnce();
  expect(post.mock.calls[0]).toEqual(['/seller-workspace/'+endpoint,{...body,csrf:firstSession.csrf},{headers:firstSession.headers}]);
  expect(post.mock.calls[1]).toEqual(['/seller-workspace/'+endpoint,{...body,csrf:nativeSession().csrf},{headers:nativeSession().headers}]);
});
it('surfaces a second 401 without a second refresh', async()=>{
  const expired={isAxiosError:true,response:{status:401}};
  const post=vi.spyOn(nativeClient,'post').mockRejectedValue(expired);
  const refresh=vi.spyOn(client,'refreshAccessToken').mockResolvedValue('retained-native-credential');
  await expect(nativeWrite('/seller-workspace/listing-approval',{request_id:id(91)})).rejects.toBe(expired);
  expect(post).toHaveBeenCalledTimes(2);expect(refresh).toHaveBeenCalledOnce();
});
it('rejects a session change without retrying the write', async()=>{
  const post=vi.spyOn(nativeClient,'post').mockImplementation(async()=>{
    useAuthStore.setState({user:{id:id(98)} as User,token:'other-account-session'});
    return {data:{ok:true}};
  });
  const refresh=vi.spyOn(client,'refreshAccessToken');
  await expect(nativeWrite('/seller-workspace/listing-approval',{request_id:id(91)})).rejects.toThrow('SESSION_CHANGED');
  expect(post).toHaveBeenCalledOnce();expect(refresh).not.toHaveBeenCalled();
});

it('retries a concurrent refresh 401 with the re-read credential pair without refreshing again', async()=>{
  const first=nativeSession();
  const body={request_id:id(91)};
  const post=vi.spyOn(nativeClient,'post').mockImplementationOnce(async()=>{
    useAuthStore.setState({token:'concurrently-refreshed'});
    throw {isAxiosError:true,response:{status:401}};
  }).mockResolvedValueOnce({data:{ok:true}});
  const refresh=vi.spyOn(client,'refreshAccessToken');
  expect(await nativeWrite('/seller-workspace/listing-preparation',body)).toEqual({ok:true});
  expect(post.mock.calls).toEqual([
    ['/seller-workspace/listing-preparation',{...body,csrf:first.csrf},{headers:first.headers}],
    ['/seller-workspace/listing-preparation',{...body,csrf:nativeSession().csrf},{headers:nativeSession().headers}],
  ]);
  expect(refresh).not.toHaveBeenCalled();
});
it('never retries a concurrent 401 across an account change',async()=>{
  const post=vi.spyOn(nativeClient,'post').mockImplementation(async()=>{
    useAuthStore.setState({user:null,token:null});
    throw {isAxiosError:true,response:{status:401}};
  });
  await expect(nativeWrite('/seller-workspace/listing-preparation',{request_id:id(91)})).rejects.toThrow('SESSION_CHANGED');
  expect(post).toHaveBeenCalledOnce();
});

it('accepts a confirmed write when credentials rotate for the same user during the response',async()=>{
  vi.spyOn(nativeClient,'post').mockImplementation(async()=>{
    useAuthStore.setState({token:'concurrently-refreshed'});
    return {data:{ok:true}};
  });
  expect(await nativeWrite('/seller-workspace/listing-preparation',{request_id:id(91)})).toEqual({ok:true});
});

it('refreshes an authority read once and retries with the fresh credential pair', async () => {
  const expired = { isAxiosError: true, response: { status: 401 } };
  const first = nativeSession();
  const get = vi.spyOn(nativeClient, 'get').mockRejectedValueOnce(expired).mockResolvedValueOnce({ data: authority });
  const refresh = vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    useAuthStore.setState({ token: 'fresh-read-session' });
    return 'fresh-read-session';
  });
  expect(await readAuthority()).toEqual(authority);
  expect(refresh).toHaveBeenCalledOnce();
  expect(get.mock.calls).toEqual([
    ['/connector-seller-settings', { headers: first.headers }],
    ['/connector-seller-settings', { headers: nativeSession().headers }],
  ]);
});
it('does not refresh an authority read twice after repeated 401s', async () => {
  const expired = { isAxiosError: true, response: { status: 401 } };
  const get = vi.spyOn(nativeClient, 'get').mockRejectedValue(expired);
  const refresh = vi.spyOn(client, 'refreshAccessToken').mockResolvedValue('retained-native-credential');
  await expect(readAuthority()).rejects.toBe(expired);
  expect(get).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledOnce();
});
it('rejects an identity change during authority refresh without replaying', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
  const refresh = vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    useAuthStore.setState({ user: { id: id(98) } as User, token: 'other-account' });
    return 'other-account';
  });
  await expect(readAuthority()).rejects.toThrow('SESSION_CHANGED');
  expect(get).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
});
it('propagates an authority refresh failure to the native sign-in affordance', async () => {
  const expired = { isAxiosError: true, response: { status: 401 } };
  const failedRefresh = { isAxiosError: true, response: { status: 401, data: { detail: 'expired' } } };
  const get = vi.spyOn(nativeClient, 'get').mockRejectedValue(expired);
  vi.spyOn(client, 'refreshAccessToken').mockRejectedValue(failedRefresh);
  await expect(readAuthority()).rejects.toBe(failedRefresh);
  expect(nativeAuthError(failedRefresh)).toEqual({ response: { status: 401 } });
  expect(get).toHaveBeenCalledOnce();
});
it('retries an authority read with concurrently refreshed credentials without refreshing again', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockImplementationOnce(async () => {
    useAuthStore.setState({ token: 'concurrently-refreshed-read' });
    throw { isAxiosError: true, response: { status: 401 } };
  }).mockResolvedValueOnce({ data: authority });
  const refresh = vi.spyOn(client, 'refreshAccessToken');
  expect(await readAuthority()).toEqual(authority);
  expect(get).toHaveBeenCalledTimes(2);
  expect(refresh).not.toHaveBeenCalled();
});

it('refreshes a preview read and still validates the listing binding', async () => {
  const get = vi.spyOn(nativeClient, 'get')
    .mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    .mockResolvedValueOnce({ data: { ...preview, listing_id: id(11) } });
  vi.spyOn(client, 'refreshAccessToken').mockImplementation(async () => {
    useAuthStore.setState({ token: 'fresh-preview-session' });
    return 'fresh-preview-session';
  });
  await expect(readPreview(id(10))).rejects.toThrow('INVALID_RESPONSE');
  expect(get).toHaveBeenCalledTimes(2);
});
