// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => mocks } }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ token: 'native-session' }) } }));
import { getSellerActivity, getSellerCapability, pendingActionCsrf, retrySellerFailures, sellerAdmissionEnabled } from './pending-actions';
const id = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const token = 'a'.repeat(42) + 'A';
const headers = { Authorization: 'Bearer native-session', Origin: window.location.origin, 'X-CSRF-Token': pendingActionCsrf('native-session') };
const page = { operation: { operation_id: id, execution_status: 'partial', execution_deadline: '2099-01-01T00:00:00Z', requested_count: 1, eligible_count: 1, blocked_count: 0, succeeded_count: 0, no_change_count: 0, failed_count: 1, cancelled_count: 0 }, items: [{ id: target, target_id: target, kind: 'seller_operation_item', action: 'aim.listing.publish', status: 'failed', summary: 'Seller item failed.', result_index: 0 }], limit: 20, offset: 0, has_more: true, next_cursor: 'signed_trimmed_prefix' };
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue({ data: page }); });
it('reads current owner capability with existing session/link and no new authority', async () => {
  await getSellerCapability(id, token);
  expect(mocks.get).toHaveBeenCalledWith(`/pending-actions/${id}/capability`, { params: { t: token }, headers: { Authorization: headers.Authorization, 'X-CSRF-Token': headers['X-CSRF-Token'] } });
});
it('passes the signed cursor unchanged after a trimmed page using native Origin/CSRF only', async () => {
  const first = await getSellerActivity(id);
  mocks.get.mockResolvedValueOnce({ data: { ...page, offset: 1, has_more: false, next_cursor: undefined } });
  const last = await getSellerActivity(id, first.next_cursor || undefined);
  expect(last.has_more).toBe(false);
  expect(mocks.get).toHaveBeenLastCalledWith(`/pending-actions/seller-operations/${id}/activity`, { params: { limit: 20, cursor: 'signed_trimmed_prefix' }, headers });
});
it.each([{ ...page, operation: { operation_id: target } }, { ...page, next_cursor: undefined }, { ...page, items: [{ ...page.items[0], status: 'unknown' }] }])('refuses malformed or cross-operation activity %j', async data => {
  mocks.get.mockResolvedValue({ data }); await expect(getSellerActivity(id)).rejects.toThrow('INVALID_ACTIVITY_RESPONSE');
});
it('prepares only the explicit target set and fresh key without browser revisions or owner fields', async () => {
  mocks.post.mockResolvedValue({ data: { idempotency_key: 'new_explicit_key_123', outcome: { status: 'denied' }, pending: null } });
  await retrySellerFailures(id, token, [target], 'new_explicit_key_123');
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith(`/pending-actions/${id}/retry`, { token, csrf: pendingActionCsrf('native-session'), target_ids: [target], idempotency_key: 'new_explicit_key_123' }, { headers: { Authorization: headers.Authorization, Origin: headers.Origin } });
});
it.each([[], [target, target], Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)].map(targets => ({ targets })))('refuses invalid or 51 member retry selection without splitting %j', async ({ targets }) => {
  await expect(retrySellerFailures(id, token, targets, 'new_explicit_key_123')).rejects.toThrow('INVALID_RETRY_SELECTION');
  expect(mocks.post).not.toHaveBeenCalled();
});
it.each(['FAILED_TARGETS_ONLY', 'RETRY_TARGET_CHANGED', 'RETRY_REQUIRES_NEW_REQUEST', 'NEW_IDEMPOTENCY_KEY_REQUIRED', 'SSO_REQUIRED'])('preserves %s refusal without automatic resubmission', async detail => {
  const refusal = { response: { status: 409, data: { detail } } }; mocks.post.mockRejectedValue(refusal);
  await expect(retrySellerFailures(id, token, [target], 'new_explicit_key_123')).rejects.toBe(refusal); expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('treats missing, stale, malformed and unavailable capability as disabled', () => {
  const switches = { connector_enabled: true, action_path_enabled: true, seller_enabled: true, seller_bulk_enabled: true, global_enabled: true, profile_enabled: true, tool_enabled: true };
  const admission = { effective: true, reason: null, checked_at: new Date().toISOString(), switch_snapshot: switches };
  expect(sellerAdmissionEnabled(admission)).toBe(true);
  for (const value of [undefined, null, {}, { ...admission, checked_at: 'invalid' }, { ...admission, checked_at: new Date(Date.now() - 15000).toISOString() }, { ...admission, effective: false, reason: 'STATUS_UNAVAILABLE' }, { ...admission, switch_snapshot: { ...switches, profile_enabled: 'true' } }]) expect(sellerAdmissionEnabled(value)).toBe(false);
});
