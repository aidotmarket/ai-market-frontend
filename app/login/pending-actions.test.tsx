// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const path = `/confirm/11111111-1111-4111-8111-111111111111?t=${'a'.repeat(42)}A`;
const navigation = vi.hoisted(() => ({ query: new URLSearchParams(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, useSearchParams: () => navigation.query }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/api/connector-oauth', () => ({ getConnectorStatus: vi.fn().mockResolvedValue(false) }));
vi.mock('@/api/auth', () => ({ oauthAuthorize: vi.fn(), requestMagicLink: vi.fn(), resendVerification: vi.fn() }));
import { useAuthStore } from '@/store/auth';
import LoginForm from './LoginForm';
import { oauthAuthorize, requestMagicLink } from '@/api/auth';
import { consumeRequestAuthReturn } from '@/lib/request-auth-return';

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  navigation.query = new URLSearchParams({ reauth: 'pending-action', redirect: path });
  useAuthStore.setState({ hydrated: true, isLoading: false, isAuthenticated: true, token: 'old-session', pendingTwoFactor: null });
});
afterEach(() => cleanup());

it('leaves the authenticated user on the login form when pending confirmation requires recent login', async () => {
  render(<LoginForm />); await screen.findByRole('button', { name: 'Log in' });
  await waitFor(() => expect(screen.getByLabelText('Password')).toBeTruthy());
  expect(navigation.replace).not.toHaveBeenCalled();
});

it('returns after password login without making a pending decision', async () => {
  const login = vi.fn().mockResolvedValue({ requiresTwoFactor: false }); useAuthStore.setState({ login });
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(path));
  expect(login).toHaveBeenCalledExactlyOnceWith('owner@example.test', 'password');
});

it('completes the existing login 2FA challenge before returning to exact pending terms', async () => {
  const login = vi.fn().mockImplementation(async () => {
    useAuthStore.setState({ isAuthenticated: false, token: null, pendingTwoFactor: { preAuthToken: 'challenge', expiresAt: Date.now() + 300000 } });
    return { requiresTwoFactor: true };
  });
  const verifyTwoFactor = vi.fn().mockImplementation(async () => {
    useAuthStore.setState({ isAuthenticated: true, token: 'fresh-mfa-session', pendingTwoFactor: null });
    return { ok: true };
  });
  useAuthStore.setState({ login, verifyTwoFactor }); render(<LoginForm />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText('Two-factor authentication'); expect(navigation.push).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(path));
  expect(verifyTwoFactor).toHaveBeenCalledExactlyOnceWith('123456');
});

it('does not let an unsafe pending redirect bypass normal authenticated login handling', async () => {
  navigation.query = new URLSearchParams({ reauth: 'pending-action', redirect: `https://evil.test${path}` });
  render(<LoginForm />); await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/dashboard'));
});

it('keeps a handoff continuation local when requesting the email sign-in link', async () => {
  const handoff = `/checkout/h/${'a'.repeat(42)}A`;
  navigation.query = new URLSearchParams({ redirect: handoff });
  useAuthStore.setState({ isAuthenticated: false });
  vi.mocked(requestMagicLink).mockResolvedValue({ message: 'Sent' });
  render(<LoginForm />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in or sign up with email' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send email link' }));
  await waitFor(() => expect(requestMagicLink).toHaveBeenCalledExactlyOnceWith('buyer@example.test', 'register'));
  expect(consumeRequestAuthReturn('email', '/listings')).toBe(handoff);
});
it('keeps the handoff token out of provider authorization and stores the return only locally', async () => {
  const handoff = `/checkout/h/${'a'.repeat(42)}A`;
  navigation.query = new URLSearchParams({ redirect: handoff });
  useAuthStore.setState({ isAuthenticated: false });
  const authorization_url = 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque';
  vi.mocked(oauthAuthorize).mockResolvedValue({ authorization_url, nonce: 'nonce' });
  render(<LoginForm />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(sessionStorage.getItem('oauth_nonce')).toBe('nonce'));
  expect(oauthAuthorize).toHaveBeenCalledExactlyOnceWith('google');
  expect(authorization_url).not.toContain(handoff.slice('/checkout/h/'.length));
  expect(consumeRequestAuthReturn('oauth', '/listings')).toBe(handoff);
});
