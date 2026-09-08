// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LoginForm from './LoginForm';
import OAuthButtons from '@/components/OAuthButtons';
import { oauthAuthorize } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { requestPath, saveContinuation } from '@/lib/aim-data-continuation';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, useSearchParams: () => navigation.query }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/api/auth', () => ({ oauthAuthorize: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'true');
  sessionStorage.clear();
  navigation.query = new URLSearchParams();
  useAuthStore.setState({ hydrated: true, isAuthenticated: false, user: null, pendingTwoFactor: null });
  vi.stubGlobal('window', { document, location: { href: '' } });
  vi.mocked(oauthAuthorize).mockResolvedValue({ nonce: 'test-nonce', authorization_url: 'https://provider.example/authorize' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(['google', 'github'])('auto-starts %s once under StrictMode and across rerenders', async (provider) => {
  navigation.query = new URLSearchParams({ reauth: 'aim-data', provider });
  useAuthStore.setState({ hydrated: false });
  const { rerender } = render(<StrictMode><LoginForm /></StrictMode>);
  expect(oauthAuthorize).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ hydrated: true }));
  expect(screen.getByRole('status').textContent).toBe(`Opening ${provider === 'google' ? 'Google' : 'GitHub'}…`);
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
