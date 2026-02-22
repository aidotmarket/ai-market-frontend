'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getConnectStatus, getConnectOnboarding } from '@/api/connect';
import { useToast } from '@/components/Toast';

export default function StripeReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [status, setStatus] = useState<'loading' | 'success' | 'timeout' | 'abandoned'>('loading');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const abandoned = searchParams.get('abandoned');
    if (abandoned === 'true') {
      setStatus('abandoned');
      return;
    }

    let attempts = 0;
    const maxAttempts = 15; // 30 seconds total (2s * 15)
    
    const pollStatus = async () => {
      try {
        const res = await getConnectStatus();
        if (res.data?.is_connected) {
          setStatus('success');
          setTimeout(() => {
            router.push('/dashboard');
          }, 3000);
          return;
        }
      } catch (error) {
        console.error('Failed to check Stripe status', error);
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setStatus('timeout');
      } else {
        setTimeout(pollStatus, 2000);
      }
    };

    pollStatus();
  }, [router, searchParams]);

  const handleResume = async () => {
    setConnecting(true);
    try {
      const res = await getConnectOnboarding();
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        throw new Error('No URL returned');
      }
    } catch (error) {
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
            <p className="text-gray-500 mb-6">Your account is being reviewed by Stripe. Check back later.</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
            >
              Refresh Status
            </button>
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
            <button
              onClick={handleResume}
              disabled={connecting}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {connecting ? 'Loading...' : 'Resume Onboarding'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
