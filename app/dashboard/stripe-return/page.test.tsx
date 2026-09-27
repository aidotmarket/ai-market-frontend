// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StripeReturnPage from './page';

const connectApi = vi.hoisted(() => ({
  getConnectStatus: vi.fn(),
  getConnectOnboarding: vi.fn(),
  isConnectOnboardingTwoFactorRequired: vi.fn(),
  redirectToConnectOnboarding: vi.fn(),
}));
const navigation = vi.hoisted(() => ({
  router: { push: vi.fn() },
  searchParams: new URLSearchParams(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/api/connect', () => connectApi);
vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  useSearchParams: () => navigation.searchParams,
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast }) }));

const onboardingData = { onboarding_url: 'https://connect.stripe.com/setup/test' };

describe('Stripe return', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigation.searchParams = new URLSearchParams();
    connectApi.getConnectOnboarding.mockResolvedValue({ data: onboardingData });
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: false } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(['abandoned=1', 'abandoned=true'])(
    'checks status then mints once for %s, including Strict Mode and re-renders',
    async (query) => {
      navigation.searchParams = new URLSearchParams(query);
      let resolveOnboarding!: (value: { data: typeof onboardingData }) => void;
      connectApi.getConnectOnboarding.mockReturnValue(new Promise((resolve) => {
        resolveOnboarding = resolve;
      }));
      const view = render(<StrictMode><StripeReturnPage /></StrictMode>);
      expect(screen.getByText('Returning you to Stripe...')).not.toBeNull();
      navigation.searchParams = new URLSearchParams(query);
      view.rerender(<StrictMode><StripeReturnPage /></StrictMode>);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { resolveOnboarding({ data: onboardingData }); });

      expect(connectApi.getConnectOnboarding).toHaveBeenCalledOnce();
      expect(connectApi.redirectToConnectOnboarding).toHaveBeenCalledExactlyOnceWith(onboardingData);
      expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    },
  );

  it('mints a fresh link on re-entry after a settled Strict Mode refresh', async () => {
    navigation.searchParams = new URLSearchParams('abandoned=1');
    const firstData = { onboarding_url: 'https://connect.stripe.com/setup/first' };
    const secondData = { onboarding_url: 'https://connect.stripe.com/setup/second' };
    connectApi.getConnectOnboarding
      .mockResolvedValueOnce({ data: firstData })
      .mockResolvedValueOnce({ data: secondData });
    const view = render(<StrictMode><StripeReturnPage /></StrictMode>);
    await waitFor(() => expect(connectApi.redirectToConnectOnboarding).toHaveBeenCalledExactlyOnceWith(firstData));
    expect(connectApi.getConnectOnboarding).toHaveBeenCalledOnce();

    navigation.searchParams = new URLSearchParams();
    await act(async () => { view.rerender(<StrictMode><StripeReturnPage /></StrictMode>); });
    navigation.searchParams = new URLSearchParams('abandoned=1');
    await act(async () => { view.rerender(<StrictMode><StripeReturnPage /></StrictMode>); });

    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(3);
    expect(connectApi.getConnectOnboarding).toHaveBeenCalledTimes(2);
    expect(connectApi.redirectToConnectOnboarding.mock.calls).toEqual([[firstData], [secondData]]);
  });

  it('offers resume after 15 seconds and ignores a late refresh resolution', async () => {
    vi.useFakeTimers();
    navigation.searchParams = new URLSearchParams('abandoned=1');
    let resolveOnboarding!: (value: { data: typeof onboardingData }) => void;
    connectApi.getConnectOnboarding.mockReturnValue(new Promise((resolve) => {
      resolveOnboarding = resolve;
    }));
    render(<StrictMode><StripeReturnPage /></StrictMode>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(connectApi.getConnectOnboarding).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(14999); });
    expect(screen.getByText('Returning you to Stripe...')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('Setup Incomplete')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Resume Onboarding' }).hasAttribute('disabled')).toBe(false);

    await act(async () => { resolveOnboarding({ data: onboardingData }); });
    expect(connectApi.redirectToConnectOnboarding).not.toHaveBeenCalled();
    expect(screen.getByText('Setup Incomplete')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Resume Onboarding' })).not.toBeNull();
  });

  it('keeps the 15 second guard while the abandoned status check is pending', async () => {
    vi.useFakeTimers();
    navigation.searchParams = new URLSearchParams('abandoned=1');
    let resolveStatus!: (value: { data: { details_submitted: boolean } }) => void;
    connectApi.getConnectStatus.mockReturnValue(new Promise((resolve) => {
      resolveStatus = resolve;
    }));
    render(<StrictMode><StripeReturnPage /></StrictMode>);

    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText('Setup Incomplete')).not.toBeNull();
    await act(async () => { resolveStatus({ data: { details_submitted: false } }); });
    expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
    expect(connectApi.redirectToConnectOnboarding).not.toHaveBeenCalled();
  });

  it('falls back to Setup Incomplete after a failed refresh and lets the seller retry', async () => {
    navigation.searchParams = new URLSearchParams('abandoned=1');
    connectApi.getConnectOnboarding.mockRejectedValueOnce(new Error('unavailable'));
    render(<StrictMode><StripeReturnPage /></StrictMode>);

    expect(await screen.findByText('Setup Incomplete')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Return to Dashboard' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume Onboarding' }));
    await waitFor(() => expect(connectApi.redirectToConnectOnboarding).toHaveBeenCalledWith(onboardingData));
    expect(connectApi.getConnectOnboarding).toHaveBeenCalledTimes(2);
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
  });

  it('preserves the dashboard 2FA guidance on automatic and manual resume failures', async () => {
    navigation.searchParams = new URLSearchParams('abandoned=1');
    const error = new Error('2FA required');
    connectApi.getConnectOnboarding.mockRejectedValue(error);
    connectApi.isConnectOnboardingTwoFactorRequired.mockReturnValue(true);
    render(<StripeReturnPage />);

    expect(await screen.findByText('Setup Incomplete')).not.toBeNull();
    expect(connectApi.isConnectOnboardingTwoFactorRequired).toHaveBeenCalledWith(error);
    expect(toast).toHaveBeenCalledWith('Complete 2FA setup before connecting payouts.', 'info');
    fireEvent.click(screen.getByRole('button', { name: 'Resume Onboarding' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Resume Onboarding' }).hasAttribute('disabled')).toBe(false);
    expect(connectApi.redirectToConnectOnboarding).not.toHaveBeenCalled();
  });

  it('falls back if the onboarding redirect rejects its URL', async () => {
    navigation.searchParams = new URLSearchParams('abandoned=1');
    connectApi.redirectToConnectOnboarding.mockImplementation(() => { throw new Error('Invalid Stripe onboarding URL'); });
    render(<StripeReturnPage />);
    expect(await screen.findByText('Setup Incomplete')).not.toBeNull();
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
  });

  it('offers continued setup after all 15 polls report incomplete details', async () => {
    vi.useFakeTimers();
    render(<StripeReturnPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });

    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(15);
    expect(screen.getByText('Stripe setup not finished')).not.toBeNull();
    expect(screen.getByText("It looks like the Stripe form wasn't completed. You can pick up where you left off.")).not.toBeNull();
    expect(screen.queryByText('Verification Pending')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue Stripe setup' }));
    });
    expect(connectApi.redirectToConnectOnboarding).toHaveBeenCalledWith(onboardingData);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Dashboard' }));
    expect(navigation.router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows success and redirects when Stripe details have been submitted', async () => {
    vi.useFakeTimers();
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: true, charges_enabled: true, payouts_enabled: true } });
    render(<StripeReturnPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(navigation.router.push).toHaveBeenCalledWith('/dashboard');
    expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
  });

  it('does not mint a link on an abandoned return when details are submitted', async () => {
    vi.useFakeTimers();
    navigation.searchParams = new URLSearchParams('abandoned=1');
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: true, charges_enabled: true, payouts_enabled: true } });
    render(<StrictMode><StripeReturnPage /></StrictMode>);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith('/dashboard');
  });

  it('mints a link after an abandoned status check fails', async () => {
    navigation.searchParams = new URLSearchParams('abandoned=1');
    connectApi.getConnectStatus.mockRejectedValueOnce(new Error('status unavailable'));
    render(<StrictMode><StripeReturnPage /></StrictMode>);

    await waitFor(() => expect(connectApi.redirectToConnectOnboarding).toHaveBeenCalledExactlyOnceWith(onboardingData));
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    expect(connectApi.getConnectOnboarding).toHaveBeenCalledOnce();
  });

  it('shows review guidance on success while Stripe has not enabled payments', async () => {
    navigation.searchParams = new URLSearchParams('abandoned=1');
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: true, charges_enabled: false, payouts_enabled: false } });
    render(<StripeReturnPage />);

    expect(await screen.findByText('Successfully Connected!')).not.toBeNull();
    expect(screen.getByText('Stripe is reviewing your details; this can take a few minutes.')).not.toBeNull();
    expect(screen.queryByText('Your Stripe account is ready. Redirecting to dashboard...')).toBeNull();
    expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
  });

  it('shows review guidance at poll timeout and retries status without minting', async () => {
    vi.useFakeTimers();
    connectApi.getConnectStatus.mockResolvedValue({ data: {
      details_submitted: false,
      requirements: { currently_due: [], pending_verification: ['individual.verification.document'] },
    } });
    render(<StripeReturnPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });

    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(15);
    expect(screen.getByText('Verification Pending')).not.toBeNull();
    expect(screen.getByText('Stripe is reviewing your details; this can take a few minutes.')).not.toBeNull();
    expect(screen.queryByText("It looks like the Stripe form wasn't completed. You can pick up where you left off.")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: true, charges_enabled: false, payouts_enabled: false } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry check' })); });
    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(16);
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
  });
});
