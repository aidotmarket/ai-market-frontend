import axios, {
  AxiosError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let setAuthState: ReturnType<typeof vi.fn>;
let isAuthenticated: boolean;

function makeResponseError(status: number, retryAfter?: string): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const headers = retryAfter === undefined ? {} : { 'retry-after': retryAfter };

  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, undefined, {
    config,
    data: {},
    headers,
    status,
    statusText: `HTTP ${status}`,
  });
}

function makeOnboardingForbiddenAdapter(): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, {
      config,
      data: { detail: { onboarding_url: '/dashboard' } },
      headers: {},
      status: 403,
      statusText: 'Forbidden',
    });
  };
}

function makeUnauthorizedAdapter(): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
      config,
      data: {},
      headers: {},
      status: 401,
      statusText: 'Unauthorized',
    });
  };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  setAuthState = vi.fn();
  isAuthenticated = true;
  vi.doMock('@/store/auth', () => ({
    useAuthStore: {
      getState: () => ({ token: 'existing-token', isAuthenticated }),
      setState: setAuthState,
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('refreshAccessToken', () => {
  it('waits for Retry-After delta-seconds without retrying early', async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(makeResponseError(429, '5'))
      .mockResolvedValueOnce({ data: { access_token: 'new-token' } });
    const { refreshAccessToken } = await import('./client');

    const refresh = refreshAccessToken();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(post).toHaveBeenCalledOnce();
    expect(setAuthState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(refresh).resolves.toBe('new-token');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('parses Retry-After HTTP-date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
    const retryAt = new Date('2026-07-13T12:00:05Z').toUTCString();
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(makeResponseError(429, retryAt))
      .mockResolvedValueOnce({ data: { access_token: 'new-token' } });
    const { refreshAccessToken } = await import('./client');
    const parseDate = vi.spyOn(Date, 'parse');

    const refresh = refreshAccessToken();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(post).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(refresh).resolves.toBe('new-token');
    expect(post).toHaveBeenCalledTimes(2);
    expect(parseDate).toHaveBeenCalledWith(retryAt);
  });

  it.each([
    ['invalid', 'not-a-retry-date'],
    ['fractional numeric', '1.5'],
    ['negative numeric', '-1'],
    ['explicitly positive numeric', '+1'],
    ['missing', undefined],
  ])('falls back to 60 seconds for %s Retry-After', async (_label, retryAfter) => {
    vi.useFakeTimers();
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(makeResponseError(429, retryAfter))
      .mockResolvedValueOnce({ data: { access_token: 'new-token' } });
    const { refreshAccessToken } = await import('./client');
    const parseDate = vi.spyOn(Date, 'parse');

    const refresh = refreshAccessToken();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(post).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(refresh).resolves.toBe('new-token');
    expect(post).toHaveBeenCalledTimes(2);
    expect(parseDate).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', '0', 1_000],
    ['above maximum', '90', 60_000],
  ])('clamps %s Retry-After to the supported bound', async (_label, retryAfter, delayMs) => {
    vi.useFakeTimers();
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(makeResponseError(429, retryAfter))
      .mockResolvedValueOnce({ data: { access_token: 'new-token' } });
    const { refreshAccessToken } = await import('./client');

    const refresh = refreshAccessToken();
    await vi.advanceTimersByTimeAsync(delayMs - 1);
    expect(post).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(refresh).resolves.toBe('new-token');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('keeps concurrent callers on one single-flight through the wait and retry', async () => {
    vi.useFakeTimers();
    let resolveRetry!: (value: { data: { access_token: string } }) => void;
    const retryResponse = new Promise<{ data: { access_token: string } }>((resolve) => {
      resolveRetry = resolve;
    });
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(makeResponseError(429, '1'))
      .mockReturnValueOnce(retryResponse as never);
    const { refreshAccessToken } = await import('./client');

    const first = refreshAccessToken();
    const duringWait = refreshAccessToken();
    expect(duringWait).toBe(first);

    await vi.advanceTimersByTimeAsync(1_000);
    const duringRetry = refreshAccessToken();
    expect(duringRetry).toBe(first);
    expect(post).toHaveBeenCalledTimes(2);

    resolveRetry({ data: { access_token: 'new-token' } });
    await expect(Promise.all([first, duringWait, duringRetry])).resolves.toEqual([
      'new-token',
      'new-token',
      'new-token',
    ]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('retries exactly once and treats a second 429 as transient', async () => {
    vi.useFakeTimers();
    const secondRateLimit = makeResponseError(429, '1');
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(makeResponseError(429, '1'))
      .mockRejectedValueOnce(secondRateLimit);
    vi.stubGlobal('window', { location: { pathname: '/dashboard', href: '/dashboard' } });
    const { refreshAccessToken } = await import('./client');

    const refresh = refreshAccessToken();
    const rejection = expect(refresh).rejects.toBe(secondRateLimit);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(post).toHaveBeenCalledTimes(2);
    expect(setAuthState).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/dashboard');
  });

  it.each([401, 403])('clears auth and redirects for terminal refresh %s', async (status) => {
    const terminalError = makeResponseError(status);
    vi.spyOn(axios, 'post').mockRejectedValueOnce(terminalError);
    vi.stubGlobal('window', { location: { pathname: '/dashboard', href: '/dashboard' } });
    const { refreshAccessToken } = await import('./client');

    await expect(refreshAccessToken()).rejects.toBe(terminalError);

    expect(setAuthState).toHaveBeenCalledOnce();
    expect(setAuthState).toHaveBeenCalledWith({
      user: null,
      token: null,
      isAuthenticated: false,
      pendingTwoFactor: null,
    });
    expect(window.location.href).toBe('/login');
  });

  it('clears auth without redirecting an anonymous visitor after a terminal 401', async () => {
    isAuthenticated = false;
    const terminalError = makeResponseError(401);
    vi.spyOn(axios, 'post').mockRejectedValueOnce(terminalError);
    vi.stubGlobal('window', { location: { pathname: '/listings', href: '/listings' } });
    const { refreshAccessToken } = await import('./client');

    await expect(refreshAccessToken()).rejects.toBe(terminalError);

    expect(setAuthState).toHaveBeenCalledOnce();
    expect(setAuthState).toHaveBeenCalledWith({
      user: null,
      token: null,
      isAuthenticated: false,
      pendingTwoFactor: null,
    });
    expect(window.location.href).toBe('/listings');
  });

  it.each([
    ['network failure', new AxiosError('offline', 'ERR_NETWORK')],
    ['server failure', makeResponseError(503)],
  ])('preserves auth for transient %s', async (_label, transientError) => {
    vi.spyOn(axios, 'post').mockRejectedValueOnce(transientError);
    vi.stubGlobal('window', { location: { pathname: '/dashboard', href: '/dashboard' } });
    const { refreshAccessToken } = await import('./client');

    await expect(refreshAccessToken()).rejects.toBe(transientError);

    expect(setAuthState).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/dashboard');
  });
});

describe('api client response handling', () => {
  it('rejects the transient refresh error without redirecting', async () => {
    const refreshError = new AxiosError('offline', 'ERR_NETWORK');
    vi.spyOn(axios, 'post').mockRejectedValueOnce(refreshError);
    vi.stubGlobal('window', { location: { pathname: '/dashboard', href: '/dashboard' } });
    const { api } = await import('./client');

    await expect(
      api.get('/protected', { adapter: makeUnauthorizedAdapter() })
    ).rejects.toBe(refreshError);

    expect(setAuthState).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/dashboard');
  });

  it('does not redirect 403 onboarding responses when the request opts out', async () => {
    vi.stubGlobal('window', { location: { pathname: '/find-data', href: '/find-data' } });
    const { api } = await import('./client');

    await expect(
      api.get('/restricted', {
        adapter: makeOnboardingForbiddenAdapter(),
        skipOnboardingRedirect: true,
      })
    ).rejects.toMatchObject({ response: { status: 403 } });

    expect(window.location.href).toBe('/find-data');
  });

  it('still redirects 403 onboarding responses when the request does not opt out', async () => {
    vi.stubGlobal('window', { location: { pathname: '/find-data', href: '/find-data' } });
    const { api } = await import('./client');

    await expect(
      api.get('/restricted', {
        adapter: makeOnboardingForbiddenAdapter(),
      })
    ).rejects.toMatchObject({ response: { status: 403 } });

    expect(window.location.href).toBe('/dashboard');
  });
});
