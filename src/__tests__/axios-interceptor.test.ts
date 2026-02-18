import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosRequestConfig } from 'axios';

// Keep a handle on the real axios so we can spy on .post for refresh calls
const mockPost = vi.fn();
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    default: {
      ...actual.default,
      create: actual.default.create,
      post: mockPost,
      AxiosHeaders: actual.default.AxiosHeaders,
    },
  };
});

async function freshClient() {
  vi.resetModules();
  // Re-mock axios after resetModules
  vi.doMock('axios', async () => {
    const actual = await vi.importActual<typeof import('axios')>('axios');
    return {
      ...actual,
      default: {
        ...actual.default,
        create: actual.default.create,
        post: mockPost,
        AxiosHeaders: actual.default.AxiosHeaders,
      },
    };
  });
  const { api } = await import('@/api/client');
  return api;
}

describe('Axios Interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should attach Authorization header when token exists', async () => {
    localStorage.setItem('token', 'my-token');
    const api = await freshClient();

    const handler = api.interceptors.request.handlers[0];
    const { default: axios } = await import('axios');
    const config = { headers: new axios.AxiosHeaders() } as AxiosRequestConfig;
    const result = handler.fulfilled!(config as Parameters<typeof handler.fulfilled>[0]);
    expect(result.headers.Authorization).toBe('Bearer my-token');
  });

  it('should not attach Authorization header when no token', async () => {
    const api = await freshClient();

    const handler = api.interceptors.request.handlers[0];
    const { default: axios } = await import('axios');
    const config = { headers: new axios.AxiosHeaders() } as AxiosRequestConfig;
    const result = handler.fulfilled!(config as Parameters<typeof handler.fulfilled>[0]);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('M1 single-flight: 3 concurrent 401s trigger exactly one refresh', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refresh_token', 'valid-refresh');

    const api = await freshClient();

    // Mock refresh endpoint — return new tokens
    mockPost.mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });

    // Track how many times the adapter is called and what tokens retries carry
    let call = 0;
    const retryTokens: string[] = [];

    api.defaults.adapter = async (config: AxiosRequestConfig) => {
      call++;
      const auth = config.headers?.Authorization as string | undefined;

      // First 3 calls: return 401 (simulates expired token)
      if (call <= 3) {
        const error = {
          config,
          response: { status: 401, data: {} },
          isAxiosError: true,
          message: 'Unauthorized',
        };
        throw error;
      }

      // Retry calls: record the token and succeed
      if (auth) retryTokens.push(auth);
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };

    // Fire 3 concurrent requests
    const results = await Promise.all([
      api.get('/resource/1'),
      api.get('/resource/2'),
      api.get('/resource/3'),
    ]);

    // All 3 should have resolved successfully after retry
    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.data).toEqual({ ok: true }));

    // Refresh was called exactly ONCE (single-flight)
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][1]).toEqual({ refresh_token: 'valid-refresh' });

    // All 3 retries used the new token
    expect(retryTokens).toHaveLength(3);
    retryTokens.forEach((t) => expect(t).toBe('Bearer new-access'));
  });

  it('M2 rotation: new refresh_token from server is persisted to localStorage', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refresh_token', 'old-refresh');

    const api = await freshClient();

    // Mock refresh endpoint returns a rotated refresh_token
    mockPost.mockResolvedValue({
      data: { access_token: 'fresh-access', refresh_token: 'rotated-refresh' },
    });

    let call = 0;
    api.defaults.adapter = async (config: AxiosRequestConfig) => {
      call++;
      if (call === 1) {
        throw {
          config,
          response: { status: 401, data: {} },
          isAxiosError: true,
          message: 'Unauthorized',
        };
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };

    await api.get('/protected');

    // access_token persisted
    expect(localStorage.getItem('token')).toBe('fresh-access');
    // rotated refresh_token persisted
    expect(localStorage.getItem('refresh_token')).toBe('rotated-refresh');
  });

  it('should clear auth on refresh failure', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('refresh_token', 'bad-refresh');
    localStorage.setItem('user', '{"id":"1"}');

    const api = await freshClient();

    // Mock refresh to fail
    mockPost.mockRejectedValue(new Error('refresh failed'));

    // Stub location.href to prevent jsdom navigation error
    const hrefSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    } as unknown as Location);

    let call = 0;
    api.defaults.adapter = async (config: AxiosRequestConfig) => {
      call++;
      if (call === 1) {
        throw {
          config,
          response: { status: 401, data: {} },
          isAxiosError: true,
          message: 'Unauthorized',
        };
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await expect(api.get('/anything')).rejects.toThrow();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();

    hrefSpy.mockRestore();
  });
});
