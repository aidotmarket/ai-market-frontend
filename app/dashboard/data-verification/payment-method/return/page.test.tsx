// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const auth = vi.hoisted(() => ({
  generateReauthToken: vi.fn(),
  submitReauth: vi.fn(),
}));

vi.mock('@/api/dataVerificationPayin', () => payinApi);
vi.mock('@/api/auth', () => auth);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setReturnUrl(attempt = attemptId, sessionId = checkoutSessionId) {
  window.history.replaceState(
    {},
    '',
    `/dashboard/data-verification/payment-method/return?attempt=${attempt}&session_id=${sessionId}`
  );
}

async function completeReturnReauth(code = '123456') {
  const input = await screen.findByRole('textbox', { name: 'Verification code' });
  expect(screen.getByRole('dialog', { name: 'Re-authenticate' })).toBeTruthy();
  fireEvent.change(input, { target: { value: code } });
  await waitFor(() => {
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  });
}

async function expectFocusOnSettingsFallback(dialog: HTMLElement) {
  const fallback = screen.getByRole('link', { name: 'Back to settings' });
  await waitFor(() => expect(document.activeElement).toBe(fallback));
  expect(dialog.isConnected).toBe(false);
  expect(fallback.isConnected).toBe(true);
  expect(fallback).not.toBe(document.body);
  expect(fallback.matches(':disabled')).toBe(false);
  expect(fallback.hidden).toBe(false);
  expect(fallback.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
}

describe('data-verification payment-method return page', () => {
  beforeEach(() => {
    setReturnUrl();
    payinApi.getDataVerificationPayInReadiness.mockResolvedValue({
      version: 'data_verification_payin_readiness_v1',
      state: 'setup_pending',
      can_start_setup: false,
      can_replace_payment_method: false,
      message: 'ignored',
    });
    payinApi.reconcileDataVerificationPayInSetupSession.mockResolvedValue({
      version: 'data_verification_payin_reconcile_result_v1',
      state: 'ready',
      message: 'server text is intentionally ignored',
    });
    auth.generateReauthToken.mockResolvedValue({});
    auth.submitReauth.mockResolvedValue({ reauth_token: 'fresh-return-token' });
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
    payinApi.getDataVerificationPayInReadiness.mockImplementationOnce(async () => {
      expect(window.location.search).toBe('');
      return {
        version: 'data_verification_payin_readiness_v1',
        state: 'setup_pending',
        can_start_setup: false,
        can_replace_payment_method: false,
        message: 'ignored',
      };
    });
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

    expect(screen.getByRole('dialog', { name: 'Re-authenticate' }).getAttribute('aria-modal')).toBe(
      'true'
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Verification code' })
      )
    );
    await completeReturnReauth();

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
    [
      'ready',
      'status',
      'Your payment method is ready for verification charges. Your Stripe payouts were not changed.',
    ],
    [
      'pending',
      'status',
      'Stripe is still confirming your payment method. Select Check again in a moment.',
    ],
    [
      'failed',
      'alert',
      'We could not confirm your payment method. No verification charge was made. Select Back to settings to start again.',
    ],
    [
      'network_error',
      'alert',
      'We could not confirm your payment method. No verification charge was made. Select Check again to retry.',
    ],
  ] as const)(
    'announces a deferred %s reconcile outcome through stable page live regions',
    async (outcome, expectedRegion, expectedCopy) => {
      const reconcile = deferred<{
        version: string;
        state: 'ready' | 'pending' | 'failed';
        message: string;
      }>();
      payinApi.reconcileDataVerificationPayInSetupSession.mockReturnValueOnce(
        reconcile.promise
      );
      render(<DataVerificationPaymentMethodReturnPage />);

      const status = screen.getByRole('status', { name: 'Payment-method status' });
      const alert = screen.getByRole('alert', { name: 'Payment-method error' });
      expect(status.textContent).toBe('Checking payment-method setup…');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.getAttribute('aria-atomic')).toBe('true');
      expect(alert.textContent).toBe('');
      expect(alert.getAttribute('aria-live')).toBe('assertive');
      expect(alert.getAttribute('aria-atomic')).toBe('true');

      const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
      await completeReturnReauth();
      expect(dialog.isConnected).toBe(true);

      if (outcome === 'network_error') {
        await act(async () => reconcile.reject(new Error('private provider reconcile detail')));
      } else {
        await act(async () =>
          reconcile.resolve({
            version: 'data_verification_payin_reconcile_result_v1',
            state: outcome,
            message: 'private provider reconcile detail',
          })
        );
      }

      await waitFor(() =>
        expect((expectedRegion === 'status' ? status : alert).textContent).toBe(expectedCopy)
      );
      expect(screen.getByRole('status', { name: 'Payment-method status' })).toBe(status);
      expect(screen.getByRole('alert', { name: 'Payment-method error' })).toBe(alert);
      expect((expectedRegion === 'status' ? alert : status).textContent).toBe('');
      expect(document.body.textContent).not.toContain('private provider reconcile detail');
      if (outcome === 'ready' || outcome === 'failed') {
        await expectFocusOnSettingsFallback(dialog);
      }
    }
  );

  it.each([
    [
      'pending',
      'Stripe is still confirming your payment method. Select Check again in a moment.',
    ],
    [
      'failed',
      'We could not confirm your payment method. No verification charge was made. Select Back to settings to start again.',
    ],
  ] as const)('renders fixed %s reconcile copy', async (state, copy) => {
    payinApi.reconcileDataVerificationPayInSetupSession.mockResolvedValueOnce({
      version: 'data_verification_payin_reconcile_result_v1',
      state,
      message: 'raw backend/provider detail is ignored',
    });
    render(<DataVerificationPaymentMethodReturnPage />);
    await completeReturnReauth();

    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByText('raw backend/provider detail is ignored')).toBeNull();
  });

  it('uses fixed failure copy after network loss', async () => {
    payinApi.reconcileDataVerificationPayInSetupSession.mockRejectedValueOnce(
      new Error('provider network detail')
    );
    render(<DataVerificationPaymentMethodReturnPage />);
    await completeReturnReauth();

    expect(
      await screen.findByText(
        'We could not confirm your payment method. No verification charge was made. Select Check again to retry.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('provider network detail')).toBeNull();
  });

  it('keeps opaque values only in memory and requires fresh reauth on two retries', async () => {
    payinApi.reconcileDataVerificationPayInSetupSession
      .mockResolvedValueOnce({
        version: 'data_verification_payin_reconcile_result_v1',
        state: 'pending',
        message: 'ignored pending detail',
      })
      .mockRejectedValueOnce(new Error('transient provider detail'))
      .mockResolvedValueOnce({
        version: 'data_verification_payin_reconcile_result_v1',
        state: 'ready',
        message: 'ignored ready detail',
      });
    auth.submitReauth
      .mockResolvedValueOnce({ reauth_token: 'fresh-token-1' })
      .mockResolvedValueOnce({ reauth_token: 'fresh-token-2' })
      .mockResolvedValueOnce({ reauth_token: 'fresh-token-3' });

    render(<DataVerificationPaymentMethodReturnPage />);
    expect(window.location.search).toBe('');

    await completeReturnReauth('111111');
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await completeReturnReauth('222222');
    expect(
      await screen.findByText(
        'We could not confirm your payment method. No verification charge was made. Select Check again to retry.'
      )
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await completeReturnReauth('333333');

    expect(
      await screen.findByText(
        'Your payment method is ready for verification charges. Your Stripe payouts were not changed.'
      )
    ).toBeTruthy();
    expect(payinApi.getDataVerificationPayInReadiness).toHaveBeenCalledTimes(3);
    expect(auth.generateReauthToken).toHaveBeenCalledTimes(3);
    expect(payinApi.reconcileDataVerificationPayInSetupSession.mock.calls).toEqual([
      [attemptId, checkoutSessionId, 'fresh-token-1'],
      [attemptId, checkoutSessionId, 'fresh-token-2'],
      [attemptId, checkoutSessionId, 'fresh-token-3'],
    ]);
    expect(window.location.search).toBe('');
    expect(document.body.textContent).not.toContain(attemptId);
    expect(document.body.textContent).not.toContain(checkoutSessionId);
  });

  it('focuses Back to settings after a deferred terminal retry removes its opener', async () => {
    const terminal = deferred<{
      version: string;
      state: 'ready';
      message: string;
    }>();
    payinApi.reconcileDataVerificationPayInSetupSession
      .mockResolvedValueOnce({
        version: 'data_verification_payin_reconcile_result_v1',
        state: 'pending',
        message: 'ignored pending detail',
      })
      .mockReturnValueOnce(terminal.promise);
    render(<DataVerificationPaymentMethodReturnPage />);

    await completeReturnReauth('111111');
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    const retryDialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    await completeReturnReauth('222222');
    await act(async () =>
      terminal.resolve({
        version: 'data_verification_payin_reconcile_result_v1',
        state: 'ready',
        message: 'private terminal provider detail',
      })
    );

    await screen.findByText(
      'Your payment method is ready for verification charges. Your Stripe payouts were not changed.'
    );
    await expectFocusOnSettingsFallback(retryDialog);
    expect(document.body.textContent).not.toContain('private terminal provider detail');
  });

  it('focuses Back to settings after cancelling a retry opened by a deferred preflight', async () => {
    const retryPreflight = deferred<{
      version: string;
      state: 'setup_pending';
      can_start_setup: false;
      can_replace_payment_method: false;
      message: string;
    }>();
    payinApi.getDataVerificationPayInReadiness
      .mockResolvedValueOnce({
        version: 'data_verification_payin_readiness_v1',
        state: 'setup_pending',
        can_start_setup: false,
        can_replace_payment_method: false,
        message: 'ignored initial preflight detail',
      })
      .mockReturnValueOnce(retryPreflight.promise);
    payinApi.reconcileDataVerificationPayInSetupSession.mockResolvedValueOnce({
      version: 'data_verification_payin_reconcile_result_v1',
      state: 'pending',
      message: 'ignored pending detail',
    });
    render(<DataVerificationPaymentMethodReturnPage />);

    await completeReturnReauth('111111');
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () =>
      retryPreflight.resolve({
        version: 'data_verification_payin_readiness_v1',
        state: 'setup_pending',
        can_start_setup: false,
        can_replace_payment_method: false,
        message: 'private retry preflight detail',
      })
    );
    const retryDialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect((cancel as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(cancel);

    await screen.findByText(
      'No payment method was changed and no verification charge was made. Select Back to settings to start again.'
    );
    await expectFocusOnSettingsFallback(retryDialog);
    expect(document.body.textContent).not.toContain('private retry preflight detail');
  });

  it('hides the return surface if the endpoint becomes unavailable', async () => {
    payinApi.isDataVerificationPayInNotFound.mockReturnValueOnce(true);
    payinApi.getDataVerificationPayInReadiness.mockRejectedValueOnce({
      response: { status: 404 },
    });
    render(<DataVerificationPaymentMethodReturnPage />);

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Payment method for verification charges' })
      ).toBeNull();
    });
    expect(auth.generateReauthToken).not.toHaveBeenCalled();
    expect(payinApi.reconcileDataVerificationPayInSetupSession).not.toHaveBeenCalled();
  });

  it('renders fixed cancellation copy when the return rechallenge is closed', async () => {
    render(<DataVerificationPaymentMethodReturnPage />);
    const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect((cancel as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(cancel);

    expect(
      screen.getByText(
        'No payment method was changed and no verification charge was made. Select Back to settings to start again.'
      )
    ).toBeTruthy();
    expect(payinApi.reconcileDataVerificationPayInSetupSession).not.toHaveBeenCalled();
    await expectFocusOnSettingsFallback(dialog);
  });

  it('fails closed and scrubs invalid opaque return values without network work', async () => {
    setReturnUrl('not-a-uuid', 'not-a-session');
    render(<DataVerificationPaymentMethodReturnPage />);

    expect(window.location.search).toBe('');
    expect(
      await screen.findByText(
        'We could not confirm your payment method. No verification charge was made. Select Back to settings to start again.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(payinApi.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
    expect(payinApi.reconcileDataVerificationPayInSetupSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('not-a-uuid');
    expect(document.body.textContent).not.toContain('not-a-session');
  });
});
