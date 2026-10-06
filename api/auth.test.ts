import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { post: apiPost },
}));

const { register, requestMagicLink, submitReauth, verifyReauthMagicLink, setup2FA, verify2FASetup } = await import('./auth');

describe('magic link purpose', () => {
  beforeEach(() => apiPost.mockReset());
  it.each([undefined, 'login', 'register'] as const)('sends the exact purpose for %s', async (purpose) => {
    apiPost.mockResolvedValue({ data: { message: 'Request accepted' } });
    await requestMagicLink('new-customer@example.test', purpose);
    expect(apiPost).toHaveBeenCalledExactlyOnceWith('/auth/magic-link/request', {
      email: 'new-customer@example.test', purpose: purpose ?? 'login',
    });
  });
});

describe('auth register API', () => {
  beforeEach(() => {
    apiPost.mockReset();
  });

  it('defaults registrations to buyer while preserving the backend payload shape', async () => {
    apiPost.mockResolvedValue({ data: { id: 'user-1' } });

    await register({
      email: 'buyer@example.com',
      password: 'password123',
      first_name: 'Buyer',
      last_name: 'User',
    });

    expect(apiPost).toHaveBeenCalledWith('/auth/register', {
      email: 'buyer@example.com',
      password: 'password123',
      first_name: 'Buyer',
      last_name: 'User',
      role: 'buyer',
    });
  });
});

describe('auth 2FA setup API', () => {
  beforeEach(() => apiPost.mockReset());

  it('sends the reauthentication token to both setup endpoints', async () => {
    apiPost.mockResolvedValueOnce({ data: { secret: 'secret', qr_uri: 'uri', expires_in: 600 } });
    apiPost.mockResolvedValueOnce({ data: { backup_codes: ['backup-one'] } });

    await setup2FA('reauth-token');
    await verify2FASetup('123456', 'reauth-token');

    expect(apiPost).toHaveBeenNthCalledWith(1, '/auth/2fa/setup', {
      reauth_token: 'reauth-token',
    });
    expect(apiPost).toHaveBeenNthCalledWith(2, '/auth/2fa/verify-setup', {
      code: '123456',
      reauth_token: 'reauth-token',
    });
  });
});

describe('auth reauthentication API', () => {
  beforeEach(() => {
    apiPost.mockReset();
  });

  it('uses the deployed /auth/reauth contract and preserves its token field', async () => {
    apiPost.mockResolvedValue({
      data: {
        token: 'backend-reauth-token',
        expires_in: 60,
        token_type: 'reauth',
        message: null,
        method: 'totp',
      },
    });

    await expect(submitReauth('123456')).resolves.toEqual({
      token: 'backend-reauth-token',
      expires_in: 60,
      token_type: 'reauth',
      message: null,
      method: 'totp',
    });
    expect(apiPost).toHaveBeenCalledWith('/auth/reauth', { code: '123456' });
  });

  it('sends a password for an account that has not enabled 2FA', async () => {
    apiPost.mockResolvedValue({ data: { token: 'password-reauth-token' } });
    await submitReauth('password with spaces', 'password');
    expect(apiPost).toHaveBeenCalledWith('/auth/reauth', {
      method: 'password', password: 'password with spaces',
    });
  });

  it('requests a magic link and exchanges its token for reauthentication', async () => {
    apiPost.mockResolvedValueOnce({ data: { token: null, method: 'magic_link', message: 'Re-authentication link sent' } });
    apiPost.mockResolvedValueOnce({ data: { token: 'magic-reauth-token', method: 'magic_link' } });
    await expect(submitReauth('', 'magic_link')).resolves.toMatchObject({ token: null, method: 'magic_link' });
    await expect(verifyReauthMagicLink('email-token')).resolves.toMatchObject({ token: 'magic-reauth-token' });
    expect(apiPost).toHaveBeenNthCalledWith(1, '/auth/reauth', { method: 'magic_link' });
    expect(apiPost).toHaveBeenNthCalledWith(2, '/auth/magic-link/verify', { token: 'email-token' });
  });
});
