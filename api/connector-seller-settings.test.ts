import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeClient, nativeSession, newDecision, readAuthority, reviewAuthority, setAuthority, reviewStopAuthority, stopAuthority, readPreview, reviewRevokePreview, revokePreview, validLimits } from './connector-seller-settings';
import { useAuthStore } from '@/store/auth';
import { authority, limits, hash, id, preview } from '@/tests/fixtures/seller-authority';
beforeEach(() => { useAuthStore.setState({ token: 'retained-native-credential' }); });
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
