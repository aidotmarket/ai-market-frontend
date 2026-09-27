'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [status, setStatus] = useState<'loading' | 'resuming' | 'success' | 'action' | 'reviewing' | 'timeout' | 'abandoned' | 'error'>('loading');
  const [connecting, setConnecting] = useState(false);
  const [reviewingSuccess, setReviewingSuccess] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const cancelledRef = useRef(false);
  const statusRequestRef = useRef<ReturnType<typeof getConnectStatus> | null>(null);
  const refreshRequestRef = useRef<ReturnType<typeof getConnectOnboarding> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    const showSuccess = (data: ConnectStatus, isCancelled: () => boolean) => {
      setReviewingSuccess(!data.charges_enabled || !data.payouts_enabled);
      setStatus('success');
      redirectTimerRef.current = setTimeout(() => {
        if (!isCancelled()) router.push('/dashboard');
      }, 3000);
    };

    const abandoned = searchParams.get('abandoned');
    if (abandoned === '1' || abandoned === 'true') {
      setStatus('resuming');
      let cancelled = false;
      const clearRefreshTimer = () => {
        if (refreshTimerRef.current !== null) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
      };
      refreshTimerRef.current = setTimeout(() => {
        cancelled = true;
        refreshTimerRef.current = null;
        setStatus('abandoned');
      }, 15000);
      // Reuse the in-flight status check and link mint when Strict Mode replays this effect.
      const statusRequest = statusRequestRef.current ??= getConnectStatus();
      statusRequest.then((res) => res.data as ConnectStatus).catch((err) => {
        console.error('Failed to check Stripe status', err);
        return null;
      }).then((data) => {
        if (cancelled) return;
        if (data?.details_submitted && !data.requirements?.currently_due?.length) {
          clearRefreshTimer();
          showSuccess(data, () => cancelled);
          return;
        }
        const refreshRequest = refreshRequestRef.current ??= getConnectOnboarding();
        refreshRequest.then((res) => {
          if (!cancelled) redirectToConnectOnboarding(res.data);
        }).catch((err) => {
          if (cancelled) return;
          if (isConnectOnboardingTwoFactorRequired(err)) {
            toast('Complete 2FA setup before connecting payouts.', 'info');
          }
          setStatus('abandoned');
        }).finally(() => {
          if (refreshRequestRef.current === refreshRequest) refreshRequestRef.current = null;
          if (!cancelled) clearRefreshTimer();
        });
      }).finally(() => {
        if (statusRequestRef.current === statusRequest) statusRequestRef.current = null;
      });
      return () => {
        cancelled = true;
        clearRefreshTimer();
        if (redirectTimerRef.current) {
          clearTimeout(redirectTimerRef.current);
          redirectTimerRef.current = null;
        }
      };
    }

    let attempts = 0;
    const maxAttempts = 15; // 30 seconds total (2s * 15)
    let consecutiveErrors = 0;
    let lastStatus: ConnectStatus | null = null;

    const pollStatus = async () => {
      if (cancelledRef.current) return;

      try {
        const res = await getConnectStatus();
        if (cancelledRef.current) return;

        consecutiveErrors = 0;
        lastStatus = res.data as ConnectStatus;
        if (lastStatus?.requirements?.currently_due?.length) {
          setStatus('action');
          return;
        }
        if (lastStatus?.details_submitted) {
          showSuccess(lastStatus, () => cancelledRef.current);
          return;
        }
      } catch (err) {
        if (cancelledRef.current) return;
        console.error('Failed to check Stripe status', err);
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          setStatus('error');
          return;
        }
      }

      attempts++;
      if (cancelledRef.current) return;

      if (attempts >= maxAttempts) {
        const requirements = lastStatus?.requirements;
        setStatus(
          lastStatus?.details_submitted === false &&
          requirements?.currently_due?.length === 0 &&
          (requirements?.pending_verification?.length ?? 0) > 0
            ? 'reviewing'
            : 'timeout',
        );
      } else {
        pollTimerRef.current = setTimeout(pollStatus, 2000);
      }
    };

    pollStatus();

    return () => {
      cancelledRef.current = true;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [router, searchParams, toast, retryCount]);

  const handleResume = async () => {
    setConnecting(true);
    try {
      const res = await getConnectOnboarding();
      redirectToConnectOnboarding(res.data);
    } catch (err) {
      if (isConnectOnboardingTwoFactorRequired(err)) {
        toast('Complete 2FA setup before connecting payouts.', 'info');
      } else {
        toast('Failed to resume Stripe connection', 'error');
      }
      setConnecting(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying Connection</h2>
            <p className="text-gray-500">Please wait while we confirm your Stripe account setup...</p>
          </>
        )}

        {status === 'resuming' && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Returning you to Stripe...</h2>
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
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Stripe setup not finished</h2>
            <p className="text-gray-500 mb-6">It looks like the Stripe form wasn't completed. You can pick up where you left off.</p>
            <div className="space-y-3">
              <button
                onClick={handleResume}
                disabled={connecting}
                className="w-full rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50"
              >
                {connecting ? 'Loading...' : 'Continue Stripe setup'}
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

        {status === 'error' && (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verification Failed</h2>
            <p className="text-gray-500 mb-6">We couldn't verify your Stripe connection. Please try again.</p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Retry
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

        {status === 'abandoned' && (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
              <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Setup Incomplete</h2>
            <p className="text-gray-500 mb-6">You didn't finish setting up your Stripe account.</p>
            <div className="space-y-3">
              <button
                onClick={handleResume}
                disabled={connecting}
                className="w-full rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50"
              >
                {connecting ? 'Loading...' : 'Resume Onboarding'}
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
      </div>
    </div>
  );
}
