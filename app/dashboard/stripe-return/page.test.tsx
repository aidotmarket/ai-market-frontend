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
const inconclusive = { details_submitted: false, requirements: { currently_due: [], pending_verification: [] } };
const actionable = { details_submitted: false, requirements: { currently_due: ['external_account'] } };
const pending = { details_submitted: false, requirements: { currently_due: [], pending_verification: ['document'] } };
const confirmationMessage = "We couldn't confirm with Stripe yet. Check again in a few minutes.";

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

    it('stops immediately when payouts have not been set up', async () => {
      connectApi.getConnectStatus.mockResolvedValue({ data: { status: 'not_connected' } });
      render(<StrictMode><StripeReturnPage /></StrictMode>);
      await advance();
      expect(screen.getByText("You haven't set up payouts yet")).not.toBeNull();
      expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
      expect(screen.getByRole('link', { name: 'Return to Dashboard' }).getAttribute('href')).toBe('/dashboard');
      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
      await advance(30000);
      expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
      expect(navigation.router.push).not.toHaveBeenCalled();
      expectNoStripeRedirect();
    });

    it('can check again from actionable requirements and reach success', async () => {
      connectApi.getConnectStatus.mockResolvedValueOnce({ data: actionable }).mockResolvedValue({ data: ready });
      render(<StrictMode><StripeReturnPage /></StrictMode>);
      await advance();
      expect(screen.getByText('Stripe needs more information')).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Continue Stripe setup' })).not.toBeNull();
      expect(screen.getByRole('link', { name: 'Return to Dashboard' }).getAttribute('href')).toBe('/dashboard');
      expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check again' })); });
      expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Successfully Connected!')).not.toBeNull();
      expect(navigation.router.push).not.toHaveBeenCalled();
      await advance(3000);
      expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith('/dashboard');
      expectNoStripeRedirect();
    });

    it.each([pending, inconclusive, { details_submitted: false }])('shows progress for %j, then succeeds and returns to the dashboard', async (data) => {
      connectApi.getConnectStatus.mockResolvedValueOnce({ data }).mockResolvedValue({ data: ready });
      render(<StrictMode><StripeReturnPage /></StrictMode>);
      expect(screen.getByRole('progressbar')).not.toBeNull();
      expect(screen.getByText('Confirming your details with Stripe…')).not.toBeNull();
      await advance();
      expect(screen.getByRole('progressbar')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
      expect(navigation.router.push).not.toHaveBeenCalled();
      expectNoStripeRedirect();
      await advance(2000);
      expect(screen.getByText('Successfully Connected!')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
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

    it.each([null, {}, inconclusive, { details_submitted: false }])('bounds inconclusive status %j to 15 polls', async (data) => {
      connectApi.getConnectStatus.mockResolvedValue({ data });
      render(<StripeReturnPage />);
      await advance();
      expect(screen.getByRole('progressbar')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
      await advance(30000);
      expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(15);
      expect(screen.getByText(confirmationMessage)).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Check again' })).not.toBeNull();
      expect(navigation.router.push).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Continue Stripe setup' })).toBeNull();
      expectNoStripeRedirect();
      await advance(30000);
      expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(15);
    });

    it.each([
      actionable,
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
    connectApi.getConnectStatus.mockResolvedValue({ data: actionable });
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
    connectApi.getConnectStatus.mockResolvedValue({ data: actionable });
    connectApi.redirectToConnectOnboarding.mockImplementation(() => { throw new Error('Invalid Stripe onboarding URL'); });
    render(<StripeReturnPage />);
    await advance();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue Stripe setup' })); });
    expect(toast).toHaveBeenCalledWith("We couldn't resume payout setup just now. Try again, or contact support if it keeps happening.", 'error');
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

  it('resets consecutive errors after a successful status read', async () => {
    const error = new Error('unavailable');
    connectApi.getConnectStatus
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ data: inconclusive })
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ data: ready });
    render(<StrictMode><StripeReturnPage /></StrictMode>);
    await advance(8000);
    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('progressbar')).not.toBeNull();
    expect(screen.queryByText(confirmationMessage)).toBeNull();
    await advance(2000);
    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(6);
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    expectNoStripeRedirect();
  });

  it('cancels dashboard navigation when unmounted during the success window', async () => {
    connectApi.getConnectStatus.mockResolvedValue({ data: ready });
    const view = render(<StrictMode><StripeReturnPage /></StrictMode>);
    await advance(1000);
    expect(screen.getByText('Successfully Connected!')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(3000);
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expectNoStripeRedirect();
  });

  it('ignores a deferred status response resolving after unmount', async () => {
    let resolveStatus!: (value: { data: typeof ready }) => void;
    connectApi.getConnectStatus.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    const view = render(<StrictMode><StripeReturnPage /></StrictMode>);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { resolveStatus({ data: ready }); });
    expect(vi.getTimerCount()).toBe(0);
    await advance(30000);
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    expect(navigation.router.push).not.toHaveBeenCalled();
    expectNoStripeRedirect();
  });

  it('cleans up polling after unmount', async () => {
    const view = render(<StripeReturnPage />);
    await advance();
    view.unmount();
    await advance(30000);
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expectNoStripeRedirect();
  });
});
