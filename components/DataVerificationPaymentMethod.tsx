'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  createDataVerificationPayInSetupSession,
  getDataVerificationPayInReadiness,
  isDataVerificationPayInUnavailable,
  isOpaqueCheckoutSessionId,
  isOpaqueSetupAttemptId,
  navigateToDataVerificationPayInSetup,
  reconcileDataVerificationPayInSetupSession,
} from '@/api/dataVerificationPayin';
import ReauthModal from '@/app/dashboard/settings/ReauthModal';
import type {
  DataVerificationPayInReadinessState,
  DataVerificationPayInReconcileState,
} from '@/types';

const HEADING = 'Payment method for verification charges';
const EXPLANATION =
  'Add a payment method that ai.market can use for data-verification charges. This is separate from Stripe payouts.';
const HOSTED_HANDOFF =
  'You will continue securely on Stripe. ai.market does not collect or store your card details, and no verification charge is made during setup.';
const SETUP_REAUTH =
  'Confirm it is you to continue. This confirmation is valid for 60 seconds.';
const RETURN_REAUTH = 'Confirm it is you again to finish adding your payment method.';
const SETUP_REQUIRED = 'Choose Add payment method to continue.';
const READY =
  'A payment method is ready for verification charges. Your Stripe payouts are separate and were not changed.';
const CANCELLED =
  'No payment method was changed and no verification charge was made. Select Back to settings to start again.';
const SETUP_PENDING =
  'Stripe is still confirming your payment method. Return to this page later to check its status.';
const RETURN_PENDING =
  'Stripe is still confirming your payment method. Select Check again in a moment.';
const RETURN_TRANSIENT =
  'We could not confirm your payment method. No verification charge was made. Select Check again to retry.';
const FAILED =
  'We could not confirm your payment method. No verification charge was made. Select Back to settings to start again.';
const SUCCESS =
  'Your payment method is ready for verification charges. Your Stripe payouts were not changed.';
const BLOCKED =
  'Payment-method setup is unavailable for this seller account. Contact support without sending payment details.';
const HEADING_ID = 'data-verification-payment-method-heading';
const STATUS_REGION_LABEL = 'Payment-method status';
const ALERT_REGION_LABEL = 'Payment-method error';

type DisplayState =
  | 'checking'
  | 'hidden'
  | 'cancelled'
  | 'network_error'
  | DataVerificationPayInReadinessState
  | DataVerificationPayInReconcileState;

interface ReturnValues {
  setupAttemptId: string;
  checkoutSessionId: string;
}

interface DataVerificationPaymentMethodProps {
  mode?: 'setup' | 'return';
}

function fixedCopy(state: DisplayState, mode: 'setup' | 'return'): string | null {
  if (state === 'cancelled') return CANCELLED;
  if (state === 'setup_required') return SETUP_REQUIRED;
  if (state === 'setup_pending') return SETUP_PENDING;
  if (state === 'pending') return RETURN_PENDING;
  if (state === 'ready') return mode === 'return' ? SUCCESS : READY;
  if (state === 'blocked') return BLOCKED;
  if (state === 'network_error') return mode === 'return' ? RETURN_TRANSIENT : FAILED;
  if (state === 'failed') return FAILED;
  return null;
}

export default function DataVerificationPaymentMethod({
  mode = 'setup',
}: DataVerificationPaymentMethodProps) {
  const [displayState, setDisplayState] = useState<DisplayState>('checking');
  const [queryRemoved, setQueryRemoved] = useState(false);
  const [isReauthOpen, setIsReauthOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const returnValues = useRef<ReturnValues | null>(null);
  const returnPreflightRequest = useRef<
    ReturnType<typeof getDataVerificationPayInReadiness> | null
  >(null);
  const initialized = useRef(false);
  const backToSettingsRef = useRef<HTMLAnchorElement>(null);

  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const query = new URLSearchParams(window.location.search);
    if (mode === 'return') {
      const setupAttemptId = query.get('attempt');
      const checkoutSessionId = query.get('session_id');
      if (
        isOpaqueSetupAttemptId(setupAttemptId) &&
        isOpaqueCheckoutSessionId(checkoutSessionId)
      ) {
        returnValues.current = { setupAttemptId, checkoutSessionId };
      }
    }

    const cancelled = mode === 'setup' && query.get('result') === 'cancelled';
    if (mode !== 'return') {
      if (window.location.search) {
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
      setQueryRemoved(true);
      if (cancelled) setDisplayState('cancelled');
      return;
    }

    let frameId: number | null = null;
    let consecutiveCleanFrames = 0;

    // Next's login redirect may finish its own history update after this layout
    // effect. Scrub immediately, then keep the return flow gated until the
    // clean URL survives two browser frames.
    const scrubAndVerify = () => {
      if (window.location.search) {
        window.history.replaceState(window.history.state, '', window.location.pathname);
        consecutiveCleanFrames = 0;
      } else {
        consecutiveCleanFrames += 1;
      }

      if (consecutiveCleanFrames >= 2) {
        setQueryRemoved(true);
        return;
      }
      frameId = window.requestAnimationFrame(scrubAndVerify);
    };

    if (window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    frameId = window.requestAnimationFrame(scrubAndVerify);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [mode]);

  const runReturnPreflight = useCallback(async (isCancelled: () => boolean = () => false) => {
    setDisplayState('checking');
    let readinessRequest = returnPreflightRequest.current;
    if (!readinessRequest) {
      readinessRequest = getDataVerificationPayInReadiness();
      returnPreflightRequest.current = readinessRequest;
    }

    try {
      await readinessRequest;
      if (!isCancelled()) {
        if (returnValues.current) {
          setIsReauthOpen(true);
        } else {
          setDisplayState('failed');
        }
      }
    } catch (error: unknown) {
      if (isCancelled()) return;
      if (isDataVerificationPayInUnavailable(error)) {
        returnValues.current = null;
        setDisplayState('hidden');
      } else {
        setDisplayState('network_error');
      }
    } finally {
      if (returnPreflightRequest.current === readinessRequest) {
        returnPreflightRequest.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!queryRemoved) return;
    let cancelled = false;

    if (mode === 'return') {
      void runReturnPreflight(() => cancelled);
      return () => {
        cancelled = true;
      };
    }

    getDataVerificationPayInReadiness()
      .then((readiness) => {
        if (!cancelled) {
          setDisplayState((current) =>
            current === 'cancelled' ? current : readiness.state
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDisplayState(
            isDataVerificationPayInUnavailable(error) ? 'hidden' : 'network_error'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, queryRemoved, runReturnPreflight]);

  const openSetupReauth = () => {
    setIsReauthOpen(true);
  };

  const closeReauth = () => {
    if (isWorking) return;
    setIsReauthOpen(false);
    if (mode === 'return') {
      returnValues.current = null;
      setDisplayState('cancelled');
    }
  };

  const handleSetupReauth = async (reauthToken: string) => {
    setIsWorking(true);
    try {
      const setupSession = await createDataVerificationPayInSetupSession(reauthToken);
      navigateToDataVerificationPayInSetup(setupSession.checkout_url);
    } catch (error: unknown) {
      setIsReauthOpen(false);
      setDisplayState(isDataVerificationPayInUnavailable(error) ? 'hidden' : 'failed');
    } finally {
      setIsWorking(false);
    }
  };

  const handleReturnReauth = async (reauthToken: string) => {
    const values = returnValues.current;
    if (!values) {
      setIsReauthOpen(false);
      setDisplayState('failed');
      return;
    }

    setIsWorking(true);
    try {
      const result = await reconcileDataVerificationPayInSetupSession(
        values.setupAttemptId,
        values.checkoutSessionId,
        reauthToken
      );
      if (result.state !== 'pending') returnValues.current = null;
      setDisplayState(result.state);
      setIsReauthOpen(false);
    } catch (error: unknown) {
      if (isDataVerificationPayInUnavailable(error)) {
        returnValues.current = null;
        setDisplayState('hidden');
      } else {
        setDisplayState('network_error');
      }
      setIsReauthOpen(false);
    } finally {
      setIsWorking(false);
    }
  };

  const copy = fixedCopy(displayState, mode);
  const canStart = mode === 'setup' && displayState === 'setup_required';
  const canReplace = mode === 'setup' && displayState === 'ready';
  const canRecheck =
    mode === 'return' &&
    !isReauthOpen &&
    returnValues.current !== null &&
    (displayState === 'pending' || displayState === 'network_error');

  const backToSettings = (
    <Link
      ref={backToSettingsRef}
      href="/dashboard/settings"
      className="mt-6 inline-flex text-sm font-medium text-[#3F51B5] hover:underline"
    >
      Back to settings
    </Link>
  );

  if (displayState === 'hidden') return backToSettings;

  return (
    <section className="max-w-2xl" aria-labelledby={HEADING_ID}>
      <ReauthModal
        isOpen={isReauthOpen}
        onClose={closeReauth}
        onSuccess={mode === 'return' ? handleReturnReauth : handleSetupReauth}
        fallbackFocusRef={backToSettingsRef}
      />

      <h1 id={HEADING_ID} className="text-2xl font-bold text-gray-900">
        {HEADING}
      </h1>
      <p className="mt-3 text-sm text-gray-600">{EXPLANATION}</p>

      {mode === 'setup' && (canStart || canReplace) && (
        <p className="mt-3 text-sm text-gray-600">{HOSTED_HANDOFF}</p>
      )}

      {isReauthOpen && (
        <p className="mt-4 text-sm font-medium text-gray-700" role="status">
          {mode === 'return' ? RETURN_REAUTH : SETUP_REAUTH}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div
          role="status"
          aria-label={STATUS_REGION_LABEL}
          aria-live="polite"
          aria-atomic="true"
          className="text-sm text-gray-700"
        >
          {displayState === 'checking'
            ? 'Checking payment-method setup…'
            : displayState !== 'failed' && displayState !== 'network_error'
              ? copy
              : null}
        </div>
        <div
          role="alert"
          aria-label={ALERT_REGION_LABEL}
          aria-live="assertive"
          aria-atomic="true"
          className="text-sm text-gray-700"
        >
          {displayState === 'failed' || displayState === 'network_error' ? copy : null}
        </div>

        {(canStart || canReplace) && (
          <button
            type="button"
            onClick={openSetupReauth}
            disabled={isWorking || isReauthOpen}
            className="mt-5 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking
              ? 'Continuing…'
              : canReplace
                ? 'Replace payment method'
                : 'Add payment method'}
          </button>
        )}

        {canRecheck && (
          <button
            type="button"
            onClick={() => void runReturnPreflight()}
            disabled={isWorking}
            className="mt-5 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Check again
          </button>
        )}
      </section>

      {backToSettings}
    </section>
  );
}
