import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LoginResult } from '@/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const token = (value: string) => ({ access_token: value, token_type: 'bearer' });
const challenge = { requires_2fa: true as const, pre_auth_token: 'fake-challenge', expires_in: 300 };
function refusal(status: number, config: InternalAxiosRequestConfig) {
  return new AxiosError('Fake refusal', 'ERR_BAD_RESPONSE', config, undefined,
    { config, status, statusText: 'Refused', data: {}, headers: {} });
}
const originalAdapter = axios.defaults.adapter;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', { location: { pathname: '/login', search: '', hash: '', href: '/login' } });
});
afterEach(() => { axios.defaults.adapter = originalAdapter; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup() {
  const { api } = await import('./client');
  const { useAuthStore: store } = await import('@/store/auth');
  const refresh = deferred<object>();
  const loginResponses: ReturnType<typeof deferred<LoginResult>>[] = [];
  const refreshTransport = vi.fn(async (config: InternalAxiosRequestConfig) => {
    const data = await refresh.promise;
    return { config, data, status: 200, statusText: 'OK', headers: {} };
  });
  axios.defaults.adapter = refreshTransport;
  api.defaults.adapter = async config => {
    let data: object;
    if (config.url === '/auth/me') data = { id: 'A' };
    else if (config.url === '/auth/logout') data = {};
    else {
      const next = loginResponses.shift();
      if (!next) throw new Error('Unexpected fake transport route');
      try {
        data = await next.promise;
      } catch (error) {
        if (typeof error === 'number') throw refusal(error, config);
        throw error;
      }
    }
    return { config, data, status: 200, statusText: 'OK', headers: {} };
  };
  const login = (method: 'login' | 'oauthLogin' | 'magicLinkVerify') => {
    const response = deferred<LoginResult>();
    loginResponses.push(response);
    const pending = (method === 'login' ? store.getState().login('fake', 'fake')
      : method === 'oauthLogin' ? store.getState().oauthLogin('google', 'fake', 'fake', 'fake')
      : store.getState().magicLinkVerify('fake'));
    // Attach immediately so intentional supersession cannot become unhandled.
    const settled = pending.then(value => value, error => error);
    return { response, pending, settled };
  };
  return { api, store, refresh, refreshTransport, login };
}
const cases = (['login', 'oauthLogin', 'magicLinkVerify'] as const).flatMap(method =>
  (['hydrate', 'refreshAuth'] as const).flatMap(restoration =>
    (['login-first', 'hydrate-first'] as const).flatMap(order =>
      (['token', 'challenge'] as const).flatMap(result =>
        (['success', 401, 403] as const).map(outcome => ({ method, restoration, order, result, outcome }))))));
it.each(cases)('$method $order $restoration $outcome preserves admitted $result', async ({ method, restoration, order, result, outcome }) => {
  const { store, refresh, refreshTransport, login } = await setup();
  let restoring: Promise<unknown> | undefined;
  if (order === 'hydrate-first') {
    restoring = store.getState()[restoration]().catch(error => error);
    await vi.waitFor(() => expect(refreshTransport).toHaveBeenCalledOnce());
  }
  const current = login(method);
  restoring ??= store.getState()[restoration]().catch(error => error);
  if (outcome === 'success') refresh.resolve(token('fake-old'));
  else refresh.reject(refusal(outcome, { headers: {} } as InternalAxiosRequestConfig));
  // A skipped restoration has no consumer of the deferred fake refusal.
  void refresh.promise.catch(() => {});
  await restoring;
  current.response.resolve(result === 'token' ? token('fake-new') : challenge);
  expect(await current.settled).toEqual({ requiresTwoFactor: result === 'challenge' });
  if (result === 'token') {
    expect(store.getState()).toMatchObject({ token: 'fake-new', user: { id: 'A' }, isAuthenticated: true, pendingTwoFactor: null });
  } else {
    expect(store.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false,
      pendingTwoFactor: { preAuthToken: 'fake-challenge' } });
    await store.getState().hydrate();
    await store.getState().refreshAuth();
  }
  expect(store.getState()).toMatchObject({ hydrated: true, isLoading: false });
  expect(window.location.href).toBe('/login');
});

const failureCases = (['login', 'oauthLogin', 'magicLinkVerify'] as const).flatMap(method =>
  (['login-first', 'hydrate-first'] as const).flatMap(order =>
    (['success', 401, 403] as const).map(outcome => ({ method, order, outcome }))));
it.each(failureCases)('releases $method protection after $order $outcome and login failure', async ({ method, order, outcome }) => {
  const { store, refresh, refreshTransport, login } = await setup();
  let restoring: Promise<unknown> | undefined;
  if (order === 'hydrate-first') {
    restoring = store.getState().hydrate();
    await vi.waitFor(() => expect(refreshTransport).toHaveBeenCalledOnce());
  }
  const current = login(method);
  restoring ??= store.getState().hydrate();
  void refresh.promise.catch(() => {});
  if (outcome === 'success') refresh.resolve(token('fake-old'));
  else refresh.reject(refusal(outcome, { headers: {} } as InternalAxiosRequestConfig));
  await restoring;
  current.response.reject(new Error('Fake login failure'));
  expect(await current.settled).toBeInstanceOf(Error);
  expect(store.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false, isLoading: false });
  refreshTransport.mockImplementation(async config => ({ config, data: token('fake-restored'), status: 200, statusText: 'OK', headers: {} }));
  const before = refreshTransport.mock.calls.length;
  await store.getState().hydrate();
  expect(refreshTransport).toHaveBeenCalledTimes(before + 1);
  expect(store.getState()).toMatchObject({ token: 'fake-restored', user: { id: 'A' }, isAuthenticated: true, isLoading: false });
});

it.each(['failure', 'token', 'challenge'] as const)('old login %s cleanup cannot release a newer pending login, including same-account ABA', async outcome => {
  const { store, refresh, refreshTransport, login } = await setup();
  await store.getState().completeSession(token('fake-A'));
  const old = login('oauthLogin');
  const current = login('magicLinkVerify');
  if (outcome === 'failure') old.response.reject(new Error('Fake failure'));
  else old.response.resolve(outcome === 'token' ? token('fake-old') : challenge);
  expect(await old.settled).toBeInstanceOf(Error);
  await store.getState().hydrate();
  await store.getState().refreshAuth();
  expect(refreshTransport).not.toHaveBeenCalled();
  current.response.resolve(token('fake-new-A'));
  expect(await current.settled).toEqual({ requiresTwoFactor: false });
  expect(store.getState()).toMatchObject({ token: 'fake-new-A', user: { id: 'A' }, isAuthenticated: true });
  // Successful cleanup also releases protection for later ordinary restoration.
  refresh.resolve(token('fake-rotated'));
  await store.getState().hydrate();
  expect(refreshTransport).toHaveBeenCalledOnce();
  expect(store.getState().token).toBe('fake-rotated');
});

it.each(['token', 'challenge', 'failure'] as const)('logout supersedes pending %s and permits later restoration', async outcome => {
  const { store, refresh, refreshTransport, login } = await setup();
  const old = login('oauthLogin');
  await store.getState().logout();
  if (outcome === 'failure') old.response.reject(new Error('Fake failure'));
  else old.response.resolve(outcome === 'token' ? token('fake-old') : challenge);
  expect(await old.settled).toBeInstanceOf(Error);
  expect(store.getState()).toMatchObject({ token: null, user: null, pendingTwoFactor: null, isAuthenticated: false });
  refresh.resolve(token('fake-restored'));
  await store.getState().hydrate();
  expect(refreshTransport).toHaveBeenCalledOnce();
  expect(store.getState().token).toBe('fake-restored');
});

const loginRefusals = (['login', 'oauthLogin', 'magicLinkVerify'] as const).flatMap(method =>
  ([401, 403] as const).map(status => ({ method, status })));
it.each(loginRefusals)('$method $status failure releases restoration protection', async ({ method, status }) => {
  const { store, refreshTransport, login } = await setup();
  refreshTransport.mockImplementation(async config => { throw refusal(401, config); });
  const current = login(method);
  current.response.reject(status);
  expect(await current.settled).toBeInstanceOf(Error);
  expect(store.getState()).toMatchObject({ token: null, user: null, pendingTwoFactor: null, isAuthenticated: false });
  refreshTransport.mockImplementation(async config => ({ config, data: token('fake-restored'), status: 200, statusText: 'OK', headers: {} }));
  const before = refreshTransport.mock.calls.length;
  await store.getState().hydrate();
  expect(refreshTransport).toHaveBeenCalledTimes(before + 1);
  expect(store.getState()).toMatchObject({ token: 'fake-restored', user: { id: 'A' }, isAuthenticated: true, hydrated: true, isLoading: false });
});

it.each(['success', 'failure'] as const)('protects accepted login while loading its user, then releases on %s', async outcome => {
  const { api, store, refresh, refreshTransport, login } = await setup();
  const user = deferred<object>();
  const adapter = api.defaults.adapter;
  if (typeof adapter !== 'function') throw new Error('Expected fake adapter');
  api.defaults.adapter = async config => config.url === '/auth/me'
    ? { config, data: await user.promise, status: 200, statusText: 'OK', headers: {} }
    : adapter(config);
  const current = login('oauthLogin');
  current.response.resolve(token('fake-new'));
  await vi.waitFor(() => expect(store.getState().token).toBe('fake-new'));
  await store.getState().hydrate();
  await store.getState().refreshAuth();
  expect(refreshTransport).not.toHaveBeenCalled();
  if (outcome === 'success') user.resolve({ id: 'A' });
  else user.reject(new Error('Fake user load failure'));
  const result = await current.settled;
  if (outcome === 'success') expect(result).toEqual({ requiresTwoFactor: false });
  else expect(result).toBeInstanceOf(Error);
  api.defaults.adapter = adapter;
  refresh.resolve(token('fake-rotated'));
  await store.getState().hydrate();
  expect(refreshTransport).toHaveBeenCalledOnce();
  expect(store.getState()).toMatchObject({ token: 'fake-rotated', user: { id: 'A' }, isAuthenticated: true });
});
