'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { verifyCheckout } from '@/api/checkout';
import { formatPrice } from '@/lib/format';
import type { CheckoutVerifyResponse } from '@/types';

type PageState = 'verifying' | 'success' | 'expired' | 'timeout' | 'error';

const POLL_INTERVAL = 2000;
const MAX_POLL_DURATION = 30000;

export default function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  // A query change retires the entire previous visit, including its displayed result.
  return <SessionOutcome key={sessionId} sessionId={sessionId} />;
}

function SessionOutcome({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<PageState>('verifying');
  const [result, setResult] = useState<CheckoutVerifyResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Each effect setup owns its callbacks. Cleanup can never be reversed by a
    // later visit or StrictMode setup, even if a read ignores client cancellation.
    let retired = false;
    let terminal = false;
    let inFlight = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const deadline = Date.now() + MAX_POLL_DURATION;

    const finish = (outcome: PageState) => {
      if (retired || terminal) return;
      terminal = true;
      clearTimeout(pollTimer);
      clearTimeout(deadlineTimer);
      setState(outcome);
    };
    const timeout = () => {
      finish('timeout');
      // Cancels only the client read; it says nothing about server/provider work.
      controller?.abort();
    };
    const poll = async () => {
      if (retired || terminal || inFlight) return;
      if (Date.now() >= deadline) {
        timeout();
        return;
      }
      inFlight = true;
      controller = new AbortController();
      try {
        const data = await verifyCheckout(sessionId!, controller.signal);
        if (retired || terminal) return;
        if (Date.now() >= deadline) {
          timeout();
          return;
        }
        if (data.status === 'completed') {
          setResult(data);
          finish('success');
        } else if (data.status === 'expired') {
          finish('expired');
        } else if (document.visibilityState === 'visible') {
          pollTimer = setTimeout(() => {
            pollTimer = undefined;
            void poll();
          }, POLL_INTERVAL);
        }
      } catch (err: unknown) {
        if (retired || terminal) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorMessage("We couldn't verify this payment session.");
        finish('error');
      } finally {
        inFlight = false;
      }
    };
    const handleVisibility = () => {
      if (retired || terminal) return;
      if (document.visibilityState === 'visible') {
        if (pollTimer === undefined) void poll();
      } else {
        clearTimeout(pollTimer);
        pollTimer = undefined;
      }
    };

    if (!sessionId) {
      setErrorMessage('No session ID provided.');
      finish('error');
    } else {
      deadlineTimer = setTimeout(timeout, MAX_POLL_DURATION);
      void poll();
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      retired = true;
      clearTimeout(pollTimer);
      clearTimeout(deadlineTimer);
      controller?.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sessionId]);

  if (state === 'verifying') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent mb-6"></div>
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
                className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
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

  if (state === 'timeout' || state === 'expired') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E8EAF6] mb-6">
            <svg className="h-8 w-8 text-[#3F51B5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{state === 'expired' ? 'Checkout session expired' : 'Payment status not yet confirmed'}</h1>
          <p className="text-gray-600 mb-2">
            {state === 'expired'
              ? 'This checkout session has expired. Check your purchases or contact support to confirm your order status.'
              : 'We could not yet confirm your payment status. Check your purchases or contact support for help.'}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Check your purchases or contact support before attempting another checkout.
          </p>
          <Link
            href="/dashboard/orders"
            className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
          >
            Check My Purchases
          </Link>
          <a href="mailto:support@ai.market" className="block mt-4 text-sm text-gray-700 underline">
            Contact Support
          </a>
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
            className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
          >
            Check My Purchases
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
