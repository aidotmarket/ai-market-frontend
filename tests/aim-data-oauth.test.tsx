// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthorizationPage from '@/app/oauth/authorize/page';
import LoginForm from '@/app/login/LoginForm';
import ProviderCallback from '@/app/auth/oauth/[provider]/callback/page';
import MagicLinkVerify from '@/app/auth/verify/page';
import { useAuthStore } from '@/store/auth';
import { CONTINUATION_KEY, requestPath, saveContinuation } from '@/lib/aim-data-continuation';
import { decideAuthorization, getAuthorization } from '@/api/aim-data-oauth';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation, useSearchParams: () => navigation.query, useParams: () => ({ provider: 'google' }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/OAuthButtons', () => ({ default: () => <div>Provider options</div> }));
vi.mock('@/components/TwoFactorChallenge', () => ({ default: ({ onVerified }: { onVerified: () => void }) =>
  <button onClick={onVerified}>Complete 2FA</button> }));
vi.mock('@/api/aim-data-oauth', () => ({ getAuthorization: vi.fn(), decideAuthorization: vi.fn() }));
const id = 'a'.repeat(43);
const path = requestPath(id);
const user = { id: 'synthetic-user', email: 'synthetic@example.test' } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
const metadata = () => ({ request: id, client_name: 'AIM Data' as const, scope: 'aim_data.session' as const,
  csrf_nonce: 'b'.repeat(43), expires_at: new Date(Date.now() + 600_000).toISOString() });
const failure = (error: string, status = 403) => ({ response: { status, data: { error } } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'true');
  sessionStorage.clear(); window.history.replaceState({}, '', path);
  navigation.query = new URLSearchParams();
  useAuthStore.setState({ user, token: 'memory-token', hydrated: true, isLoading: false,
    isAuthenticated: true, pendingTwoFactor: null, hydrate: vi.fn().mockResolvedValue(undefined) });
  vi.mocked(getAuthorization).mockResolvedValue(metadata());
  vi.mocked(decideAuthorization).mockRejectedValue(failure('access_denied'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('enables confirmation when the environment variable is unset', async () => {
  vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', undefined);
  render(<AuthorizationPage />);
  expect(await screen.findByText(`Continue to AIM Data as ${user.email}`)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  expect(getAuthorization).toHaveBeenCalledExactlyOnceWith(id);
  expect(decideAuthorization).not.toHaveBeenCalled();
});

it('no_code_before_continue', async () => {
  useAuthStore.setState({ hydrated: false, isAuthenticated: false, user: null });
  render(<AuthorizationPage />);
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(getAuthorization).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ hydrated: true }));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent(path)}`));
  expect(decideAuthorization).not.toHaveBeenCalled();
  cleanup(); useAuthStore.setState({ isAuthenticated: true, user }); render(<AuthorizationPage />);
  await screen.findByRole('button', { name: 'Continue' });
  expect(decideAuthorization).not.toHaveBeenCalled();
});

it.each(['Continue', 'Cancel'])('explicit_account_confirm_cancel: %s', async (label) => {
  let reject!: (cause: unknown) => void;
  vi.mocked(decideAuthorization).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  render(<AuthorizationPage />);
  expect(await screen.findByText(`Continue to AIM Data as ${user.email}`)).toBeTruthy();
  expect(screen.getByText('AIM Data receives account access equivalent to signing in with your password.')).toBeTruthy();
  const button = screen.getByRole('button', { name: label });
  fireEvent.click(button); fireEvent.click(button);
  expect(decideAuthorization).toHaveBeenCalledExactlyOnceWith(id, 'b'.repeat(43), label.toLowerCase());
  expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => reject(failure('access_denied')));
  expect(sessionStorage.getItem(CONTINUATION_KEY)).toBeNull();
});

it('original_tab_resumes_other_browser_rejected', async () => {
  render(<AuthorizationPage />); await screen.findByRole('button', { name: 'Continue' });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => expect(useAuthStore.getState().hydrate).toHaveBeenCalled());
  await waitFor(() => expect(getAuthorization).toHaveBeenCalledTimes(2));
  cleanup(); sessionStorage.clear();
  vi.mocked(getAuthorization).mockRejectedValue(failure('binding_failed'));
  render(<AuthorizationPage />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('another browser'));
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(decideAuthorization).not.toHaveBeenCalled();
});

it('disabled_expired_error_ui', async () => {
  vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'false');
  render(<AuthorizationPage />); expect(screen.getByText(/currently unavailable/)).toBeTruthy();
  expect(screen.getByRole('link')).toHaveProperty('href', expect.stringContaining('/listings'));
  expect(getAuthorization).not.toHaveBeenCalled(); expect(decideAuthorization).not.toHaveBeenCalled();
  cleanup(); vi.stubEnv('NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED', 'true');
  vi.mocked(getAuthorization).mockResolvedValue({ ...metadata(), expires_at: new Date(0).toISOString() });
  render(<AuthorizationPage />); expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('expired'));
  cleanup(); vi.mocked(getAuthorization).mockRejectedValue(failure('<img src=x onerror=alert(1)>'));
  render(<AuthorizationPage />); expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Retry'));
  expect(document.querySelector('img')).toBeNull();
});

it.each(['login_required', 'invalid_session', 'insufficient_assurance'])('offers explicit reauthentication for %s', async (kind) => {
  vi.mocked(decideAuthorization).mockRejectedValue(failure(kind));
  render(<AuthorizationPage />); fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }));
  expect(navigation.push).toHaveBeenCalledWith(`/login?reauth=aim-data&redirect=${encodeURIComponent(path)}`);
  cleanup(); navigation.query = new URLSearchParams({ reauth: 'aim-data', redirect: path });
  render(<LoginForm />); expect(navigation.replace).not.toHaveBeenCalled();
});

describe('password_provider_magic_link_2fa_resume', () => {
  it.each(['password', 'provider', 'magic-link'])('resumes %s with and without 2FA', async (method) => {
    for (const requiresTwoFactor of [false, true]) {
      saveContinuation(path); sessionStorage.setItem('oauth_nonce', 'unchanged-nonce');
      navigation.query = new URLSearchParams({ redirect: path, code: 'provider-code', state: 'provider-state', token: 'magic-token' });
      const login = vi.fn().mockImplementation(async () => {
        if (requiresTwoFactor) useAuthStore.setState({ pendingTwoFactor: { preAuthToken: 'pre-auth', expiresAt: Date.now() + 1000 } });
        return { requiresTwoFactor };
      });
      useAuthStore.setState({ isAuthenticated: false, pendingTwoFactor: null, login, oauthLogin: login, magicLinkVerify: login });
      navigation.push.mockClear(); navigation.replace.mockClear();
      render(method === 'password' ? <LoginForm /> : method === 'provider' ? <ProviderCallback /> : <MagicLinkVerify />);
      if (method === 'password') {
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: user.email } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password' } });
        fireEvent.submit(document.querySelector('form')!);
      }
      await waitFor(() => expect(login).toHaveBeenCalledOnce());
      if (method === 'provider') expect(login).toHaveBeenCalledWith('google', 'provider-code', 'provider-state', 'unchanged-nonce');
      if (requiresTwoFactor) {
        expect(navigation.push).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: 'Complete 2FA' }));
      }
      await waitFor(() => expect(method === 'password' ? navigation.push : navigation.replace).toHaveBeenCalledWith(path));
      cleanup();
    }
  });
  it('rehydrates the waiting login tab after a magic link', async () => {
    saveContinuation(path); useAuthStore.setState({ isAuthenticated: false, hydrate: vi.fn(async () => {
      useAuthStore.setState({ isAuthenticated: true, user });
    }) });
    render(<LoginForm />); act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(path));
  });
});

it.each(['Continue', 'Cancel'])('consumes continuation and navigates the validated callback after %s', async (label) => {
  const assign = vi.fn();
  const originalWindow = window;
  const result = label === 'Continue' ? `code=${id}` : 'error=access_denied';
  const url = `http://127.0.0.1:8099/api/auth/aim-market/callback?${result}&state=${id}`;
  vi.stubGlobal('window', { document, location: { pathname: '/oauth/authorize', search: `?request=${id}`, hash: '', assign } });
  vi.mocked(decideAuthorization).mockResolvedValue(url);
  try {
    render(<AuthorizationPage />); fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(url));
    expect(sessionStorage.getItem(CONTINUATION_KEY)).toBeNull();
  } finally { cleanup(); vi.stubGlobal('window', originalWindow); }
});

it.each([`${path}&extra=1`, `${path}&request=${id}`, path.replace('request', '%72equest'), `${path}#fragment`])('rejects raw page URL %s', async (url) => {
  window.history.replaceState({}, '', url); render(<AuthorizationPage />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('invalid'));
  expect(getAuthorization).not.toHaveBeenCalled(); expect(decideAuthorization).not.toHaveBeenCalled();
});

it('expires visible confirmation before a late click', async () => {
  render(<AuthorizationPage />); await screen.findByRole('button', { name: 'Continue' });
  const realNow = Date.now;
  const later = Date.now() + 600_001;
  vi.spyOn(Date, 'now').mockReturnValue(later);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('expired'));
    expect(decideAuthorization).not.toHaveBeenCalled();
  } finally { Date.now = realNow; }
});


it.each(['google', 'github', 'invalid'])('passes only a valid %s provider hint to login without saving it', async (provider) => {
  window.history.replaceState({}, '', `${path}&provider=${provider}`);
  useAuthStore.setState({ isAuthenticated: false, user: null });
  render(<AuthorizationPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent(path)}${provider === 'invalid' ? '' : `&provider=${provider}`}`));
  expect(JSON.parse(sessionStorage.getItem(CONTINUATION_KEY)!)).toEqual({ request: id, deadline: expect.any(Number) });
});

it.each(['google', 'github', 'invalid'])('passes only a valid %s provider hint to reauthentication', async (provider) => {
  window.history.replaceState({}, '', `${path}&provider=${provider}`);
  vi.mocked(decideAuthorization).mockRejectedValue(failure('login_required'));
  render(<AuthorizationPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }));
  expect(navigation.push).toHaveBeenCalledWith(`/login?reauth=aim-data&redirect=${encodeURIComponent(path)}${provider === 'invalid' ? '' : `&provider=${provider}`}`);
});
