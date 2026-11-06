import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ post: vi.fn(), delete: vi.fn(), token: 'native-session' as string | null }));
vi.mock('./client', () => ({ api: {} }));
vi.mock('axios', async original => ({ ...await original<typeof import('axios')>(), default: { create: () => ({ post: mocks.post, delete: mocks.delete }) } }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ token: mocks.token }) } }));
import { setup2FA, verify2FASetup, disable2FA, regenerateBackupCodes, oauthUnlink } from './auth';

beforeEach(() => { vi.resetAllMocks(); mocks.token = 'native-session'; mocks.post.mockResolvedValue({ data: {} }); mocks.delete.mockResolvedValue({ data: {} }); });
const mutations = [
  ['setup', () => setup2FA(), '/auth/2fa/setup', {}],
  ['verify setup', () => verify2FASetup('123456'), '/auth/2fa/verify-setup', { code: '123456' }],
  ['disable', () => disable2FA(), '/auth/2fa/disable', {}],
  ['regenerate', () => regenerateBackupCodes(), '/auth/2fa/regenerate-backup-codes', {}],
] as const;
it.each(mutations)('%s sends session-bound CSRF and no action-time proof', async (_, call, path, body) => {
  await call();
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith(path, body, { headers: {
    Authorization: 'Bearer native-session',
    'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0native-session').digest('hex'),
  } });
});
it.each(mutations)('%s uses the current token after refresh', async (_, call, path, body) => {
  mocks.token = 'refreshed-session';
  await call();
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith(path, body, { headers: {
    Authorization: 'Bearer refreshed-session',
    'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0refreshed-session').digest('hex'),
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

it('provider unlink uses DELETE with session-bound CSRF and no reauth token', async () => {
  await oauthUnlink('google');
  expect(mocks.delete).toHaveBeenCalledExactlyOnceWith('/auth/oauth/google/unlink', { data: {}, headers: {
    Authorization: 'Bearer native-session',
    'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0native-session').digest('hex'),
  } });
});
it('provider unlink refuses sessionless credentials and does not replay a refusal', async () => {
  mocks.token = null;
  await expect(oauthUnlink('google')).rejects.toThrow('FIRST_PARTY_SESSION_REQUIRED');
  expect(mocks.delete).not.toHaveBeenCalled();
  mocks.token = 'native-session';
  const refusal = { response: { status: 401 } };
  mocks.delete.mockRejectedValue(refusal);
  await expect(oauthUnlink('google')).rejects.toBe(refusal);
  expect(mocks.delete).toHaveBeenCalledOnce();
});
