'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getConnectStatus, getConnectOnboarding } from '@/api/connect';
import { useToast } from '@/components/Toast';

const STRIPE_CONNECT_URL_PREFIX = 'https://connect.stripe.com/';

export default function StripeReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [status, setStatus] = useState<'loading' | 'success' | 'timeout' | 'abandoned' | 'error'>('loading');
  const [connecting, setConnecting] = useState(false);
  const cancelledRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cancelledRef.current = false;

    const abandoned = searchParams.get('abandoned');
    if (abandoned === 'true') {
      setStatus('abandoned');
      return;
    }

    let attempts = 0;
    const maxAttempts = 15; // 30 seconds total (2s * 15)
    let consecutiveErrors = 0;

    const pollStatus = async () => {
      if (cancelledRef.current) return;

      try {
        const res = await getConnectStatus();
        if (cancelledRef.current) return;

        consecutiveErrors = 0;
        if (res.data?.details_submitted) {
          setStatus('success');
          redirectTimerRef.current = setTimeout(() => {
            if (!cancelledRef.current) {
              router.push('/dashboard');
            }
          }, 3000);
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
        setStatus('timeout');
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
  }, [router, searchParams]);

  const handleResume = async () => {
    setConnecting(true);
    try {
      const res = await getConnectOnboarding();
      const url = res.data?.url;
      if (url && typeof url === 'string' && url.startsWith(STRIPE_CONNECT_URL_PREFIX)) {
        window.location.href = url;
      } else {
        throw new Error('Invalid Stripe onboarding URL');
      }
    } catch (err) {
      toast('Failed to resume Stripe connection', 'error');
      setConnecting(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying Connection</h2>
            <p className="text-gray-500">Please wait while we confirm your Stripe account setup...</p>
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
            <p className="text-gray-500">Your Stripe account is ready. Redirecting to dashboard...</p>
          </>
        )}

        {status === 'timeout' && (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verification Pending</h2>
            <p className="text-gray-500 mb-6">Your account is being reviewed by Stripe. This can take a few minutes.</p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
              >
                Refresh Status
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
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
