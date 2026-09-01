'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  createDataVerificationPayInSetupSession,
  getDataVerificationPayInReadiness,
  isDataVerificationPayInNotFound,
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
const READY =
  'A payment method is ready for verification charges. Your Stripe payouts are separate and were not changed.';
const CANCELLED =
  'No payment method was changed and no verification charge was made. You can try again.';
const PENDING = 'Stripe is still confirming your payment method. Check again in a moment.';
const FAILED =
  'We could not confirm your payment method. No verification charge was made. Try again.';
const SUCCESS =
  'Your payment method is ready for verification charges. Your Stripe payouts were not changed.';
const BLOCKED =
  'Payment-method setup is unavailable for this seller account. Contact support without sending payment details.';
const HEADING_ID = 'data-verification-payment-method-heading';

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
  if (state === 'setup_pending' || state === 'pending') return PENDING;
  if (state === 'ready') return mode === 'return' ? SUCCESS : READY;
  if (state === 'blocked') return BLOCKED;
  if (state === 'failed' || state === 'network_error') return FAILED;
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
  const initialized = useRef(false);

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
    if (window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    setQueryRemoved(true);

    if (mode === 'return') {
      if (returnValues.current) {
        setIsReauthOpen(true);
      } else {
        setDisplayState('failed');
      }
    } else if (cancelled) {
      setDisplayState('cancelled');
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'setup' || !queryRemoved) return;
    let cancelled = false;

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
            isDataVerificationPayInNotFound(error) ? 'hidden' : 'network_error'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, queryRemoved]);

  const openSetupReauth = () => {
    setIsReauthOpen(true);
  };

  const closeReauth = () => {
    if (isWorking) return;
    setIsReauthOpen(false);
    if (mode === 'return') setDisplayState('cancelled');
  };

  const handleSetupReauth = async (reauthToken: string) => {
    setIsWorking(true);
    try {
      const setupSession = await createDataVerificationPayInSetupSession(reauthToken);
      navigateToDataVerificationPayInSetup(setupSession.checkout_url);
    } catch (error: unknown) {
      setIsReauthOpen(false);
      setDisplayState(isDataVerificationPayInNotFound(error) ? 'hidden' : 'failed');
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
      returnValues.current = null;
      setDisplayState(result.state);
      setIsReauthOpen(false);
    } catch (error: unknown) {
      returnValues.current = null;
      setDisplayState(
        isDataVerificationPayInNotFound(error) ? 'hidden' : 'network_error'
      );
      setIsReauthOpen(false);
    } finally {
      setIsWorking(false);
    }
  };

  const copy = fixedCopy(displayState, mode);
  const canStart = mode === 'setup' && displayState === 'setup_required';
  const canReplace = mode === 'setup' && displayState === 'ready';

  if (displayState === 'hidden') return null;

  return (
    <section className="max-w-2xl" aria-labelledby={HEADING_ID}>
      <ReauthModal
        isOpen={isReauthOpen}
        onClose={closeReauth}
        onSuccess={mode === 'return' ? handleReturnReauth : handleSetupReauth}
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
        {displayState === 'checking' ? (
          <p className="text-sm text-gray-600" role="status">
            Checking payment-method setup…
          </p>
        ) : (
          copy && <p className="text-sm text-gray-700">{copy}</p>
        )}

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
      </section>

      <Link
        href="/dashboard/settings"
        className="mt-6 inline-flex text-sm font-medium text-[#3F51B5] hover:underline"
      >
        Back to settings
      </Link>
    </section>
  );
}
