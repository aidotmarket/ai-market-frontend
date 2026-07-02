import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import {
  isConnectOnboardingTwoFactorRequired,
  redirectToConnectOnboarding,
} from './connect';

function makeAxiosError(status: number, detail: string) {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    data: { detail },
    status,
    statusText: 'Forbidden',
    headers: {},
    config: { headers: {} as any },
  });
}

describe('Stripe Connect onboarding redirect', () => {
  it('redirects to hosted onboarding_url responses', () => {
    const setHref = vi.fn();

    redirectToConnectOnboarding(
      { onboarding_url: 'https://connect.stripe.com/setup/s/acct_123' },
      setHref,
    );

    expect(setHref).toHaveBeenCalledWith('https://connect.stripe.com/setup/s/acct_123');
  });

  it('redirects to legacy url responses', () => {
    const setHref = vi.fn();

    redirectToConnectOnboarding(
      { url: 'https://connect.stripe.com/setup/s/acct_legacy' },
      setHref,
    );

    expect(setHref).toHaveBeenCalledWith('https://connect.stripe.com/setup/s/acct_legacy');
  });

  it('rejects missing and invalid onboarding URLs', () => {
    expect(() => redirectToConnectOnboarding({}, vi.fn())).toThrow(
      'Invalid Stripe onboarding URL',
    );
    expect(() =>
      redirectToConnectOnboarding(
        { onboarding_url: 'https://dashboard.stripe.com/acct_123' },
        vi.fn(),
      ),
    ).toThrow('Invalid Stripe onboarding URL');
  });

  it('identifies the 403 2FA detail used for the info toast branch', () => {
    const toast = vi.fn();
    const err = makeAxiosError(403, 'Complete 2FA setup before connecting Stripe');

    if (isConnectOnboardingTwoFactorRequired(err)) {
      toast('Complete 2FA setup before connecting payouts.', 'info');
    }

    expect(toast).toHaveBeenCalledWith(
      'Complete 2FA setup before connecting payouts.',
      'info',
    );
  });

  it('does not classify other 403 responses as 2FA-required', () => {
    expect(isConnectOnboardingTwoFactorRequired(makeAxiosError(403, 'Forbidden'))).toBe(false);
  });
});
