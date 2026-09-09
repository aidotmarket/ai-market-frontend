// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let LoginForm: typeof import('./LoginForm').default;
let OAuthButtons: typeof import('@/components/OAuthButtons').default;
let AuthorizationPage: typeof import('@/app/oauth/authorize/page').default;
import { oauthAuthorize } from '@/api/auth';
import { getAuthorization } from '@/api/aim-data-oauth';
let useAuthStore: typeof import('@/store/auth').useAuthStore;
import { CONTINUATION_KEY, requestPath, saveContinuation } from '@/lib/aim-data-continuation';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, useSearchParams: () => navigation.query }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/api/auth', () => ({ oauthAuthorize: vi.fn() }));

vi.mock('@/api/aim-data-oauth', () => ({ getAuthorization: vi.fn() }));

beforeEach(async () => {
  vi.resetModules();
  ({ default: LoginForm } = await import('./LoginForm'));
  ({ default: OAuthButtons } = await import('@/components/OAuthButtons'));
  ({ default: AuthorizationPage } = await import('@/app/oauth/authorize/page'));
  ({ useAuthStore } = await import('@/store/auth'));
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'true');
  sessionStorage.clear();
  navigation.query = new URLSearchParams();
  useAuthStore.setState({ hydrated: true, isLoading: false, isAuthenticated: false, user: null, pendingTwoFactor: null });
  vi.stubGlobal('window', { document, location: { href: '' } });
  vi.mocked(oauthAuthorize).mockResolvedValue({ nonce: 'test-nonce', authorization_url: 'https://provider.example/authorize' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(['google', 'github'])('auto-starts %s once under StrictMode and across rerenders', async (provider) => {
  saveContinuation(requestPath('a'.repeat(43)));
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  useAuthStore.setState({ hydrated: false });
  const { rerender } = render(<StrictMode><LoginForm /></StrictMode>);
  expect(oauthAuthorize).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ hydrated: true }));
  expect((screen.getByRole('button', { name: `Continue with ${provider === 'google' ? 'Google' : 'GitHub'}` }) as HTMLButtonElement).disabled).toBe(true);
  expect(document.querySelector('.animate-spin')).toBeTruthy();
  await waitFor(() => expect(window.location.href).toBe('https://provider.example/authorize'));
  expect(sessionStorage.getItem('oauth_nonce')).toBe('test-nonce');
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  rerender(<StrictMode><LoginForm /></StrictMode>);
  expect(oauthAuthorize).toHaveBeenCalledExactlyOnceWith(provider);
});

it.each(['google', 'github'])('auto-starts %s from a saved continuation without reauth', async (provider) => {
  saveContinuation(requestPath('a'.repeat(43)));
  navigation.query = new URLSearchParams({ provider });
  render(<StrictMode><LoginForm /></StrictMode>);
  await waitFor(() => expect(oauthAuthorize).toHaveBeenCalledExactlyOnceWith(provider));
});

it.each(['invalid', 'Google', '', 'https://provider.example'])('ignores invalid provider %s', (provider) => {
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  render(<LoginForm />);
  expect(oauthAuthorize).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Email')).toBeTruthy();
});

it.each(['google', 'github'])('does not auto-start %s for an authenticated user', (provider) => {
  saveContinuation(requestPath('a'.repeat(43)));
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  useAuthStore.setState({ isAuthenticated: true });
  render(<LoginForm />);
  expect(oauthAuthorize).not.toHaveBeenCalled();
});

it('does not auto-start outside AIM Data', () => {
  navigation.query = new URLSearchParams({ provider: 'google' });
  render(<LoginForm />);
  expect(oauthAuthorize).not.toHaveBeenCalled();
});

it.each(['google', 'github'])('shows the normal form and existing error after %s fails without retrying', async (provider) => {
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  saveContinuation(requestPath('a'.repeat(43)));
  vi.mocked(oauthAuthorize).mockRejectedValueOnce(new Error('unavailable'));
  const { rerender } = render(<StrictMode><LoginForm /></StrictMode>);
  expect(await screen.findByText(`Failed to connect to ${provider === 'google' ? 'Google' : 'GitHub'}. Please try again.`)).toBeTruthy();
  expect(screen.getByLabelText('Email')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  rerender(<StrictMode><LoginForm /></StrictMode>);
  expect(oauthAuthorize).toHaveBeenCalledExactlyOnceWith(provider);
  fireEvent.click(screen.getByRole('button', { name: `Continue with ${provider === 'google' ? 'Google' : 'GitHub'}` }));
  await waitFor(() => expect(window.location.href).toBe('https://provider.example/authorize'));
  expect(oauthAuthorize).toHaveBeenCalledTimes(2);
});

it.each(['google', 'github'])('still starts %s from its button with the nonce and authorization URL', async (provider) => {
  render(<OAuthButtons mode="login" />);
  fireEvent.click(screen.getByRole('button', { name: `Continue with ${provider === 'google' ? 'Google' : 'GitHub'}` }));
  await waitFor(() => expect(window.location.href).toBe('https://provider.example/authorize'));
  expect(oauthAuthorize).toHaveBeenCalledExactlyOnceWith(provider);
  expect(sessionStorage.getItem('oauth_nonce')).toBe('test-nonce');
});


it.each(['google', 'github'])('does not auto-start %s from bare reauth or with the kill switch off', (provider) => {
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  const { rerender } = render(<LoginForm />);
  expect(oauthAuthorize).not.toHaveBeenCalled();
  saveContinuation(requestPath('a'.repeat(43)));
  vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'false');
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  rerender(<LoginForm />);
  expect(oauthAuthorize).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Email')).toBeTruthy();
});

it('hides provider buttons until hinted login hydration resolves', () => {
  navigation.query = new URLSearchParams({ provider: 'google' });
  useAuthStore.setState({ hydrated: false });
  render(<LoginForm />);
  expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue with GitHub' })).toBeNull();
});

it('shares one flight between a manual click and subsequent hinted hydration', async () => {
  let resolve!: (data: { nonce: string; authorization_url: string }) => void;
  vi.mocked(oauthAuthorize).mockReturnValue(new Promise((done) => { resolve = done; }));
  const assign = vi.fn();
  Object.defineProperty(window.location, 'href', { set: assign, configurable: true });
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  saveContinuation(requestPath('a'.repeat(43)));
  useAuthStore.setState({ hydrated: false });
  // A manual control already mounted before the hinted login hydrates.
  const manual = render(<OAuthButtons mode="login" />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
  expect(document.querySelector('.animate-spin')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(true);
  manual.unmount();
  navigation.query = new URLSearchParams({ provider: 'google' });
  render(<StrictMode><LoginForm /></StrictMode>);
  act(() => useAuthStore.setState({ hydrated: true }));
  await waitFor(() => expect(oauthAuthorize).toHaveBeenCalledExactlyOnceWith('github'));
  expect(screen.getByRole('button', { name: 'Continue with GitHub' }).querySelector('.animate-spin')).toBeTruthy();
  await act(async () => resolve({ nonce: 'only-nonce', authorization_url: 'https://provider.example/one' }));
  expect(assign).toHaveBeenCalledExactlyOnceWith('https://provider.example/one');
  expect(storage.mock.calls.filter(([key]) => key === 'oauth_nonce')).toEqual([['oauth_nonce', 'only-nonce']]);
  expect(oauthAuthorize).toHaveBeenCalledTimes(1);
  storage.mockRestore();
});

it.each([404, 403, 400, 'network'])('rejects unverified provider hints when metadata fails with %s', async (status) => {
  const id = 'x'.repeat(43);
  vi.stubGlobal('window', { document, location: { pathname: '/oauth/authorize', search: `?request=${id}&provider=google`, hash: '', href: '', assign: vi.fn() } });
  vi.mocked(getAuthorization).mockRejectedValue(status === 'network' ? new Error('network') : { response: { status } });
  const page = render(<AuthorizationPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(`/login?redirect=${encodeURIComponent(requestPath(id))}`));
  expect(getAuthorization).toHaveBeenCalledExactlyOnceWith(id);
  expect(sessionStorage.getItem(CONTINUATION_KEY)).toBeNull();
  page.unmount();
  navigation.query = new URL(navigation.replace.mock.calls[0][0], 'https://ai.market').searchParams;
  render(<LoginForm />);
  expect(oauthAuthorize).not.toHaveBeenCalled();
  expect(window.location.href).toBe('');
  expect(window.location.assign).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(CONTINUATION_KEY)).toBeNull();
});

it('auto-starts GitHub exactly once after server verification and continuation save', async () => {
  const id = 'a'.repeat(43);
  vi.stubGlobal('window', { document, location: { pathname: '/oauth/authorize', search: `?request=${id}&provider=github`, hash: '', href: '' } });
  let resolve!: (data: Awaited<ReturnType<typeof getAuthorization>>) => void;
  vi.mocked(getAuthorization).mockReturnValue(new Promise((done) => { resolve = done; }));
  const page = render(<AuthorizationPage />);
  expect(sessionStorage.getItem(CONTINUATION_KEY)).toBeNull();
  expect(navigation.replace).not.toHaveBeenCalled();
  await act(async () => resolve({ request: id, client_name: 'AIM Data', scope: 'aim_data.session', csrf_nonce: 'b'.repeat(43), expires_at: new Date(Date.now() + 600000).toISOString() }));
  expect(sessionStorage.getItem(CONTINUATION_KEY)).not.toBeNull();
  page.unmount();
  navigation.query = new URL(navigation.replace.mock.calls[0][0], 'https://ai.market').searchParams;
  render(<StrictMode><LoginForm /></StrictMode>);
  await waitFor(() => expect(window.location.href).toBe('https://provider.example/authorize'));
  expect(oauthAuthorize).toHaveBeenCalledExactlyOnceWith('github');
});
