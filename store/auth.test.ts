import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types';

const authApi = vi.hoisted(() => ({
  login: vi.fn(),
  magicLinkVerify: vi.fn(),
  oauthCallback: vi.fn(),
  verify2FALogin: vi.fn(),
  getMe: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  isTwoFactorChallenge: vi.fn((res: { requires_2fa?: boolean }) => res.requires_2fa === true),
}));

const clientApi = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('@/api/auth', () => authApi);
vi.mock('@/api/client', () => clientApi);

const { useAuthStore } = await import('./auth');

const user: User = {
  id: 'user-1',
  email: 'buyer@example.com',
  first_name: 'Buyer',
  last_name: null,
  company_name: null,
  role: 'buyer',
  status: 'active',
  created_at: '2026-06-17T00:00:00Z',
  email_verified_at: '2026-06-17T00:00:00Z',
  totp_enabled: true,
  auth_methods: ['password'],
  primary_auth: 'password',
};

describe('auth store login-time 2FA', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.values(authApi).forEach((mock: ReturnType<typeof vi.fn>) => mock.mockClear());
    Object.values(clientApi).forEach((mock: ReturnType<typeof vi.fn>) => mock.mockClear());
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      hydrated: false,
      pendingTwoFactor: null,
    });
    authApi.getMe.mockResolvedValue(user);
    clientApi.refreshAccessToken.mockResolvedValue('access-token');
  });

  it('detects a challenge, stores only pending 2FA state, and withholds auth', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00Z'));
    authApi.login.mockResolvedValue({
      pre_auth_token: 'pre-auth-secret',
      requires_2fa: true,
      expires_in: 300,
    });

    const result = await useAuthStore.getState().login('buyer@example.com', 'password');

    expect(result).toEqual({ requiresTwoFactor: true });
    expect(useAuthStore.getState().pendingTwoFactor).toEqual({
      preAuthToken: 'pre-auth-secret',
      expiresAt: Date.parse('2026-06-17T12:05:00Z'),
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
    expect(authApi.getMe).not.toHaveBeenCalled();
  });

  it('completes the same session path after successful 2FA verification', async () => {
    authApi.verify2FALogin.mockResolvedValue({ access_token: 'access-token', token_type: 'bearer' });
    useAuthStore.setState({
      pendingTwoFactor: { preAuthToken: 'pre-auth-secret', expiresAt: Date.now() + 300_000 },
    });

    const result = await useAuthStore.getState().verifyTwoFactor('123456');

    expect(result).toEqual({ ok: true });
    expect(authApi.verify2FALogin).toHaveBeenCalledWith('pre-auth-secret', '123456');
    expect(useAuthStore.getState().pendingTwoFactor).toBeNull();
    expect(useAuthStore.getState().token).toBe('access-token');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('keeps the challenge open and returns an inline-error reason on 400', async () => {
    authApi.verify2FALogin.mockRejectedValue({ response: { status: 400 } });
    useAuthStore.setState({
      pendingTwoFactor: { preAuthToken: 'pre-auth-secret', expiresAt: Date.now() + 300_000 },
    });

    const result = await useAuthStore.getState().verifyTwoFactor('bad-code');

    expect(result).toEqual({ ok: false, reason: 'invalid_code' });
    expect(useAuthStore.getState().pendingTwoFactor).toEqual({
      preAuthToken: 'pre-auth-secret',
      expiresAt: expect.any(Number),
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('clears the challenge and signals return to login on 401', async () => {
    authApi.verify2FALogin.mockRejectedValue({ response: { status: 401 } });
    useAuthStore.setState({
      pendingTwoFactor: { preAuthToken: 'pre-auth-secret', expiresAt: Date.now() + 300_000 },
    });

    const result = await useAuthStore.getState().verifyTwoFactor('123456');

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(useAuthStore.getState().pendingTwoFactor).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('uses completeSession parity for magic link and OAuth token responses', async () => {
    authApi.magicLinkVerify.mockResolvedValue({ access_token: 'magic-token', token_type: 'bearer' });
    authApi.oauthCallback.mockResolvedValue({ access_token: 'oauth-token', token_type: 'bearer' });

    await useAuthStore.getState().magicLinkVerify('magic-link-token');
    expect(useAuthStore.getState().token).toBe('magic-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    await useAuthStore.getState().oauthLogin('github', 'code', 'state', 'nonce');
    expect(useAuthStore.getState().token).toBe('oauth-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('marks hydrate complete after successful refresh and user load', async () => {
    await useAuthStore.getState().hydrate();

    expect(clientApi.refreshAccessToken).toHaveBeenCalledOnce();
    expect(authApi.getMe).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().hydrated).toBe(true);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it('marks hydrate complete after failed refresh', async () => {
    clientApi.refreshAccessToken.mockRejectedValue(new Error('no session'));

    await useAuthStore.getState().hydrate();

    expect(clientApi.refreshAccessToken).toHaveBeenCalledOnce();
    expect(authApi.getMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().hydrated).toBe(true);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('does not persist or log the pre-auth token or submitted code', async () => {
    const setItem = vi.fn();
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('sessionStorage', { setItem });
    authApi.login.mockResolvedValue({
      pre_auth_token: 'pre-auth-secret',
      requires_2fa: true,
      expires_in: 300,
    });
    authApi.verify2FALogin.mockRejectedValue({ response: { status: 400 } });

    await useAuthStore.getState().login('buyer@example.com', 'password');
    await useAuthStore.getState().verifyTwoFactor('secret-code');

    expect(setItem).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
