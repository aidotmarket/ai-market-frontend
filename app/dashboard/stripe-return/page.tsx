'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getConnectStatus,
  getConnectOnboarding,
  isConnectOnboardingTwoFactorRequired,
  redirectToConnectOnboarding,
} from '@/api/connect';
import { useToast } from '@/components/Toast';

type ConnectStatus = {
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements?: {
    currently_due?: string[];
    pending_verification?: string[];
  };
};

const REVIEWING_MESSAGE = 'Stripe is reviewing your details; this can take a few minutes.';

export default function StripeReturnPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [status, setStatus] = useState<'loading' | 'success' | 'action' | 'reviewing' | 'timeout'>('loading');
  const [connecting, setConnecting] = useState(false);
  const [reviewingSuccess, setReviewingSuccess] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const statusRequestRef = useRef<ReturnType<typeof getConnectStatus> | null>(null);
  const connectingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let consecutiveErrors = 0;
    let lastStatus: ConnectStatus | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (nextStatus: 'success' | 'action' | 'reviewing' | 'timeout') => {
      cancelled = true;
      statusRequestRef.current = null;
      clearTimeout(pollTimer);
      clearTimeout(deadlineTimer);
      setStatus(nextStatus);
    };
    const finishPolling = () => {
      finish(lastStatus?.requirements?.pending_verification?.length ? 'reviewing' : 'timeout');
    };

    // Bound even a status request that never settles, as well as the poll count.
    deadlineTimer = setTimeout(finishPolling, 30000);

    const pollStatus = async () => {
      try {
        // Share the first in-flight read when React Strict Mode replays the effect.
        const request = statusRequestRef.current ??= getConnectStatus();
        let res;
        try {
          res = await request;
        } finally {
          if (statusRequestRef.current === request) statusRequestRef.current = null;
        }
        if (cancelled) return;

        consecutiveErrors = 0;
        lastStatus = res.data as ConnectStatus | null;
        const requirements = lastStatus?.requirements;
        if (requirements?.currently_due?.length) {
          finish('action');
          return;
        }
        if (lastStatus?.details_submitted) {
          setReviewingSuccess(!lastStatus.charges_enabled || !lastStatus.payouts_enabled);
          finish('success');
          redirectTimer = setTimeout(() => router.push('/dashboard'), 3000);
          return;
        }
        // Unsubmitted details alone are inconclusive while Stripe processes updates.
        // Keep polling unless Stripe reports actionable requirements above.
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to check Stripe status', err);
        lastStatus = null;
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          finish('timeout');
          return;
        }
      }

      attempts++;
      if (attempts >= 15) {
        finishPolling();
      } else {
        pollTimer = setTimeout(pollStatus, 2000);
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;
      clearTimeout(deadlineTimer);
      clearTimeout(pollTimer);
      clearTimeout(redirectTimer);
    };
  }, [router, retryCount]);

  const handleResume = async () => {
    if (status !== 'action' || connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    try {
      const res = await getConnectOnboarding();
      redirectToConnectOnboarding(res.data);
    } catch (err) {
      if (isConnectOnboardingTwoFactorRequired(err)) {
        toast('Complete the sign-in security step before connecting payouts. Refresh seller setup if you already completed it.', 'info');
      } else {
        toast('Failed to resume Stripe connection', 'error');
      }
      connectingRef.current = false;
      setConnecting(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        {status === 'loading' && (
          <>
            <div role="progressbar" aria-label="Confirming Stripe details" className="h-2 w-full overflow-hidden rounded-full bg-gray-200 mb-4">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#3F51B5]" />
            </div>
            <p className="text-gray-500">Confirming your details with Stripe…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Successfully Connected!</h2>
            <p className="text-gray-500">
              {reviewingSuccess ? REVIEWING_MESSAGE : 'Your Stripe account is ready. Redirecting to dashboard...'}
            </p>
          </>
        )}

        {status === 'reviewing' && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verification Pending</h2>
            <p className="text-gray-500 mb-6">{REVIEWING_MESSAGE}</p>
            <div className="space-y-3">
              <button
                onClick={() => { setStatus('loading'); setRetryCount((count) => count + 1); }}
                className="w-full rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0]"
              >
                Retry check
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Return to Dashboard
              </button>
            </div>
          </>
        )}

        {status === 'action' && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Stripe needs more information</h2>
            <p className="text-gray-500 mb-6">Continue Stripe setup to provide the details Stripe requested.</p>
            <button
              onClick={handleResume}
              disabled={connecting}
              className="w-full rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50"
            >
              {connecting ? 'Loading...' : 'Continue Stripe setup'}
            </button>
          </>
        )}

        {status === 'timeout' && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Confirmation pending</h2>
            <p className="text-gray-500 mb-6">We couldn't confirm with Stripe yet. Your details are saved; check again in a few minutes.</p>
            <div className="space-y-3">
              <button
                onClick={() => { setStatus('loading'); setRetryCount((count) => count + 1); }}
                className="w-full rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0]"
              >
                Check again
              </button>
              <Link href="/dashboard" className="block text-sm font-medium text-gray-500 hover:text-gray-700">
                Return to Dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
