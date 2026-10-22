import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginResult, User } from '@/types';

const account = (id: string): User => ({
  id, email: `${id}@example.invalid`, first_name: id, last_name: null, company_name: null,
  role: 'buyer', status: 'active', created_at: '2026-10-22T00:00:00Z',
  email_verified_at: null, totp_enabled: false, auth_methods: ['password'], primary_auth: 'password',
});
const token = (value: string) => ({ access_token: value, token_type: 'bearer' });
const challenge = { requires_2fa: true as const, pre_auth_token: 'synthetic-challenge', expires_in: 300 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function refusal(status: number, config = { headers: {} } as InternalAxiosRequestConfig) {
  return new AxiosError('Synthetic refusal', 'ERR_BAD_RESPONSE', config, undefined,
    { config, status, statusText: 'Refused', data: {}, headers: { 'retry-after': '1' } });
}
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', { location: { pathname: '/dashboard', search: '', hash: '', href: '/dashboard' } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function setup() {
  const client = await import('./client');
  const auth = await import('./auth');
  const { useAuthStore: store, authSessionIdentity } = await import('@/store/auth');
  const getMe = vi.spyOn(auth, 'getMe').mockResolvedValue(account('A'));
  const logout = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
  const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('No real refresh transport allowed'));
  client.api.defaults.adapter = async () => { throw new Error('No real API transport allowed'); };
  const signIn = async (id = 'A', value = 'initial') => {
    getMe.mockResolvedValue(account(id));
    await store.getState().completeSession(token(value));
  };
  await signIn();
  return { ...client, auth, store, authSessionIdentity, getMe, logout, post, signIn };
}

describe('real client/store deferred lifecycle fencing', () => {
  it.each(['success', '401', '403'] as const)('ignores old refresh %s after logout, including same-account login ABA', async outcome => {
    const { refreshAccessToken, store, post, signIn } = await setup();
    const old = deferred<{ data: { access_token: string } }>();
    post.mockReturnValueOnce(old.promise as never);
    const pending = refreshAccessToken().catch(error => error);
    await store.getState().logout();
    expect(store.getState().token).toBeNull();
    await signIn('A', 'replacement');
    if (outcome === 'success') old.resolve({ data: token('late') });
    else old.reject(refusal(Number(outcome)));
    await pending;
    expect(store.getState()).toMatchObject({ token: 'replacement', user: { id: 'A' }, isAuthenticated: true });
    expect(window.location.href).toBe('/dashboard');
  });

  it.each(['success', '401', '403'] as const)('cannot resurrect logged-out state after old refresh %s', async outcome => {
    const { refreshAccessToken, store, post } = await setup();
    const old = deferred<{ data: { access_token: string } }>();
    post.mockReturnValueOnce(old.promise as never);
    const pending = refreshAccessToken().catch(error => error);
    await store.getState().logout();
    if (outcome === 'success') old.resolve({ data: token('late') });
    else old.reject(refusal(Number(outcome)));
    await pending;
    expect(store.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false });
    expect(window.location.href).toBe('/dashboard');
  });

  it('does not join another lifecycle or let old promise cleanup erase the new flight', async () => {
    const { refreshAccessToken, post, signIn } = await setup();
    const old = deferred<{ data: { access_token: string } }>();
    const current = deferred<{ data: { access_token: string } }>();
    post.mockReturnValueOnce(old.promise as never).mockReturnValueOnce(current.promise as never);
    const first = refreshAccessToken();
    const settled = first.catch(error => error);
    await signIn('B', 'new');
    const second = refreshAccessToken();
    expect(second).not.toBe(first);
    old.resolve({ data: token('stale') });
    await settled;
    expect(refreshAccessToken()).toBe(second);
    expect(post).toHaveBeenCalledTimes(2);
    current.resolve({ data: token('current') });
    await expect(second).resolves.toBe('current');
  });

  it('never sends an old Retry-After retry after lifecycle replacement', async () => {
    const { refreshAccessToken, post, signIn, store } = await setup();
    vi.useFakeTimers();
    post.mockRejectedValueOnce(refusal(429));
    const old = refreshAccessToken().catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    await signIn('B', 'new');
    const current = deferred<{ data: { access_token: string } }>();
    post.mockReturnValueOnce(current.promise as never);
    const second = refreshAccessToken();
    await vi.advanceTimersByTimeAsync(1000);
    await old;
    expect(post).toHaveBeenCalledTimes(2);
    expect(refreshAccessToken()).toBe(second);
    current.resolve({ data: token('B-rotated') });
    await second;
    expect(store.getState().token).toBe('B-rotated');
  });

  it('captures request admission synchronously even with an immediately following same-account login', async () => {
    const { api, post, signIn } = await setup();
    const response = deferred<never>();
    let original!: InternalAxiosRequestConfig;
    const adapter = vi.fn<AxiosAdapter>(config => { original = config; return response.promise; });
    const pending = api.post('/protected', {}, { adapter }).catch(error => error);
    await signIn('A', 'new');
    response.reject(refusal(401, original));
    await pending;
    expect(original.headers.Authorization).toBe('Bearer initial');
    expect(adapter).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalled();
  });

  it('checks ownership again after refresh before automatic replay', async () => {
    const { api, post, signIn } = await setup();
    const refresh = deferred<{ data: { access_token: string } }>();
    post.mockReturnValueOnce(refresh.promise as never);
    const adapter = vi.fn<AxiosAdapter>(async config => { throw refusal(401, config); });
    const pending = api.get('/protected', { adapter }).catch(error => error);
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    await signIn('B', 'new');
    refresh.resolve({ data: token('old') });
    await pending;
    expect(adapter).toHaveBeenCalledOnce();
  });

  it('still shares refresh and replays ordinary same-owner requests with rotated credentials', async () => {
    const { api, post, store, authSessionIdentity } = await setup();
    const refresh = deferred<{ data: { access_token: string } }>();
    post.mockReturnValueOnce(refresh.promise as never);
    const attempts = new Map<string, number>();
    const adapter = vi.fn<AxiosAdapter>(async config => {
      const count = attempts.get(config.url!) ?? 0;
      attempts.set(config.url!, count + 1);
      if (!count) throw refusal(401, config);
      expect(config.headers.Authorization).toBe('Bearer rotated');
      return { config, data: 'ok', headers: {}, status: 200, statusText: 'OK' };
    });
    const first = api.get('/one', { adapter });
    const second = api.get('/two', { adapter });
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    refresh.resolve({ data: token('rotated') });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(adapter).toHaveBeenCalledTimes(4);
    expect(authSessionIdentity(store.getState())).toBe('A');
  });

  it.each(['/newsletter-subscribe', '/auth/2fa/verify', '/auth/logout'])('keeps %s refusals out of automatic refresh', async path => {
    const { api, post } = await setup();
    await expect(api.post(path, {}, { adapter: async config => { throw refusal(401, config); } })).rejects.toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['hydrate', 'refreshAuth'] as const)('does not install late %s user data over a newer login', async method => {
    const { store, post, getMe, signIn } = await setup();
    post.mockResolvedValueOnce({ data: token('rotated') });
    const old = deferred<User>();
    getMe.mockReturnValueOnce(old.promise);
    const pending = store.getState()[method]();
    await vi.waitFor(() => expect(getMe).toHaveBeenCalledTimes(2));
    await signIn('B', 'new');
    old.resolve(account('A'));
    await pending;
    expect(store.getState()).toMatchObject({ token: 'new', user: { id: 'B' }, pendingTwoFactor: null });
  });

  it.each(['login', 'oauthLogin', 'magicLinkVerify'] as const)('refuses a superseded %s token or challenge result', async method => {
    const { store, auth, signIn, getMe } = await setup();
    const old = deferred<LoginResult>();
    const apiMethod = method === 'oauthLogin' ? 'oauthCallback' : method;
    vi.spyOn(auth, apiMethod).mockReturnValueOnce(old.promise);
    const pending = (method === 'login' ? store.getState().login('a', 'p') : method === 'oauthLogin'
      ? store.getState().oauthLogin('google', 'c', 's', 'n') : store.getState().magicLinkVerify('m')).catch(error => error);
    await signIn('B', 'new');
    old.resolve(method === 'login' ? challenge : token('stale'));
    await expect(pending).resolves.toBeInstanceOf(Error);
    expect(getMe).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ token: 'new', user: { id: 'B' }, pendingTwoFactor: null });
  });

  it.each(['token', '401', '400'] as const)('does not apply late 2FA %s after challenge replacement', async outcome => {
    const { store, auth } = await setup();
    vi.spyOn(auth, 'login').mockResolvedValue(challenge);
    await store.getState().login('a', 'p');
    const old = deferred<ReturnType<typeof token>>();
    vi.spyOn(auth, 'verify2FALogin').mockReturnValueOnce(old.promise);
    const pending = store.getState().verifyTwoFactor('123456').catch(error => error);
    store.getState().clearPendingTwoFactor();
    await store.getState().login('b', 'p');
    const current = store.getState().pendingTwoFactor;
    if (outcome === 'token') old.resolve(token('late'));
    else old.reject(refusal(Number(outcome)));
    await expect(pending).resolves.toBeInstanceOf(Error);
    expect(store.getState().pendingTwoFactor).toBe(current);
    expect(store.getState().token).toBeNull();
  });

  it('preserves the new session after late logout success or failure', async () => {
    const { store, logout, signIn } = await setup();
    for (const fails of [false, true]) {
      const old = deferred<void>();
      logout.mockReturnValueOnce(old.promise);
      const pending = store.getState().logout().catch(error => error);
      expect(store.getState().token).toBeNull();
      await signIn('B', 'new');
      if (fails) old.reject(new Error('Synthetic offline'));
      else old.resolve();
      await pending;
      expect(store.getState()).toMatchObject({ token: 'new', user: { id: 'B' }, isAuthenticated: true });
    }
  });

  it.each(['completeSession', 'hydrate', 'refreshAuth'] as const)('cannot restore user data after logout during %s', async method => {
    const { store, getMe, post } = await setup();
    post.mockResolvedValueOnce({ data: token('rotated') });
    const old = deferred<User>();
    getMe.mockReturnValueOnce(old.promise);
    const pending = (method === 'completeSession' ? store.getState().completeSession(token('pending'))
      : store.getState()[method]()).catch(error => error);
    await vi.waitFor(() => expect(getMe).toHaveBeenCalledTimes(2));
    await store.getState().logout();
    old.resolve(account('A'));
    await pending;
    expect(store.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false });
  });

  it('preserves a new 2FA challenge after an old hydration refusal', async () => {
    const { store, auth, post } = await setup();
    const old = deferred<{ data: { access_token: string } }>();
    post.mockReturnValueOnce(old.promise as never);
    const pending = store.getState().hydrate();
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    vi.spyOn(auth, 'login').mockResolvedValueOnce(challenge);
    await store.getState().login('a', 'p');
    const current = store.getState().pendingTwoFactor;
    old.reject(refusal(401));
    await pending;
    await store.getState().hydrate();
    await store.getState().refreshAuth();
    expect(store.getState().pendingTwoFactor).toBe(current);
    expect(post).toHaveBeenCalledOnce();
  });

  it('refuses a late login after logout and clears the challenge at a replacement login admission', async () => {
    const { store, auth } = await setup();
    const old = deferred<LoginResult>();
    const login = vi.spyOn(auth, 'login').mockResolvedValueOnce(challenge).mockReturnValueOnce(old.promise);
    await store.getState().login('a', 'p');
    expect(store.getState().pendingTwoFactor).not.toBeNull();
    const pending = store.getState().login('b', 'p').catch(error => error);
    expect(store.getState().pendingTwoFactor).toBeNull();
    await store.getState().logout();
    old.resolve(token('late'));
    await expect(pending).resolves.toBeInstanceOf(Error);
    expect(login).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false });
  });

  it('dispatches logout with its original bearer, clears immediately, and never refreshes on refusal', async () => {
    const { store, logout, api, post } = await setup();
    logout.mockRestore();
    const response = deferred<never>();
    let original!: InternalAxiosRequestConfig;
    api.defaults.adapter = config => { original = config; return response.promise; };
    const pending = store.getState().logout().catch(error => error);
    expect(original.headers.Authorization).toBe('Bearer initial');
    expect(store.getState().token).toBeNull();
    response.reject(refusal(401, original));
    await pending;
    expect(post).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false });
  });


  it('does not clear a newer connector continuation when an old logout finishes', async () => {
    const { store, logout, signIn } = await setup();
    const { saveConnectorContinuation, setConnectorStatus } = await import('@/lib/aim-data-continuation');
    const local = new Map<string, string>();
    const session = new Map<string, string>();
    const storage = (values: Map<string, string>) => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('localStorage', storage(local));
    vi.stubGlobal('sessionStorage', storage(session));
    const old = deferred<void>();
    logout.mockReturnValueOnce(old.promise);
    const pending = store.getState().logout();
    await signIn('B', 'new');
    const path = `/oauth/connect?request=${'a'.repeat(43)}`;
    setConnectorStatus(true);
    expect(saveConnectorContinuation(path)).toBe(true);
    const before = [...local];
    old.resolve();
    await pending;
    expect([...local]).toEqual(before);
    expect(local.get('connector_authorization_request')).toBeDefined();
  });

});
