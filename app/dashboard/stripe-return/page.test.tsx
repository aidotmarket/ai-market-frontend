// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const ready = { details_submitted: true, charges_enabled: true, payouts_enabled: true };
const pending = { details_submitted: false, requirements: { currently_due: [], pending_verification: ['document'] } };
const confirmationMessage = "We couldn't confirm with Stripe yet. Your details are saved; check again in a few minutes.";

async function advance(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function expectNoStripeRedirect() {
  expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
  expect(connectApi.redirectToConnectOnboarding).not.toHaveBeenCalled();
}

describe('Stripe return', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    navigation.searchParams = new URLSearchParams();
    connectApi.getConnectOnboarding.mockResolvedValue({ data: onboardingData });
    connectApi.getConnectStatus.mockResolvedValue({ data: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe.each(['', 'abandoned=1', 'abandoned=true'])('return URL ?%s', (query) => {
    beforeEach(() => { navigation.searchParams = new URLSearchParams(query); });

    it('shows progress while pending, then succeeds and returns to the dashboard', async () => {
      connectApi.getConnectStatus.mockResolvedValueOnce({ data: pending }).mockResolvedValue({ data: ready });
      render(<StrictMode><StripeReturnPage /></StrictMode>);
      expect(screen.getByRole('progressbar')).not.toBeNull();
      expect(screen.getByText('Confirming your details with Stripe…')).not.toBeNull();
      await advance();
      expect(screen.getByRole('progressbar')).not.toBeNull();
      expectNoStripeRedirect();
      await advance(2000);
      expect(screen.getByText('Successfully Connected!')).not.toBeNull();
      expect(navigation.router.push).not.toHaveBeenCalled();
      await advance(3000);
      expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith('/dashboard');
      expectNoStripeRedirect();
    });

    it('stops after three failed reads and checks again without minting', async () => {
      connectApi.getConnectStatus.mockRejectedValue(new Error('unavailable'));
      render(<StrictMode><StripeReturnPage /></StrictMode>);
      await advance(4000);
      expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(3);
      expect(screen.getByText(confirmationMessage)).not.toBeNull();
      expect(screen.getByRole('link', { name: 'Return to Dashboard' }).getAttribute('href')).toBe('/dashboard');
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
      expectNoStripeRedirect();
      connectApi.getConnectStatus.mockResolvedValue({ data: ready });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check again' })); });
      expect(screen.getByText('Successfully Connected!')).not.toBeNull();
      expectNoStripeRedirect();
    });

    it.each([null, {}])('bounds inconclusive status %j to 15 polls', async (data) => {
      connectApi.getConnectStatus.mockResolvedValue({ data });
      render(<StripeReturnPage />);
      await advance(30000);
      expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(15);
      expect(screen.getByText(confirmationMessage)).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
      expectNoStripeRedirect();
      await advance(30000);
      expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(15);
    });

    it.each([
      { details_submitted: false },
      { details_submitted: true, requirements: { currently_due: ['external_account'] } },
      { requirements: { currently_due: ['external_account'], pending_verification: ['document'] } },
    ])('offers setup only on click for confirmed missing details %j', async (data) => {
      connectApi.getConnectStatus.mockResolvedValue({ data });
      let resolveOnboarding!: (value: { data: typeof onboardingData }) => void;
      connectApi.getConnectOnboarding.mockReturnValue(new Promise((resolve) => { resolveOnboarding = resolve; }));
      const view = render(<StrictMode><StripeReturnPage /></StrictMode>);
      await advance();
      view.rerender(<StrictMode><StripeReturnPage /></StrictMode>);
      await advance(30000);
      expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
      expectNoStripeRedirect();
      expect(navigation.router.push).not.toHaveBeenCalled();
      const button = screen.getByRole('button', { name: 'Continue Stripe setup' });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(connectApi.getConnectOnboarding).toHaveBeenCalledOnce();
      await act(async () => { resolveOnboarding({ data: onboardingData }); });
      expect(connectApi.redirectToConnectOnboarding).toHaveBeenCalledExactlyOnceWith(onboardingData);
    });

    it('keeps pending verification as a non-error outcome and can recheck', async () => {
      connectApi.getConnectStatus.mockResolvedValue({ data: pending });
      render(<StripeReturnPage />);
      await advance(30000);
      expect(screen.getByText('Verification Pending')).not.toBeNull();
      expect(screen.getByText('Stripe is reviewing your details; this can take a few minutes.')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
      expectNoStripeRedirect();
      connectApi.getConnectStatus.mockResolvedValue({ data: ready });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry check' })); });
      expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    });

    it('times out a hung read and ignores its late result', async () => {
      let resolveStatus!: (value: { data: typeof ready }) => void;
      connectApi.getConnectStatus.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
      render(<StrictMode><StripeReturnPage /></StrictMode>);
      await advance(30000);
      expect(screen.getByText(confirmationMessage)).not.toBeNull();
      await act(async () => { resolveStatus({ data: ready }); });
      await advance(3000);
      expect(screen.getByText(confirmationMessage)).not.toBeNull();
      expect(navigation.router.push).not.toHaveBeenCalled();
      expectNoStripeRedirect();
    });
  });

  it('starts a fresh read on Check again even if the previous read is still hung', async () => {
    let resolveOld!: (value: { data: { details_submitted: boolean } }) => void;
    connectApi.getConnectStatus.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<StripeReturnPage />);
    await advance(30000);
    connectApi.getConnectStatus.mockResolvedValue({ data: ready });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check again' })); });
    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    await act(async () => { resolveOld({ data: { details_submitted: false } }); });
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    expectNoStripeRedirect();
  });

  it('preserves 2FA guidance on a setup click and allows retry', async () => {
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: false } });
    const error = new Error('2FA required');
    connectApi.getConnectOnboarding.mockRejectedValueOnce(error);
    connectApi.isConnectOnboardingTwoFactorRequired.mockReturnValue(true);
    render(<StripeReturnPage />);
    await advance();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue Stripe setup' })); });
    expect(connectApi.isConnectOnboardingTwoFactorRequired).toHaveBeenCalledWith(error);
    expect(toast).toHaveBeenCalledWith('Complete the sign-in security step before connecting payouts. Refresh seller setup if you already completed it.', 'info');
    expect(connectApi.redirectToConnectOnboarding).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue Stripe setup' })); });
    expect(connectApi.redirectToConnectOnboarding).toHaveBeenCalledExactlyOnceWith(onboardingData);
  });

  it('handles invalid onboarding URLs on click', async () => {
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: false } });
    connectApi.redirectToConnectOnboarding.mockImplementation(() => { throw new Error('Invalid Stripe onboarding URL'); });
    render(<StripeReturnPage />);
    await advance();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue Stripe setup' })); });
    expect(toast).toHaveBeenCalledWith('Failed to resume Stripe connection', 'error');
    expect(screen.getByRole('button', { name: 'Continue Stripe setup' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows review guidance on success while payments are not enabled', async () => {
    connectApi.getConnectStatus.mockResolvedValue({ data: { ...pending, details_submitted: true } });
    render(<StripeReturnPage />);
    await advance();
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    expect(screen.getByText('Stripe is reviewing your details; this can take a few minutes.')).not.toBeNull();
    expectNoStripeRedirect();
  });

  it('cleans up polling and ignores results after unmount', async () => {
    const view = render(<StripeReturnPage />);
    await advance();
    view.unmount();
    await advance(30000);
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expectNoStripeRedirect();
  });
});
