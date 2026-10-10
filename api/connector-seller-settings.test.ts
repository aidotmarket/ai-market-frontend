import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeClient, nativeSession, newDecision, readAuthority, reviewAuthority, setAuthority, stopAuthority, readPreview, revokePreview, validLimits } from './connector-seller-settings';
import { useAuthStore } from '@/store/auth';
import { authority, limits, hash, id, preview } from '@/tests/fixtures/seller-authority';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
beforeEach(() => { useAuthStore.setState({ token: 'retained-native-credential' }); });
afterEach(() => vi.restoreAllMocks());
it('keeps absent rollout reporting dark rather than treating authority or connector enabled as seller', () => { expect(useSellerSwitches()).toBeNull(); });
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
it('preserves stop as a native revoke without review or factor', async () => {
  const post = vi.spyOn(nativeClient, 'post').mockResolvedValue({ data: { decision_id: id(90), version: 5, enabled: false } }); const body = newDecision(4);
  await stopAuthority(body); expect(post).toHaveBeenCalledWith('/connector-seller-settings/authority/stop', body, { headers: nativeSession().headers });
});
it('reads preview status and revokes the exact saved publication and digest', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ data: preview }); const post = vi.spyOn(nativeClient, 'post').mockResolvedValue({ data: { decision_id: id(90), version: 4, enabled: false } });
  await readPreview(id(10)); expect(get).toHaveBeenCalledWith(`/connector-seller-settings/preview-consent/${id(10)}`, { headers: nativeSession().headers });
  const body = { ...newDecision(3), listing_id: id(10), publication_version_id: id(12), sample_set_hash: hash }; await revokePreview(body);
  expect(post).toHaveBeenCalledWith('/connector-seller-settings/preview-consent/revoke', body, { headers: nativeSession().headers });
});
it.each([{ max_batch: 51 }, { concurrent_operations: 0 }, { daily_items: {} }, { operations: ['publish', 'publish'] }, { expires_at: '2099-01-01' }, { price_min_cents: 10001 }])('refuses unsafe standing limits %j', patch => { expect(validLimits({ ...limits, ...patch })).toBe(false); });
