import { AxiosError } from 'axios';
import { api } from './client';

export const STRIPE_CONNECT_URL_PREFIX = 'https://connect.stripe.com/';

export const getConnectOnboarding = () => api.post('/connect/onboarding');
export const getConnectStatus = () => api.get('/connect/status');
export const getConnectLoginLink = () => api.post('/connect/login-link');

export function getConnectOnboardingRedirectUrl(data: unknown) {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const response = data as { onboarding_url?: unknown; url?: unknown };
  return response.onboarding_url ?? response.url;
}

export function redirectToConnectOnboarding(
  data: unknown,
  setHref: (url: string) => void = (url) => {
    window.location.href = url;
  },
) {
  const url = getConnectOnboardingRedirectUrl(data);
  if (url && typeof url === 'string' && url.startsWith(STRIPE_CONNECT_URL_PREFIX)) {
    setHref(url);
    return;
  }

  throw new Error('Invalid Stripe onboarding URL');
}

export function isConnectOnboardingTwoFactorRequired(err: unknown) {
  return (
    err instanceof AxiosError &&
    err.response?.status === 403 &&
    err.response?.data?.detail === 'Complete 2FA setup before connecting Stripe'
  );
}
