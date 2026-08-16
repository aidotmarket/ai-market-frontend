'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { createCheckout } from '@/api/checkout';
import { getMyOrders } from '@/api/orders';
import { formatPrice } from '@/lib/format';
import { useTermsGate } from '@/components/legal/TermsGate';
import type { BuyerOrder } from '@/types';
import { AxiosError } from 'axios';

interface BuyButtonProps {
  listingId: string;
  sellerId: string;
  slug: string;
  price: number;
  pricingType: string;
  versionId?: string;
  versionLabel?: string;
  accessWindowDays?: number | null;
  disabledReason?: string;
}

export default function BuyButton({
  listingId,
  sellerId,
  slug,
  price,
  pricingType,
  versionId,
  versionLabel,
  accessWindowDays,
  disabledReason,
}: BuyButtonProps) {
  const { user, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [purchasedOrder, setPurchasedOrder] = useState<BuyerOrder | null>(null);
  const [checkingPurchase, setCheckingPurchase] = useState(false);
  const inflightRef = useRef<string | null>(null);
  const { ensureTermsAccepted, TermsGatePrompt, checkingTerms } = useTermsGate();

  // Check if user already purchased this listing
  useEffect(() => {
    if (!isAuthenticated || !user || user.id === sellerId) return;

    let cancelled = false;
    setCheckingPurchase(true);

    getMyOrders()
      .then((orders) => {
        if (cancelled) return;
        const match = orders.find(
          (o) => o.listing_id === listingId && (o.status === 'fulfilled' || o.status === 'pending_fulfillment')
        );
        if (match) setPurchasedOrder(match);
      })
      .catch(() => {
        // Silently fail - not critical
      })
      .finally(() => {
        if (!cancelled) setCheckingPurchase(false);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, user, sellerId, listingId]);

  // Unauthenticated: redirect to login
  if (!isAuthenticated) {
    if (disabledReason) {
      return <DisabledBuyButton price={price} reason={disabledReason} />;
    }

    return (
      <SignedOutPurchase
        slug={slug}
        price={price}
        pricingType={pricingType}
        versionLabel={versionLabel}
        accessWindowDays={accessWindowDays}
      />
    );
  }

  // Seller viewing own listing
  if (user?.id === sellerId) {
    return (
      <div className="rounded-lg bg-[#E8EAF6] border border-[#C5CAE9] px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-[#3F51B5] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-[#303F9F]">This is your listing</p>
        </div>
      </div>
    );
  }

  // Already purchased
  if (purchasedOrder) {
    return (
      <Link
        href={`/dashboard/orders/${purchasedOrder.id}`}
        className="block w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white text-center hover:bg-green-700"
      >
        Access Data
      </Link>
    );
  }

  const startCheckout = async () => {
    if (disabledReason) return;
    // Dedupe guard: ignore if same listing checkout is in-flight
    const inflightKey = `${listingId}:${versionId ?? 'latest'}`;
    if (inflightRef.current === inflightKey) return;

    setLoading(true);
    inflightRef.current = inflightKey;

    try {
      const { checkout_url } = await createCheckout(listingId, versionId);

      // Validate Stripe URL before redirect (AG-G2-M4)
      if (!checkout_url.startsWith('https://checkout.stripe.com/')) {
        toast('Invalid checkout URL received. Please try again.', 'error');
        return;
      }

      window.location.href = checkout_url;
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to start checkout. Please try again.', 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setLoading(false);
      inflightRef.current = null;
    }
  };

  const handleBuy = async () => {
    await ensureTermsAccepted(startCheckout);
  };

  return (
    <div>
      <TermsGatePrompt />
      <button
        onClick={handleBuy}
        disabled={loading || checkingPurchase || checkingTerms || !!disabledReason}
        className="w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {loading || checkingTerms ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {checkingTerms ? 'Checking terms...' : 'Opening Stripe…'}
          </>
        ) : (
          `Buy Now - ${formatPrice(price)}`
        )}
      </button>
      {disabledReason && (
        <p className="text-xs text-gray-500 mt-2 text-center">{disabledReason}</p>
      )}
      <p className="text-xs text-gray-500 mt-2 text-center">
        {pricingType === 'subscription' ? 'Subscription' : 'One-time purchase'}
      </p>
    </div>
  );
}

export function SignedOutPurchase({
  slug,
  price,
  pricingType,
  versionLabel,
  accessWindowDays,
}: Pick<BuyButtonProps, 'slug' | 'price' | 'pricingType' | 'versionLabel' | 'accessWindowDays'>) {
  const returnPath = `/listings/${encodeURIComponent(slug)}`;
  const encodedReturnPath = encodeURIComponent(returnPath);
  const purchaseType = pricingType === 'subscription'
    ? 'Subscription'
    : pricingType === 'both'
      ? 'One-time or subscription'
      : 'One-time purchase';

  return (
    <div>
      <Link
        href={`/login?redirect=${returnPath}`}
        className="block w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white text-center hover:bg-[#3545a0]"
      >
        Buy Now - {formatPrice(price)}
      </Link>
      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-600">
        <p>
          Sign in or{' '}
          <Link
            href={`/register?redirect=${encodedReturnPath}`}
            className="font-medium text-[#3F51B5] underline underline-offset-2"
          >
            create an account
          </Link>{' '}
          to continue.
        </p>
        <p className="mt-2">
          After signing in, you will return here to review the checkout details and choose whether to confirm. Following the sign-in link does not charge you.
        </p>
        <dl className="mt-3 space-y-1 border-t border-gray-200 pt-3" aria-label="Purchase preview">
          <div className="flex justify-between gap-3">
            <dt>Listing price</dt>
            <dd className="font-medium text-gray-900">{formatPrice(price)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Purchase type</dt>
            <dd className="font-medium text-gray-900">{purchaseType}</dd>
          </div>
          {versionLabel && (
            <div className="flex justify-between gap-3">
              <dt>Selected version</dt>
              <dd className="font-medium text-gray-900">{versionLabel}</dd>
            </div>
          )}
          {accessWindowDays != null && (
            <div className="flex justify-between gap-3">
              <dt>Download window</dt>
              <dd className="font-medium text-gray-900">
                {accessWindowDays} day{accessWindowDays === 1 ? '' : 's'} after purchase
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function DisabledBuyButton({ price, reason }: { price: number; reason: string }) {
  return (
    <div>
      <button
        type="button"
        disabled
        className="w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white opacity-50"
      >
        Buy Now - {formatPrice(price)}
      </button>
      <p className="text-xs text-gray-500 mt-2 text-center">{reason}</p>
    </div>
  );
}
