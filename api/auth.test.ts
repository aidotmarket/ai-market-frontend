import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { post: apiPost },
}));

const { register, requestMagicLink, verifyReauthMagicLink } = await import('./auth');

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

it('exchanges a legacy reauthentication magic link', async () => {
  apiPost.mockResolvedValueOnce({ data: { token: 'magic-reauth-token', method: 'magic_link' } });
  await expect(verifyReauthMagicLink('email-token')).resolves.toMatchObject({ token: 'magic-reauth-token' });
  expect(apiPost).toHaveBeenCalledWith('/auth/magic-link/verify', { token: 'email-token' });
});
