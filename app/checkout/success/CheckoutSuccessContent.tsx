'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { verifyCheckout } from '@/api/checkout';
import { formatPrice } from '@/lib/format';
import type { CheckoutVerifyResponse } from '@/types';

type PageState = 'verifying' | 'success' | 'timeout' | 'error';

const POLL_INTERVAL = 2000;
const MAX_POLL_DURATION = 30000;

export default function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [state, setState] = useState<PageState>('verifying');
  const [result, setResult] = useState<CheckoutVerifyResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    if (!mountedRef.current || !sessionId) return;

    // Wall-clock timeout
    if (Date.now() - startTimeRef.current > MAX_POLL_DURATION) {
      setState('timeout');
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const data = await verifyCheckout(sessionId, abortRef.current.signal);

      if (!mountedRef.current) return;

      if (data.status === 'completed') {
        setResult(data);
        setState('success');
        return;
      }

      // Still pending — schedule next poll
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        poll();
      }, POLL_INTERVAL);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMessage("We couldn't verify this payment session.");
      setState('error');
    }
  }, [sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    startTimeRef.current = Date.now();

    if (!sessionId) {
      setErrorMessage('No session ID provided.');
      setState('error');
      return;
    }

    poll();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Resume: if still verifying and no timer pending, poll immediately
        if (mountedRef.current && timerRef.current === null) {
          poll();
        }
      } else {
        // Pause: clear scheduled poll
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sessionId, poll]);

  if (state === 'verifying') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-6"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Verifying your payment…</h1>
          <p className="text-gray-500">This usually takes just a few seconds.</p>
        </div>
      </div>
    );
  }

  if (state === 'success' && result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-6">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful</h1>
          {result.listing_title && (
            <p className="text-gray-600 mb-1">{result.listing_title}</p>
          )}
          {result.amount != null && (
            <p className="text-lg font-semibold text-gray-900 mb-1">{formatPrice(result.amount)}</p>
          )}
          {result.tx_number && (
            <p className="text-sm font-mono text-gray-600 mb-1">{result.tx_number}</p>
          )}
          {result.order_id && (
            <p className="text-sm text-gray-500 mb-6">Order #{result.order_id.slice(0, 8)}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {result.order_id && (
              <Link
                href={`/dashboard/orders/${result.order_id}${result.transaction_id ? `?tx=${result.transaction_id}` : ''}`}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                View Order
              </Link>
            )}
            <Link
              href="/listings"
              className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Browse More Datasets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'timeout') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 mb-6">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment is being processed</h1>
          <p className="text-gray-600 mb-2">
            Your payment was received and is being processed. This may take a minute.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            This page is safe to close — we&apos;ll email you when your order is ready.
          </p>
          <Link
            href="/dashboard/orders"
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Check My Orders
          </Link>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-6">
          <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification failed</h1>
        <p className="text-gray-600 mb-6">{errorMessage}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard/orders"
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Check My Orders
          </Link>
          <a
            href="mailto:support@ai.market"
            className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
