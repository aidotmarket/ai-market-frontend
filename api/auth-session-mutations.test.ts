import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ post: vi.fn(), token: '' as string | null }));
vi.mock('./client', () => ({ api: {}, refreshAccessToken: vi.fn() }));
vi.mock('axios', async original => ({ ...await original<typeof import('axios')>(), default: { create: () => ({ post: mocks.post }) } }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ token: mocks.token }) } }));
import { setup2FA, verify2FASetup, disable2FA, regenerateBackupCodes } from './auth';

const token = (id: string) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, id }))}.sig`;
beforeEach(() => { vi.resetAllMocks(); mocks.token = token('native-session'); mocks.post.mockResolvedValue({ data: {} }); });
const mutations = [
  ['setup', () => setup2FA(), '/auth/2fa/setup', {}],
  ['verify setup', () => verify2FASetup('123456'), '/auth/2fa/verify-setup', { code: '123456' }],
  ['disable', () => disable2FA(), '/auth/2fa/disable', {}],
  ['regenerate', () => regenerateBackupCodes(), '/auth/2fa/regenerate-backup-codes', {}],
] as const;
it.each(mutations)('%s sends session-bound CSRF and no action-time proof', async (_, call, path, body) => {
  await call();
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith(path, body, { headers: {
    Authorization: `Bearer ${mocks.token}`,
    'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0' + mocks.token).digest('hex'),
  } });
});
it.each(mutations)('%s uses the current token after refresh', async (_, call, path, body) => {
  mocks.token = token('refreshed-session');
  await call();
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith(path, body, { headers: {
    Authorization: `Bearer ${mocks.token}`,
    'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0' + mocks.token).digest('hex'),
  } });
});
it.each(mutations)('%s refuses sessionless requests', async (_, call) => {
  mocks.token = null;
  await expect(call()).rejects.toThrow('FIRST_PARTY_SESSION_REQUIRED');
  expect(mocks.post).not.toHaveBeenCalled();
});
it.each(mutations)('%s does not refresh or replay a refused mutation', async (_, call) => {
  const refusal = { response: { status: 401 } };
  mocks.post.mockRejectedValue(refusal);
  await expect(call()).rejects.toBe(refusal);
  expect(mocks.post).toHaveBeenCalledOnce();
});
