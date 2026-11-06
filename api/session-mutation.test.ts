import axios from 'axios';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import { postSessionMutation, sessionMutationError } from './session-mutation';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { setupRefusal } from '@/lib/two-factor-policy';
import { companyAuthenticatorError } from './company-authenticator';

const mocks = vi.hoisted(() => ({ adapter: vi.fn() }));
vi.mock('axios', async original => {
  const actual = (await original<typeof import('axios')>()).default;
  return { ...await original<typeof import('axios')>(), default: Object.assign(
    (...args: Parameters<typeof actual>) => actual(...args), actual,
    { create: (config: Parameters<typeof actual.create>[0]) => actual.create({ ...config, adapter: mocks.adapter }) }
  ) };
});

const token = (seconds: number) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.sig`;
beforeEach(() => { mocks.adapter.mockReset(); advanceAuthSessionOwner(); useAuthStore.setState({ token: token(3600), isAuthenticated: true }); });
afterEach(() => vi.restoreAllMocks());

it.each([-60, 0, 30, 60])('refreshes a token expiring in %s seconds once before sending concurrent mutations', async seconds => {
  useAuthStore.setState({ token: token(seconds) });
  const fresh = token(3600);
  const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: fresh } });
  const post = mocks.adapter.mockResolvedValue({ data: { ok: true }, status: 200, headers: {}, config: {} });
  await Promise.all([postSessionMutation('/one', {}), postSessionMutation('/two', {})]);
  expect(refresh).toHaveBeenCalledOnce();
  expect(post).toHaveBeenCalledTimes(2);
  for (const path of ['/one', '/two']) expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: path, headers: expect.objectContaining({
    Authorization: `Bearer ${fresh}`,
    'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0' + fresh).digest('hex'),
  }) }));
});
it('sends a fresh token once and never refreshes or replays a refused mutation', async () => {
  const refresh = vi.spyOn(axios, 'post');
  const refusal = { response: { status: 401, data: { detail: 'FIRST_PARTY_SESSION_REQUIRED' } } };
  const post = mocks.adapter.mockRejectedValue(refusal);
  await expect(postSessionMutation('/one', {})).rejects.toBe(refusal);
  expect(post).toHaveBeenCalledOnce(); expect(refresh).not.toHaveBeenCalled();
});
it('does not send a mutation when preflight refresh fails', async () => {
  useAuthStore.setState({ token: token(-60) });
  const failure = new Error('Network unavailable');
  vi.spyOn(axios, 'post').mockRejectedValue(failure);
  const post = mocks.adapter;
  await expect(postSessionMutation('/one', {})).rejects.toBe(failure);
  expect(post).not.toHaveBeenCalled();
});
it('does not dispatch an old operation after the session owner changes during refresh', async () => {
  useAuthStore.setState({ token: token(-60) });
  vi.spyOn(axios, 'post').mockImplementation(async () => {
    advanceAuthSessionOwner();
    useAuthStore.setState({ token: 'another-account' });
    return { data: { access_token: token(3600) } };
  });
  const post = mocks.adapter;
  await expect(postSessionMutation('/one', {})).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
  expect(useAuthStore.getState().token).toBe('another-account');
});
it.each(['FIRST_PARTY_SESSION_REQUIRED', 'CSRF_REQUIRED', 'BAD_ORIGIN'])('maps %s to a refresh instruction in ordinary and company settings', detail => {
  const error = new axios.AxiosError('refused');
  Object.assign(error, { response: { status: 403, data: { detail } } });
  expect(sessionMutationError(error)).toBe('Please refresh the page and try again.');
  expect(setupRefusal(error, null)).toBe('Please refresh the page and try again.');
  expect(companyAuthenticatorError(error)).toBe('Please refresh the page and try again.');
});
it('maps missing local session evidence and leaves unrelated errors alone', () => {
  expect(sessionMutationError(new Error('FIRST_PARTY_SESSION_REQUIRED'))).toBe('Please refresh the page and try again.');
  expect(sessionMutationError(new Error('other'))).toBeNull();
});
