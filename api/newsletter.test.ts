import axios, { AxiosError } from 'axios';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { subscribeToNewsletter } from './newsletter';

vi.mock('@/store/auth', () => ({
  useAuthStore: {
    getState: () => ({ token: null, isAuthenticated: false }),
    setState: vi.fn(),
  },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { api.defaults.adapter = originalAdapter; });

describe('newsletter API', () => {
  it('posts anonymous JSON through the existing v1 client and returns the contract', async () => {
    const response = { success: true as const, message: 'Preference saved' };
    const adapter = vi.fn(async (config) => ({
      config, data: response, status: 200, statusText: 'OK', headers: {},
    }));
    api.defaults.adapter = adapter;

    await expect(subscribeToNewsletter({ email: 'reader@example.com' })).resolves.toEqual(response);
    const config = adapter.mock.calls[0][0];
    expect(config.baseURL).toMatch(/\/api\/v1$/);
    expect(config.url).toBe('/newsletter-subscribe');
    expect(config.method).toBe('post');
    expect(JSON.parse(config.data)).toEqual({ email: 'reader@example.com' });
    expect(config.headers.get('Content-Type')).toBe('application/json');
    expect(config.headers.get('Authorization')).toBeUndefined();
    expect(config.timeout).toBe(15_000);
  });

  it('supports the optional backend name without requiring it', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, message: 'Saved' } });
    await subscribeToNewsletter({ email: 'reader@example.com', name: 'Reader' });
    expect(post).toHaveBeenCalledWith('/newsletter-subscribe', { email: 'reader@example.com', name: 'Reader' }, { timeout: 15_000 });
  });

  it.each([null, {}, { success: false, message: 'Failed' }, { success: true }])(
    'rejects an unconfirmed persistence response %j', async (data) => {
      vi.spyOn(api, 'post').mockResolvedValue({ data });
      await expect(subscribeToNewsletter({ email: 'reader@example.com' })).rejects.toThrow('not confirmed');
    },
  );

  it.each([401, 422, 429, 503])('surfaces HTTP %s without an auth refresh or automatic duplicate POST', async (status) => {
    const refresh = vi.spyOn(axios, 'post');
    const adapter = vi.fn(async (config) => {
      throw new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, {
        config, data: {}, headers: {}, status, statusText: 'Error',
      });
    });
    api.defaults.adapter = adapter;
    await expect(subscribeToNewsletter({ email: 'reader@example.com' })).rejects.toMatchObject({ response: { status } });
    expect(adapter).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });
});
