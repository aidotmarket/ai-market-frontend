import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { post: apiPost },
}));

const { register } = await import('./auth');

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
