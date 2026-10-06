// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OAuthCallbackPage from '@/app/auth/oauth/[provider]/callback/page';
import MagicLinkVerifyPage from '@/app/auth/verify/page';
import VerifyEmailPage from '@/app/auth/verify-email/page';
import { getConnectorStatus } from '@/api/connector-oauth';
import { verifyEmail } from '@/api/auth';
import { connectorRequestPath, initiateConnectorContinuation, readConnectorContinuation, saveConnectorContinuation, setConnectorStatus } from '@/lib/aim-data-continuation';
import { consumeRequestAuthReturn, saveRequestAuthReturn } from '@/lib/request-auth-return';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), provider: 'google', query: new URLSearchParams() }));
const auth = vi.hoisted(() => ({
  oauthLogin: vi.fn(), magicLinkVerify: vi.fn(), pendingTwoFactor: null as null | { preAuthToken: string; expiresAt: number },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useParams: () => ({ provider: navigation.provider }),
  useSearchParams: () => navigation.query,
}));
vi.mock('@/store/auth', () => ({ useAuthStore: <T,>(selector: (state: typeof auth) => T) => selector(auth) }));
vi.mock('@/components/TwoFactorChallenge', () => ({
  default: ({ onVerified }: { onVerified: () => void }) => <button onClick={onVerified}>Finish 2FA</button>,
}));
vi.mock('@/api/connector-oauth', () => ({ getConnectorStatus: vi.fn() }));
vi.mock('@/api/auth', () => ({ verifyEmail: vi.fn() }));

const path = connectorRequestPath('a'.repeat(43));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  setConnectorStatus(true);
  saveConnectorContinuation(path);
  navigation.replace.mockClear();
  navigation.provider = 'google';
  navigation.query = new URLSearchParams({ code: 'code', state: 'state', token: 'magic-token' });
  sessionStorage.setItem('oauth_nonce', 'nonce');
  auth.oauthLogin.mockReset().mockResolvedValue({ requiresTwoFactor: false });
  auth.magicLinkVerify.mockReset().mockResolvedValue({ requiresTwoFactor: false });
  auth.pendingTwoFactor = null;
  vi.mocked(getConnectorStatus).mockResolvedValue(true);
  vi.mocked(verifyEmail).mockResolvedValue({ message: 'Verified.' });
});
afterEach(() => cleanup());

const customerRequest = '/requests/i-need-an-entirely-synthetic-retail-sales-dataset-to-test-a-sales-292929f3?reply=1';
it.each(['oauth', 'email'] as const)('returns to the customer request after %s verification', async (method) => {
  saveRequestAuthReturn(method, customerRequest);
  if (method === 'oauth') render(<OAuthCallbackPage />);
  else { sessionStorage.clear(); render(<MagicLinkVerifyPage />); }
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(customerRequest));
});

it.each(['oauth', 'email'] as const)('retains the customer request until %s MFA completes', async (method) => {
  saveRequestAuthReturn(method, customerRequest);
  auth.pendingTwoFactor = { preAuthToken: 'pre-auth', expiresAt: Date.now() + 60_000 };
  const verify = method === 'oauth' ? auth.oauthLogin : auth.magicLinkVerify;
  verify.mockResolvedValue({ requiresTwoFactor: true });
  if (method === 'oauth') render(<OAuthCallbackPage />);
  else render(<MagicLinkVerifyPage />);
  await waitFor(() => expect(verify).toHaveBeenCalled());
  expect(navigation.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Finish 2FA' }));
  expect(navigation.replace).toHaveBeenCalledWith(customerRequest);
});

it('still refuses OAuth without the origin-local nonce', async () => {
  saveRequestAuthReturn('oauth', customerRequest);
  sessionStorage.removeItem('oauth_nonce');
  render(<OAuthCallbackPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login?error=oauth_failed'));
  expect(auth.oauthLogin).not.toHaveBeenCalled();
  expect(consumeRequestAuthReturn('oauth', '/listings')).toBe(customerRequest);
});

it.each(['google', 'github', 'sso'])('resumes initiated connector login from %s callback', async (provider) => {
  navigation.provider = provider;
  expect(initiateConnectorContinuation(path)).toBe(true);
  render(<OAuthCallbackPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(path));
  expect(auth.oauthLogin).toHaveBeenCalledWith(provider, 'code', 'state', 'nonce');
});

it.each(['google', 'github', 'sso'])('does not resume a non-initiated connector from %s callback', async (provider) => {
  navigation.provider = provider;
  render(<OAuthCallbackPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/listings'));
});

it.each([true, false])('magic-link verify resumes only when initiated=%s', async (initiated) => {
  if (initiated) expect(initiateConnectorContinuation(path)).toBe(true);
  render(<MagicLinkVerifyPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(initiated ? path : '/listings'));
  expect(auth.magicLinkVerify).toHaveBeenCalledWith('magic-token');
});

it.each(['oauth', 'magic'])('resumes an initiated connector after %s two-factor verification', async (method) => {
  expect(initiateConnectorContinuation(path)).toBe(true);
  auth.pendingTwoFactor = { preAuthToken: 'pre-auth', expiresAt: Date.now() + 60_000 };
  if (method === 'oauth') render(<OAuthCallbackPage />);
  else render(<MagicLinkVerifyPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Finish 2FA' }));
  expect(navigation.replace).toHaveBeenCalledWith(path);
});

it('marks the connector request when email verification hands off to login', async () => {
  render(<VerifyEmailPage />);
  const link = await screen.findByRole('link', { name: 'Sign in' });
  expect(link.getAttribute('href')).toBe(`/login?redirect=${encodeURIComponent(path)}`);
  expect(readConnectorContinuation()?.initiated).toBe(true);
});
