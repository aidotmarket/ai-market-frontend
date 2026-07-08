import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('api client onboarding redirect handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.doMock('@/store/auth', () => ({
      useAuthStore: {
        getState: () => ({ token: null }),
        setState: vi.fn(),
      },
    }));
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
