import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mutationTransport = vi.hoisted(() => ({ adapter: vi.fn() }));
vi.mock('axios', async original => {
  const imported = await original<typeof import('axios')>();
  const actual = imported.default;
  return { ...imported, default: Object.assign((...args: Parameters<typeof actual>) => actual(...args), actual, {
    create: (config: Parameters<typeof actual.create>[0]) => actual.create({ ...config, adapter: mutationTransport.adapter }),
  }) };
});
import { api, currentSessionRefresh, refreshAccessToken, reserveRecoveryRefresh } from './client';
import { nativeClient, nativeRead, nativeWrite, nativeSession } from './connector-seller-settings';
import { postSessionMutation } from './session-mutation';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { sessionCsrf } from '@/lib/session-csrf';
import type { User } from '@/types';

const user = { id: 'race-account', role: 'seller' } as User;
const token = (seconds: number) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.sig`;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const ok = (config: InternalAxiosRequestConfig, data: unknown = 'ok'): AxiosResponse => ({ config, data, headers: {}, status: 200, statusText: 'OK' });
const refusal = (config: InternalAxiosRequestConfig, status = 401) => new AxiosError('Synthetic refusal', 'ERR_BAD_RESPONSE', config, undefined, { ...ok(config), status });
const original = [axios.defaults.adapter, api.defaults.adapter, nativeClient.defaults.adapter];
beforeEach(() => {
  advanceAuthSessionOwner();
  useAuthStore.setState({ user, token: token(-10), hydrated: true, isLoading: false, isAuthenticated: true });
  // The private mutation client uses Axios defaults at dispatch, too.
  mutationTransport.adapter.mockReset().mockRejectedValue(new Error('Real transport forbidden'));
  axios.defaults.adapter = mutationTransport.adapter;
});
afterEach(() => {
  [axios.defaults.adapter, api.defaults.adapter, nativeClient.defaults.adapter] = original;
  vi.restoreAllMocks(); vi.useRealTimers();
});

it('regresses 16:14:32–33: bootstrap, store, mutation and native/API callers share one flight, including late 401s', async () => {
  const oldApi = deferred<AxiosResponse>(), oldNative = deferred<AxiosResponse>();
  let apiConfig!: InternalAxiosRequestConfig, nativeConfig!: InternalAxiosRequestConfig;
  const refresh = deferred<{ data: { access_token: string } }>();
  const fresh = token(3600);
  const post = vi.spyOn(axios, 'post').mockReturnValue(refresh.promise as never);
  api.defaults.adapter = vi.fn(async config => {
    if (config.url === '/support/pending-profile-changes' && !apiConfig) { apiConfig = config; return oldApi.promise; }
    expect(config.headers.Authorization).toBe(`Bearer ${fresh}`);
    return ok(config, config.url === '/auth/me' ? user : 'ok');
  });
  nativeClient.defaults.adapter = vi.fn(async config => {
    if (config.url === '/connector-seller-settings' && !nativeConfig) { nativeConfig = config; return oldNative.promise; }
    expect(config.headers.Authorization).toBe(`Bearer ${fresh}`);
    expect(config.headers['X-CSRF-Token']).toBe(sessionCsrf(fresh));
    return ok(config);
  });
  mutationTransport.adapter.mockImplementation(async config => {
    expect(config.headers.Authorization).toBe(`Bearer ${fresh}`);
    expect(config.headers['X-CSRF-Token']).toBe(sessionCsrf(fresh));
    return ok(config);
  });
  const pending = api.get('/support/pending-profile-changes');
  const authority = nativeRead('/connector-seller-settings');
  const hydrate = useAuthStore.getState().hydrate(); // Providers page bootstrap
  const storeRefresh = useAuthStore.getState().refreshAuth();
  const mutation = postSessionMutation('/preflight', {});
  const direct = refreshAccessToken();
  await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
  const waitingApi = api.get('/auth/capabilities');
  const waitingNative = nativeClient.get('/native-direct', { headers: nativeSession().headers });
  const waitingRead = nativeRead('/native-read');
  expect(vi.mocked(api.defaults.adapter)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(nativeClient.defaults.adapter)).toHaveBeenCalledTimes(1);
  expect(axios.defaults.adapter).not.toHaveBeenCalled();
  refresh.resolve({ data: { access_token: fresh } });
  await Promise.all([hydrate, storeRefresh, mutation, direct, waitingApi, waitingNative, waitingRead]);
  expect(currentSessionRefresh()).toBeNull();
  // The original requests' refusals arrive AFTER the 16:14:32 refresh settled.
  // The old client starts the second /auth/refresh here at 16:14:33.
  oldApi.reject(refusal(apiConfig)); oldNative.reject(refusal(nativeConfig));
  await expect(pending).resolves.toMatchObject({ data: 'ok' });
  await expect(authority).resolves.toBe('ok');
  expect(post).toHaveBeenCalledOnce();
  expect(useAuthStore.getState()).toMatchObject({ token: fresh, isAuthenticated: true, user });
});

it.each(['api', 'native', 'nativeRead'] as const)('%s replays a superseded-token 401 once, without another refresh or a refusal loop', async kind => {
  const fresh = token(3600);
  const post = vi.spyOn(axios, 'post');
  const transport = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (transport.mock.calls.length === 1) useAuthStore.setState({ token: fresh });
    else expect(config.headers.Authorization).toBe(`Bearer ${fresh}`);
    throw refusal(config);
  });
  api.defaults.adapter = transport; nativeClient.defaults.adapter = transport;
  const request = kind === 'api' ? api.get('/private') : kind === 'native' ? nativeClient.get('/private', { headers: nativeSession().headers }) : nativeRead('/private');
  await expect(request).rejects.toBeTruthy();
  expect(transport).toHaveBeenCalledTimes(2); expect(post).not.toHaveBeenCalled();
});

it.each(['api', 'native', 'nativeRead'] as const)('%s waits for a concurrent refresh before replaying a 401', async kind => {
  const refresh = deferred<{ data: { access_token: string } }>();
  const response = deferred<AxiosResponse>();
  const fresh = token(3600);
  let first!: InternalAxiosRequestConfig;
  const post = vi.spyOn(axios, 'post').mockReturnValue(refresh.promise as never);
  const transport = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (!first) { first = config; return response.promise; }
    expect(config.headers.Authorization).toBe(`Bearer ${fresh}`); return ok(config);
  });
  api.defaults.adapter = transport; nativeClient.defaults.adapter = transport;
  const request = kind === 'api' ? api.get('/private') : kind === 'native' ? nativeClient.get('/private', { headers: nativeSession().headers }) : nativeRead('/private');
  const flight = refreshAccessToken();
  response.reject(refusal(first));
  await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(transport).toHaveBeenCalledOnce();
  refresh.resolve({ data: { access_token: fresh } });
  await Promise.all([request, flight]);
  expect(transport).toHaveBeenCalledTimes(2); expect(post).toHaveBeenCalledOnce();
});

it('one-use session-view recovery uses the shared flight and holds ordinary callers behind its transport', async () => {
  const refresh = deferred<{ data: { access_token: string } }>();
  const post = vi.spyOn(axios, 'post').mockReturnValue(refresh.promise as never);
  const lease = reserveRecoveryRefresh(() => {});
  const fresh = token(3600);
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    expect(config.headers.Authorization).toBe(`Bearer ${fresh}`); return ok(config);
  });
  api.defaults.adapter = adapter; nativeClient.defaults.adapter = adapter;
  try {
    const flight = lease.refresh();
    const first = api.get('/private'); const second = nativeRead('/private');
    expect(adapter).not.toHaveBeenCalled();
    await expect(refreshAccessToken()).rejects.toThrow('Scoped');
    expect(() => reserveRecoveryRefresh(() => {})).toThrow('already in progress');
    refresh.resolve({ data: { access_token: fresh } });
    await Promise.all([flight, first, second]);
    expect(post).toHaveBeenCalledOnce(); expect(adapter).toHaveBeenCalledTimes(2);
  } finally { lease.release(); }
});

it.each(['api', 'native'] as const)('%s never dispatches a queued read into a replacement auth owner', async kind => {
  const refresh = deferred<{ data: { access_token: string } }>();
  vi.spyOn(axios, 'post').mockReturnValue(refresh.promise as never);
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ok(config));
  api.defaults.adapter = adapter; nativeClient.defaults.adapter = adapter;
  const flight = refreshAccessToken().catch(error => error);
  const pending = (kind === 'api' ? api.get('/private') : nativeClient.get('/private')).catch(error => error);
  advanceAuthSessionOwner(); useAuthStore.setState({ token: 'replacement', user: { ...user, id: 'replacement' } });
  refresh.resolve({ data: { access_token: token(3600) } });
  await flight;
  expect(await pending).toBeInstanceOf(Error); expect(adapter).not.toHaveBeenCalled();
  expect(useAuthStore.getState().token).toBe('replacement');
});

it('a 503 preserves the session and releases the flight so later recovery can succeed', async () => {
  const post = vi.spyOn(axios, 'post').mockRejectedValueOnce(refusal({ headers: {} } as InternalAxiosRequestConfig, 503))
    .mockResolvedValueOnce({ data: { access_token: token(3600) } });
  const prior = useAuthStore.getState();
  await expect(refreshAccessToken()).rejects.toMatchObject({ response: { status: 503 } });
  expect(useAuthStore.getState()).toBe(prior);
  expect(currentSessionRefresh()).toBeNull();
  await expect(refreshAccessToken()).resolves.toBe(token(3600)); expect(post).toHaveBeenCalledTimes(2);
});

it('queued native idempotent writes use a fresh body/header CSRF pair; reviewed decisions require a new review', async () => {
  const refresh = deferred<{ data: { access_token: string } }>();
  const post = vi.spyOn(axios, 'post').mockReturnValue(refresh.promise as never);
  const fresh = token(3600);
  const oldSession = nativeSession();
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    expect(config.headers.Authorization).toBe(`Bearer ${fresh}`);
    expect(config.headers['X-CSRF-Token']).toBe(sessionCsrf(fresh));
    expect(JSON.parse(config.data)).toEqual({ request_id: 'same-command', csrf: sessionCsrf(fresh) });
    return ok(config);
  });
  nativeClient.defaults.adapter = adapter;
  const flight = refreshAccessToken();
  const write = nativeWrite('/idempotent', { request_id: 'same-command' });
  const decision = nativeClient.post('/reviewed-decision', { csrf: oldSession.csrf }, { headers: oldSession.headers }).catch(error => error);
  expect(adapter).not.toHaveBeenCalled();
  refresh.resolve({ data: { access_token: fresh } });
  await Promise.all([flight, write]);
  expect(await decision).toMatchObject({ message: 'SESSION_CHANGED' });
  expect(adapter).toHaveBeenCalledOnce(); expect(post).toHaveBeenCalledOnce();
});
it.each(['api', 'native'] as const)('%s cancels a read waiting for refresh without dispatching it', async kind => {
  const refresh = deferred<{ data: { access_token: string } }>();
  vi.spyOn(axios, 'post').mockReturnValue(refresh.promise as never);
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ok(config));
  api.defaults.adapter = adapter; nativeClient.defaults.adapter = adapter;
  const flight = refreshAccessToken(); const controller = new AbortController();
  const pending = (kind === 'api' ? api : nativeClient).get('/cancelled', { signal: controller.signal }).catch(error => error);
  controller.abort(); refresh.resolve({ data: { access_token: token(3600) } });
  await flight; expect(axios.isCancel(await pending)).toBe(true); expect(adapter).not.toHaveBeenCalled();
});
it('store admission can reuse a refresh that completed during its dynamic import', async () => {
  const old = useAuthStore.getState().token;
  const fresh = token(3600); useAuthStore.setState({ token: fresh });
  const post = vi.spyOn(axios, 'post');
  await expect(refreshAccessToken(old)).resolves.toBe(fresh); expect(post).not.toHaveBeenCalled();
});

it('anonymous public reads stay available while cookie restoration is in progress', async () => {
  useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  const refresh = deferred<{ data: { access_token: string } }>();
  vi.spyOn(axios, 'post').mockReturnValue(refresh.promise as never);
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ok(config));
  api.defaults.adapter = adapter;
  const flight = refreshAccessToken().catch(error => error);
  await expect(api.get('/public/listings')).resolves.toMatchObject({ data: 'ok' });
  expect(adapter).toHaveBeenCalledOnce();
  refresh.reject(refusal({ headers: {} } as InternalAxiosRequestConfig));
  await flight;
});
