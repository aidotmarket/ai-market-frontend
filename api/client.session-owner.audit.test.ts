import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types';

const account = (id: string): User => ({
  id, email: `${id}@example.invalid`, first_name: id, last_name: null, company_name: null,
  role: 'buyer', status: 'active', created_at: '2026-10-22T00:00:00Z',
  email_verified_at: '2026-10-22T00:00:00Z', totp_enabled: false,
  auth_methods: ['password'], primary_auth: 'password',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function refusal(status: number, config = { headers: {} } as InternalAxiosRequestConfig) {
  return new AxiosError(`Synthetic HTTP ${status}`, 'ERR_BAD_RESPONSE', config, undefined,
    { config, status, statusText: 'Synthetic refusal', data: {}, headers: {} });
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.stubGlobal('window', { location: { pathname: '/dashboard', search: '', hash: '', href: '/dashboard' } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function setup() {
  const client = await import('./client');
  const authApi = await import('./auth');
  const { useAuthStore } = await import('@/store/auth');
  const getMe = vi.spyOn(authApi, 'getMe').mockResolvedValue(account('A'));
  vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
  client.api.defaults.adapter = async () => { throw new Error('Audit forbids a real API request'); };
  await useAuthStore.getState().completeSession({ access_token: 'synthetic-A-initial', token_type: 'bearer' });
  async function signInB() {
    getMe.mockResolvedValue(account('B'));
    await useAuthStore.getState().completeSession({ access_token: 'synthetic-B-current', token_type: 'bearer' });
  }
  return { ...client, useAuthStore, getMe, signInB };
}

describe('actual auth client/store session ownership, offline audit', () => {
  it('does not overwrite a later login when an earlier refresh succeeds', async () => {
    const { refreshAccessToken, useAuthStore, signInB } = await setup();
    const old = deferred<{ data: { access_token: string } }>();
    const post = vi.spyOn(axios, 'post').mockReturnValue(old.promise as never);
    const settled = refreshAccessToken().catch(() => undefined);
    expect(post).toHaveBeenCalledOnce();
    await signInB();
    old.resolve({ data: { access_token: 'synthetic-A-late' } });
    await settled;
    expect(useAuthStore.getState()).toMatchObject({ token: 'synthetic-B-current', user: { id: 'B' }, isAuthenticated: true });
  });

  it.each([401, 403])('does not clear or redirect a later login after an earlier refresh returns %s', async status => {
    const { refreshAccessToken, useAuthStore, signInB } = await setup();
    const old = deferred<{ data: { access_token: string } }>();
    vi.spyOn(axios, 'post').mockReturnValue(old.promise as never);
    const settled = refreshAccessToken().catch(() => undefined);
    await signInB();
    old.reject(refusal(status));
    await settled;
    expect(useAuthStore.getState()).toMatchObject({ token: 'synthetic-B-current', user: { id: 'B' }, isAuthenticated: true });
    expect(window.location.href).toBe('/dashboard');
  });

  it('does not replay an earlier protected action under a later account', async () => {
    const { api, signInB } = await setup();
    const old = deferred<never>();
    let original!: InternalAxiosRequestConfig;
    const adapter = vi.fn<AxiosAdapter>(async config => {
      if (!original) { original = config; return old.promise; }
      return { config, data: { ok: true }, headers: {}, status: 200, statusText: 'OK' };
    });
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'fake-B-refresh' } });
    const settled = api.post('/audit-protected-action', { synthetic: 'A-intent' }, { adapter }).catch(() => undefined);
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce());
    expect(original.headers.Authorization).toBe('Bearer synthetic-A-initial');
    await signInB();
    old.reject(refusal(401, original));
    await settled;
    expect(adapter).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalled();
  });

  it('control: an unchanged session adopts its successful refresh', async () => {
    const { refreshAccessToken, useAuthStore } = await setup();
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'fake-A-refresh' } });
    await expect(refreshAccessToken()).resolves.toBe('fake-A-refresh');
    expect(useAuthStore.getState()).toMatchObject({ token: 'fake-A-refresh', user: { id: 'A' }, isAuthenticated: true });
  });

  it('control: an unchanged session still clears on a terminal refresh refusal', async () => {
    const { refreshAccessToken, useAuthStore } = await setup();
    vi.spyOn(axios, 'post').mockRejectedValue(refusal(401));
    await expect(refreshAccessToken()).rejects.toBeTruthy();
    expect(useAuthStore.getState()).toMatchObject({ user: null, token: null, isAuthenticated: false });
    expect(window.location.href).toBe('/login');
  });

  it('does not install an earlier user response into a later completed login', async () => {
    const { useAuthStore, getMe, signInB } = await setup();
    const old = deferred<User>();
    getMe.mockReturnValueOnce(old.promise);
    const settled = useAuthStore.getState().completeSession({ access_token: 'synthetic-A-pending', token_type: 'bearer' }).catch(() => undefined);
    await signInB();
    old.resolve(account('A'));
    await settled;
    expect(useAuthStore.getState()).toMatchObject({ token: 'synthetic-B-current', user: { id: 'B' }, isAuthenticated: true });
  });
});
