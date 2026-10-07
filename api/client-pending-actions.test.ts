import axios, { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const path = `/confirm/11111111-1111-4111-8111-111111111111?t=${'a'.repeat(42)}A`;
const clear = vi.fn();
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.doMock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ isAuthenticated: true }), setState: clear } }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([401, 403])('lets the confirmation page handle terminal refresh %s and API flag-off admission', async (status) => {
  const failure = new AxiosError('auth refused', 'ERR_BAD_RESPONSE', undefined, undefined, { status, data: {}, headers: {}, config: { headers: {} } as never, statusText: 'refused' });
  vi.spyOn(axios, 'post').mockRejectedValue(failure);
  const url = new URL(path, 'https://ai.market');
  vi.stubGlobal('window', { location: { pathname: url.pathname, search: url.search, hash: '', href: path } });
  const { refreshAccessToken } = await import('./client');
  await expect(refreshAccessToken()).rejects.toBe(failure);
  expect(clear).toHaveBeenCalledWith({ user: null, token: null, isAuthenticated: false, pendingTwoFactor: null });
  expect(window.location.href).toBe(path);
});

it('retains normal login handling for a non-exact confirmation path', async () => {
  const failure = new AxiosError('auth refused', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 401, data: {}, headers: {}, config: { headers: {} } as never, statusText: 'refused' });
  vi.spyOn(axios, 'post').mockRejectedValue(failure);
  const url = new URL(`${path}&next=evil`, 'https://ai.market');
  vi.stubGlobal('window', { location: { pathname: url.pathname, search: url.search, hash: '', href: `${path}&next=evil` } });
  const { refreshAccessToken } = await import('./client');
  await expect(refreshAccessToken()).rejects.toBe(failure);
  expect(window.location.href).toBe('/login');
});
