import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { post: apiPost },
}));

const { register, submitReauth } = await import('./auth');

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
});
