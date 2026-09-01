// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataVerificationPaymentMethodPage from './page';

const payinApi = vi.hoisted(() => ({
  createDataVerificationPayInSetupSession: vi.fn(),
  getDataVerificationPayInReadiness: vi.fn(),
  isDataVerificationPayInNotFound: vi.fn(
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 404
  ),
  isOpaqueCheckoutSessionId: vi.fn(),
  isOpaqueSetupAttemptId: vi.fn(),
  navigateToDataVerificationPayInSetup: vi.fn(),
  reconcileDataVerificationPayInSetupSession: vi.fn(),
}));

vi.mock('@/api/dataVerificationPayin', () => payinApi);
vi.mock('@/app/dashboard/settings/ReauthModal', () => ({
  default: ({
    isOpen,
    onClose,
    onSuccess,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (token: string) => void | Promise<void>;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Re-authenticate">
        <button type="button" onClick={() => void onSuccess('fresh-setup-token')}>
          Complete setup reauth
        </button>
        <button type="button" onClick={onClose}>
          Close reauth
        </button>
      </div>
    ) : null,
}));

const readiness = (state: 'setup_required' | 'setup_pending' | 'ready' | 'blocked') => ({
  version: 'data_verification_payin_readiness_v1',
  state,
  can_start_setup: state === 'setup_required',
  can_replace_payment_method: state === 'ready',
  message: 'server text is intentionally ignored',
});

describe('data-verification payment-method page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/dashboard/data-verification/payment-method');
    payinApi.getDataVerificationPayInReadiness.mockResolvedValue(readiness('setup_required'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders fixed setup copy, reauthenticates, and uses direct top-level navigation', async () => {
    const hostedCheckoutUrl =
      'https://checkout.stripe.com/c/pay/cs_test_exact_navigation_sentinel';
    payinApi.createDataVerificationPayInSetupSession.mockResolvedValueOnce({
      version: 'data_verification_payin_setup_session_v1',
      setup_attempt_id: '123e4567-e89b-12d3-a456-426614174000',
      checkout_url: hostedCheckoutUrl,
      expires_at: '2026-09-01T12:00:00Z',
    });
    render(<DataVerificationPaymentMethodPage />);

    expect(
      await screen.findByRole('heading', { name: 'Payment method for verification charges' })
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Add a payment method that ai.market can use for data-verification charges. This is separate from Stripe payouts.'
      )
    ).toBeTruthy();
    expect(
      await screen.findByText(
        'You will continue securely on Stripe. ai.market does not collect or store your card details, and no verification charge is made during setup.'
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add payment method' }));
    expect(
      screen.getByText('Confirm it is you to continue. This confirmation is valid for 60 seconds.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Complete setup reauth' }));

    await waitFor(() => {
      expect(payinApi.createDataVerificationPayInSetupSession).toHaveBeenCalledWith(
        'fresh-setup-token'
      );
      expect(payinApi.navigateToDataVerificationPayInSetup).toHaveBeenCalledTimes(1);
    });
    expect(payinApi.navigateToDataVerificationPayInSetup).toHaveBeenCalledWith(
      hostedCheckoutUrl
    );
  });

  it('renders the route inside exactly one outer dashboard main landmark', async () => {
    render(
      <main>
        <DataVerificationPaymentMethodPage />
      </main>
    );

    expect(
      await screen.findByRole('region', { name: 'Payment method for verification charges' })
    ).toBeTruthy();
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelector('main main')).toBeNull();
  });

  it('uses the replacement label and fixed ready copy', async () => {
    payinApi.getDataVerificationPayInReadiness.mockResolvedValueOnce(readiness('ready'));
    render(<DataVerificationPaymentMethodPage />);

    expect(
      await screen.findByText(
        'A payment method is ready for verification charges. Your Stripe payouts are separate and were not changed.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace payment method' })).toBeTruthy();
  });

  it.each([
    [
      'setup_pending',
      'Stripe is still confirming your payment method. Return to this page later to check its status.',
    ],
    [
      'blocked',
      'Payment-method setup is unavailable for this seller account. Contact support without sending payment details.',
    ],
  ] as const)('renders fixed %s copy without an action button', async (state, copy) => {
    payinApi.getDataVerificationPayInReadiness.mockResolvedValueOnce(readiness(state));
    render(<DataVerificationPaymentMethodPage />);

    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /payment method/i })).toBeNull();
  });

  it('removes cancellation queries before readiness and renders fixed cancel copy', async () => {
    window.history.replaceState(
      {},
      '',
      '/dashboard/data-verification/payment-method?result=cancelled&attempt=123e4567-e89b-12d3-a456-426614174000'
    );
    payinApi.getDataVerificationPayInReadiness.mockImplementationOnce(async () => {
      expect(window.location.search).toBe('');
      return readiness('setup_required');
    });

    render(<DataVerificationPaymentMethodPage />);

    expect(
      await screen.findByText(
        'No payment method was changed and no verification charge was made. Select Back to settings to start again.'
      )
    ).toBeTruthy();
    expect(window.location.search).toBe('');
    expect(document.body.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('uses fixed failure copy for a network error and hides a not-found surface', async () => {
    payinApi.getDataVerificationPayInReadiness.mockRejectedValueOnce(new Error('raw network detail'));
    const { unmount } = render(<DataVerificationPaymentMethodPage />);
    expect(
      await screen.findByText(
        'We could not confirm your payment method. No verification charge was made. Select Back to settings to start again.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('raw network detail')).toBeNull();

    unmount();
    payinApi.getDataVerificationPayInReadiness.mockRejectedValueOnce({ response: { status: 404 } });
    render(<DataVerificationPaymentMethodPage />);
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Payment method for verification charges' })
      ).toBeNull();
    });
  });

  it('does not render identifiers, card metadata, or Connect status from server text', async () => {
    payinApi.getDataVerificationPayInReadiness.mockResolvedValueOnce({
      ...readiness('setup_required'),
      message: 'cs_hidden pm_hidden acct_hidden Visa 4242 expiry Connect enabled',
    });
    render(<DataVerificationPaymentMethodPage />);
    await screen.findByRole('button', { name: 'Add payment method' });

    for (const forbidden of ['cs_hidden', 'pm_hidden', 'acct_hidden', 'Visa', '4242', 'expiry', 'Connect enabled']) {
      expect(document.body.textContent).not.toContain(forbidden);
    }
  });

  it('has no embedded payment, secret, persistence, analytics, or Stripe dependency surface', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'components/DataVerificationPaymentMethod.tsx'),
      'utf8'
    );
    const apiSource = readFileSync(
      resolve(process.cwd(), 'api/dataVerificationPayin.ts'),
      'utf8'
    );
    const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

    expect(component).not.toMatch(/<iframe|<form|<input|localStorage|sessionStorage|console\.|analytics/i);
    expect(`${component}\n${apiSource}`).not.toMatch(/client[_-]?secret|@stripe\/stripe-js|\bElements\b/);
    expect(apiSource).not.toMatch(/@\/lib\/api/);
    expect(packageJson).not.toMatch(/['\"](?:@stripe\/stripe-js|stripe)['\"]/);
    expect(component.match(/checkout_url/g)).toHaveLength(1);
  });
});
