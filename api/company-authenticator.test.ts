import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), token: 'native-session' as string | null }));
vi.mock('./client', () => ({ refreshAccessToken: vi.fn(), currentSessionRefresh: () => null }));
vi.mock('axios', () => ({ default: { create: () => ({ post: mocks.post }) } }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ token: mocks.token }) } }));
import { setupCompanyAuthenticator, verifyCompanyAuthenticator, recoverCompanyAuthenticator } from './company-authenticator';
const token = `e30.${btoa(JSON.stringify({ exp: 4_000_000_000 }))}.sig`;
beforeEach(() => { vi.resetAllMocks(); mocks.token = token; mocks.post.mockResolvedValue({ data: {} }); });
it.each([
  ['setup', () => setupCompanyAuthenticator(), '/auth/2fa/setup', {}],
  ['verify', () => verifyCompanyAuthenticator('123456'), '/auth/2fa/verify-setup', { code: '123456' }],
  ['recover', () => recoverCompanyAuthenticator(), '/auth/2fa/disable', {}],
] as const)('uses the approved company %s body and CSRF bound to the access credential', async (_, call, path, body) => {
  await call();
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith(path, body, { headers: {
    Authorization: `Bearer ${token}`, 'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0' + token).digest('hex'),
  } });
});
it('refuses sessionless setup without a request', async () => {
  mocks.token = null; await expect(setupCompanyAuthenticator()).rejects.toThrow('FIRST_PARTY_SESSION_REQUIRED');
  expect(mocks.post).not.toHaveBeenCalled();
});
it('does not refresh or replay refused mutations', async () => {
  const error = { response: { status: 401 } }; mocks.post.mockRejectedValue(error);
  await expect(setupCompanyAuthenticator()).rejects.toBe(error); expect(mocks.post).toHaveBeenCalledTimes(1);
});
