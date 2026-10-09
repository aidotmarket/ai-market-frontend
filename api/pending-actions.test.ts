import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), token: 'signed-session-credential' }));
vi.mock('axios', () => ({ default: { create: () => ({ get: mocks.get, post: mocks.post }) } }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ token: mocks.token }) } }));
import { decidePendingAction, getPendingAction, listPendingActions, pendingActionCsrf, pendingActionError, type PendingAction } from './pending-actions';

const id = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(42) + 'A';
const sessionDigest = '3cf0a84f5ca58f2f3724c254c3e593be5694d0a6f2c03cb8d240a9a39434591b';
const action: PendingAction = {
  id, request_id: '22222222-2222-4222-8222-222222222222', status: 'pending_review',
  summary: { action: 'confirm_receipt', price_cents: 50001, currency: 'USD', licence: { sha256: 'b'.repeat(64) } },
  summary_hash: 'c'.repeat(64), expires_at: '2099-01-01T00:00:00Z', result: null, error_code: null,
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.token = 'signed-session-credential';
  mocks.get.mockResolvedValue({ data: action }); mocks.post.mockResolvedValue({ data: { ...action, status: 'confirmed' } });
});

describe.each(['false', 'true'])('pending-actions contract with checkout flag %s', flag => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', flag));
  it('matches the backend SHA-256 domain and signed access credential exactly', () => {
    expect(pendingActionCsrf(mocks.token)).toBe(sessionDigest);
  });

  it('loads exact summary and hash with token in query and CSRF in header only', async () => {
    expect(await getPendingAction(id, token)).toEqual(action);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(`/pending-actions/${id}`, {
      params: { t: token }, headers: { Authorization: `Bearer ${mocks.token}`, 'X-CSRF-Token': sessionDigest },
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('confirms using precisely token, csrf and the displayed backend summary hash', async () => {
    expect((await decidePendingAction(id, token, 'confirm', action.summary_hash)).status).toBe('confirmed');
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith(`/pending-actions/${id}/confirm`, {
      token, csrf: sessionDigest, summary_hash: action.summary_hash,
    }, { headers: { Authorization: `Bearer ${mocks.token}` } });
  });

  it('declines without the confirm-only summary_hash field', async () => {
    mocks.post.mockResolvedValue({ data: { ...action, status: 'denied' } });
    expect((await decidePendingAction(id, token, 'decline', action.summary_hash)).status).toBe('denied');
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith(`/pending-actions/${id}/decline`, {
      token, csrf: sessionDigest,
    }, { headers: { Authorization: `Bearer ${mocks.token}` } });
  });

  it('lists owner-filtered pending_review using session CSRF', async () => {
    mocks.get.mockResolvedValue({ data: [action] });
    expect(await listPendingActions()).toEqual([action]);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith('/pending-actions', {
      params: { status: 'pending_review' }, headers: { Authorization: `Bearer ${mocks.token}`, 'X-CSRF-Token': sessionDigest },
    });
  });

  it('binds each new call to the current session without replaying a refusal', async () => {
    const refusal = { response: { status: 401, data: { detail: 'FIRST_PARTY_SESSION_REQUIRED' } } };
    mocks.post.mockRejectedValueOnce(refusal);
    await expect(decidePendingAction(id, token, 'confirm', action.summary_hash)).rejects.toBe(refusal);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    mocks.token = 'replacement-credential';
    await decidePendingAction(id, token, 'confirm', action.summary_hash);
    expect(mocks.post.mock.lastCall?.[1].csrf).toBe(pendingActionCsrf('replacement-credential'));
    expect(mocks.post.mock.lastCall?.[2].headers.Authorization).toBe('Bearer replacement-credential');
  });

  it.each([['../foreign', token], [id, `${token}&redirect=https://evil.test`], [id, 'a'.repeat(43)]])('rejects invalid link input %s', async (badId, badToken) => {
    await expect(getPendingAction(badId, badToken)).rejects.toThrow('INVALID_LINK');
    await expect(decidePendingAction(badId, badToken, 'decline', action.summary_hash)).rejects.toThrow('INVALID_LINK');
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each([{ ...action, id: 'foreign' }, { ...action, status: 'succeeded' }, { ...action, summary: [] }, { ...action, summary_hash: 'wrong' }, { ...action, expires_at: 'invalid' }])('refuses malformed response %j', async (data) => {
    mocks.get.mockResolvedValue({ data });
    await expect(getPendingAction(id, token)).rejects.toThrow('INVALID_RESPONSE');
  });
});

it.each([
  [404, 'UNAVAILABLE', 'not_found'], [404, 'Not Found', 'not_found'],
  [403, 'RECENT_LOGIN_REQUIRED', 'login'], [403, 'SECOND_FACTOR_REQUIRED', 'second_factor'],
  [401, 'FIRST_PARTY_SESSION_REQUIRED', 'login'], [401, 'REAUTH_REQUIRED', 'login'],
  [403, 'SECOND_FACTOR_ENROLLMENT_REQUIRED', 'enrollment'], [503, 'SUMMARY_CONTENT_UNAVAILABLE', 'summary_unavailable'],
  [409, 'SUMMARY_CHANGED', 'changed'], [403, 'CSRF_REQUIRED', 'unavailable'], [503, 'ACTION_UNAVAILABLE', 'unavailable'], [503, 'CONFIRMATION_UNAVAILABLE', 'unavailable'],
] as const)('maps backend %s %s to %s', (status, detail, kind) => {
  expect(pendingActionError({ response: { status, data: { detail } } })).toBe(kind);
});


it('adds same-session TOTP proof only to company confirmation, never decline', async () => {
  await decidePendingAction(id, token, 'confirm', action.summary_hash, 'native-proof');
  expect(mocks.post.mock.lastCall?.[1]).toEqual({ token, csrf: pendingActionCsrf(mocks.token), summary_hash: action.summary_hash, reauth_token: 'native-proof' });
  await decidePendingAction(id, token, 'decline', action.summary_hash, 'native-proof');
  expect(mocks.post.mock.lastCall?.[1]).toEqual({ token, csrf: pendingActionCsrf(mocks.token) });
});
afterEach(() => vi.unstubAllEnvs());
