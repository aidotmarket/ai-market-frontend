// @vitest-environment jsdom
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Providers } from '@/components/Providers';
import OAuthCallbackPage from '@/app/auth/oauth/[provider]/callback/page';
import MagicLinkVerifyPage from '@/app/auth/verify/page';
import { api } from '@/api/client';
import { useAuthStore as store } from '@/store/auth';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), query: new URLSearchParams({ code: 'fake', state: 'fake', token: 'fake' }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useParams: () => ({ provider: 'google' }),
  useSearchParams: () => navigation.query,
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function refusal(status: number, config: InternalAxiosRequestConfig) {
  return new AxiosError('Fake refusal', 'ERR_BAD_RESPONSE', config, undefined,
    { config, status, statusText: 'Refused', data: {}, headers: {} });
}
const originalAdapter = axios.defaults.adapter;
const originalHydrate = store.getState().hydrate;
beforeEach(async () => {
  // All requests use in-memory Axios adapters, including cleanup and restoration.
  api.defaults.adapter = async config => ({ config, data: {}, status: 200, statusText: 'OK', headers: {} });
  await store.getState().logout();
  store.setState({ hydrated: false, hydrate: originalHydrate });
  localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('oauth_nonce', 'fake');
  navigation.replace.mockClear();
});
afterEach(() => { cleanup(); axios.defaults.adapter = originalAdapter; vi.restoreAllMocks(); });

const mounts = (['oauth', 'magic'] as const).flatMap(method =>
  ([401, 403] as const).flatMap(status =>
    (['token', 'challenge'] as const).map(result => ({ method, status, result }))));
it.each(mounts)('mounts real $method callback in Providers with $status restoration and $result response', async ({ method, status, result }) => {
  const response = deferred<object>();
  const events: string[] = [];
  const hydrate = store.getState().hydrate;
  store.setState({ hydrate: () => { events.push('hydrate'); return hydrate(); } });
  axios.defaults.adapter = async config => { events.push('refresh'); throw refusal(status, config); };
  api.defaults.adapter = async config => {
    if (config.url === '/auth/me') return { config, data: { id: 'B' }, status: 200, statusText: 'OK', headers: {} };
    expect(config.url).toBe(method === 'oauth' ? '/auth/oauth/google/callback' : '/auth/magic-link/verify');
    events.push('login');
    return { config, data: await response.promise, status: 200, statusText: 'OK', headers: {} };
  };
  render(<Providers>{method === 'oauth' ? <OAuthCallbackPage /> : <MagicLinkVerifyPage />}</Providers>);
  expect(events.slice(0, 2)).toEqual(['login', 'hydrate']);
  await act(async () => { await Promise.resolve(); });
  await act(async () => {
    response.resolve(result === 'token' ? { access_token: 'fake-B', token_type: 'bearer' }
      : { requires_2fa: true, pre_auth_token: 'fake-challenge', expires_in: 300 });
  });
  if (result === 'token') {
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/listings'));
    expect(store.getState()).toMatchObject({ token: 'fake-B', user: { id: 'B' }, isAuthenticated: true });
  } else {
    expect(store.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false,
      pendingTwoFactor: { preAuthToken: 'fake-challenge' } });
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /verify/i })).toBeTruthy();
  }
});
