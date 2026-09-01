// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataVerificationPaymentMethodReturnPage from './page';

const attemptId = '123e4567-e89b-12d3-a456-426614174000';
const checkoutSessionId = 'cs_test_return_value';

const payinApi = vi.hoisted(() => ({
  createDataVerificationPayInSetupSession: vi.fn(),
  getDataVerificationPayInReadiness: vi.fn(),
  isDataVerificationPayInNotFound: vi.fn(),
  isOpaqueCheckoutSessionId: vi.fn((value: string | null) => /^cs_[A-Za-z0-9_]+$/.test(value ?? '')),
  isOpaqueSetupAttemptId: vi.fn(
    (value: string | null) =>
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        value ?? ''
      )
  ),
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
      <div role="dialog" aria-label="Re-authenticate after return">
        <button type="button" onClick={() => void onSuccess('fresh-return-token')}>
          Complete return reauth
        </button>
        <button type="button" onClick={onClose}>
          Cancel return reauth
        </button>
      </div>
    ) : null,
}));

function setReturnUrl(attempt = attemptId, sessionId = checkoutSessionId) {
  window.history.replaceState(
    {},
    '',
    `/dashboard/data-verification/payment-method/return?attempt=${attempt}&session_id=${sessionId}`
  );
}

describe('data-verification payment-method return page', () => {
  beforeEach(() => {
    setReturnUrl();
    payinApi.reconcileDataVerificationPayInSetupSession.mockResolvedValue({
      version: 'data_verification_payin_reconcile_result_v1',
      state: 'ready',
      message: 'server text is intentionally ignored',
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the return route inside exactly one outer dashboard main landmark', async () => {
    render(
      <main>
        <DataVerificationPaymentMethodReturnPage />
      </main>
    );

    expect(
      await screen.findByRole('region', { name: 'Payment method for verification charges' })
    ).toBeTruthy();
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelector('main main')).toBeNull();
  });

  it('removes query values before network work and reconciles only with a fresh token', async () => {
    payinApi.reconcileDataVerificationPayInSetupSession.mockImplementationOnce(async () => {
      expect(window.location.search).toBe('');
      return {
        version: 'data_verification_payin_reconcile_result_v1',
        state: 'ready',
        message: 'ignored',
      };
    });

    render(<DataVerificationPaymentMethodReturnPage />);

    expect(window.location.search).toBe('');
    expect(
      await screen.findByText('Confirm it is you again to finish adding your payment method.')
    ).toBeTruthy();
    expect(payinApi.reconcileDataVerificationPayInSetupSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Complete return reauth' }));

    await waitFor(() => {
      expect(payinApi.reconcileDataVerificationPayInSetupSession).toHaveBeenCalledWith(
        attemptId,
        checkoutSessionId,
        'fresh-return-token'
      );
    });
    expect(
      await screen.findByText(
        'Your payment method is ready for verification charges. Your Stripe payouts were not changed.'
      )
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain(attemptId);
    expect(document.body.textContent).not.toContain(checkoutSessionId);
  });

  it.each([
    ['pending', 'Stripe is still confirming your payment method. Check again in a moment.'],
    [
      'failed',
      'We could not confirm your payment method. No verification charge was made. Try again.',
    ],
  ] as const)('renders fixed %s reconcile copy', async (state, copy) => {
    payinApi.reconcileDataVerificationPayInSetupSession.mockResolvedValueOnce({
      version: 'data_verification_payin_reconcile_result_v1',
      state,
      message: 'raw backend/provider detail is ignored',
    });
    render(<DataVerificationPaymentMethodReturnPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete return reauth' }));

    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByText('raw backend/provider detail is ignored')).toBeNull();
  });

  it('uses fixed failure copy after network loss', async () => {
    payinApi.reconcileDataVerificationPayInSetupSession.mockRejectedValueOnce(
      new Error('provider network detail')
    );
    render(<DataVerificationPaymentMethodReturnPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete return reauth' }));

    expect(
      await screen.findByText(
        'We could not confirm your payment method. No verification charge was made. Try again.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('provider network detail')).toBeNull();
  });

  it('hides the return surface if the endpoint becomes unavailable', async () => {
    payinApi.isDataVerificationPayInNotFound.mockReturnValueOnce(true);
    payinApi.reconcileDataVerificationPayInSetupSession.mockRejectedValueOnce({
      response: { status: 404 },
    });
    render(<DataVerificationPaymentMethodReturnPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete return reauth' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Payment method for verification charges' })
      ).toBeNull();
    });
  });

  it('renders fixed cancellation copy when the return rechallenge is closed', async () => {
    render(<DataVerificationPaymentMethodReturnPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel return reauth' }));

    expect(
      screen.getByText(
        'No payment method was changed and no verification charge was made. You can try again.'
      )
    ).toBeTruthy();
    expect(payinApi.reconcileDataVerificationPayInSetupSession).not.toHaveBeenCalled();
  });

  it('fails closed and scrubs invalid opaque return values without network work', async () => {
    setReturnUrl('not-a-uuid', 'not-a-session');
    render(<DataVerificationPaymentMethodReturnPage />);

    expect(window.location.search).toBe('');
    expect(
      await screen.findByText(
        'We could not confirm your payment method. No verification charge was made. Try again.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(payinApi.reconcileDataVerificationPayInSetupSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('not-a-uuid');
    expect(document.body.textContent).not.toContain('not-a-session');
  });
});
