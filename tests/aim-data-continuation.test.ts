// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateRedirect } from '@/lib/redirect';
import { CONTINUATION_KEY, clearContinuation, readContinuation, requestPath, resumeContinuation, saveContinuation } from '@/lib/aim-data-continuation';
import { decideAuthorization, getAuthorization, validateLoopbackRedirect } from '@/api/aim-data-oauth';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/auth';

const id = 'a'.repeat(43);
const path = requestPath(id);
const callback = `http://127.0.0.1:8099/api/auth/aim-market/callback?code=${id}&state=${id}`;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'true');
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(),
    get length() { return storage.size; },
  });
  sessionStorage.clear(); localStorage.clear();
});

describe('exact_continuation_matrix', () => {
  it.each(['true', undefined])('enables continuation when the environment variable is %s', (value) => {
    vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', value);
    expect(saveContinuation(path)).toBe(true);
    expect(resumeContinuation()).toBe(path);
  });
  it.each([path, requestPath('_'.repeat(43)), requestPath('-'.repeat(43))])('accepts exact %s', (value) => {
    expect(validateRedirect(value)).toBe(value);
    expect(saveContinuation(value)).toBe(true);
  });
  it.each([
    '/oauth', '/oauth/authorize', `${path}&extra=1`, `${path}&request=${id}`, `${path}#fragment`,
    path.replace('request=', '%72equest='), path.replace('aaa', '%61aa'),
    `https://ai.market${path}`, `//evil.test${path}`, encodeURIComponent(path),
    encodeURIComponent(encodeURIComponent(path)), path.replace('/oauth', '/%6fauth'),
    `${path}\n`, requestPath('a'.repeat(42)), requestPath('a'.repeat(44)), '/oauth/other', '%',
  ])('rejects %s', (value) => {
    expect(validateRedirect(value)).toBe('/dashboard');
    expect(saveContinuation(value)).toBe(false);
  });
  it('expires without extending on reload and clears consumed state', () => {
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now);
    saveContinuation(path);
    vi.mocked(Date.now).mockReturnValue(now + 1000);
    saveContinuation(path);
    expect(readContinuation()?.deadline).toBe(now + 600_000);
    vi.mocked(Date.now).mockReturnValue(now + 600_000);
    expect(resumeContinuation(path)).toBe('/listings');
    expect(sessionStorage.getItem(CONTINUATION_KEY)).toBeNull();
    vi.restoreAllMocks(); saveContinuation(path); clearContinuation();
    expect(resumeContinuation()).toBe('/listings');
  });
  it.each(['{"request":"bad","deadline":9999999999999}', '{}', 'not-json'])('rejects corrupt storage %s', (value) => {
    sessionStorage.setItem(CONTINUATION_KEY, value);
    expect(readContinuation()).toBeNull();
  });
  it.each(['false', 'FALSE', ' false ', '0', 'off'])('disables stored and direct OAuth continuation for %s while preserving normal navigation', (value) => {
    saveContinuation(path); vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', value);
    expect(saveContinuation(path)).toBe(false);
    expect(resumeContinuation(path)).toBe('/listings');
    expect(resumeContinuation('/dashboard')).toBe('/dashboard');
    expect(readContinuation()).toBeNull();
  });
});

it('website_storage_unchanged', async () => {
  localStorage.setItem('existing', 'unchanged');
  sessionStorage.setItem('oauth_nonce', 'provider-nonce');
  document.cookie = 'website_fixture=unchanged';
  const cookie = document.cookie;
  useAuthStore.setState({ token: 'current-memory-token' });
  saveContinuation(path);
  const adapter = vi.fn(async (config) => ({ data: config.method === 'get' ? {
    request: id, client_name: 'AIM Data', scope: 'aim_data.session',
    expires_at: new Date(Date.now() + 600_000).toISOString(), csrf_nonce: id,
  } : { redirect_url: callback }, status: 200, statusText: 'OK', headers: {}, config }));
  const original = api.defaults.adapter; api.defaults.adapter = adapter;
  try {
    await getAuthorization(id);
    expect(await decideAuthorization(id, id, 'continue')).toBe(callback);
    const config = adapter.mock.calls[1][0];
    expect(config.baseURL).toMatch(/\/api\/v1$/);
    expect(config.url).toBe('/oauth/authorize');
    expect(config.withCredentials).toBe(true);
    expect(config.headers.Authorization.split(' ')).toEqual(['Bearer', 'current-memory-token']);
    expect(JSON.parse(config.data)).toEqual({ request: id, csrf_nonce: id, decision: 'continue' });
    expect(JSON.parse(sessionStorage.getItem(CONTINUATION_KEY)!)).toEqual({ request: id, deadline: expect.any(Number) });
    expect(localStorage.getItem('existing')).toBe('unchanged');
    expect(localStorage.length).toBe(1);
    expect(sessionStorage.getItem('oauth_nonce')).toBe('provider-nonce');
    expect(document.cookie).toBe(cookie);
    expect(useAuthStore.getState().token).toBe('current-memory-token');
    vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'false');
    await expect(decideAuthorization(id, id, 'continue')).rejects.toThrow();
    expect(adapter).toHaveBeenCalledTimes(2);
  } finally { api.defaults.adapter = original; }
});

it.each(['1024', '8080', '8099', '18081', '65535'])('accepts canonical loopback port %s', (port) => {
  expect(validateLoopbackRedirect(callback.replace('8099', port))).toContain(`:${port}/`);
});
it.each([
  callback.replace('8099', '08099'), callback.replace('8099', '1023'), callback.replace('8099', '65536'),
  callback.replace('127.0.0.1', 'localhost'), callback.replace('127.0.0.1', '[::1]'),
  callback.replace('127.0.0.1', '127.1'), callback.replace('127.0.0.1', 'evil@127.0.0.1'),
  callback.replace('/api/', '/%61pi/'), callback.replace('http:', 'https:'),
  `${callback}&token=secret`, `${callback}#fragment`, `${callback}&state=${id}`, `${callback}\n`,
])('rejects unsafe callback %s', (value) => expect(() => validateLoopbackRedirect(value)).toThrow());

it('accepts cancellation with only an allowed error and state', () => {
  const denied = callback.replace(`code=${id}`, 'error=access_denied');
  expect(validateLoopbackRedirect(denied)).toBe(denied);
  expect(() => validateLoopbackRedirect(denied + '&error_description=untrusted')).toThrow();
});
