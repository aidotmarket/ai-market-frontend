'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getListingOwnership } from '@/api/listings';
import { getMyOrders } from '@/api/orders';
import { isExistingPurchaseStatus } from '@/lib/order-status';
import { requestUsdcPayment } from '@/lib/api';

interface Props {
  listingId: string;
  slug: string;
  title: string;
  pricing: { price: number; currency?: string };
}

export default function UsdcLargePurchaseRequest(props: Props) {
  const { user, isAuthenticated, hydrated, isLoading } = useAuthStore();
  // Listing prices are dollar amounts and formatPrice uses fixed USD.
  if ((props.pricing.currency ?? 'USD') !== 'USD' || !Number.isFinite(props.pricing.price) || props.pricing.price < 10000) return null;
  if (!hydrated || isLoading) return null;

  return <RequestControl key={`${props.listingId}:${isAuthenticated ? user?.id : 'anonymous'}`} {...props}
    userId={isAuthenticated ? user?.id : undefined} isAuthenticated={isAuthenticated} />;
}

function RequestControl({ listingId, slug, title, pricing, userId, isAuthenticated }: Props & {
  userId?: string;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [ownership, setOwnership] = useState<'checking' | 'owner' | 'not-owner' | 'error'>('checking');
  const [purchase, setPurchase] = useState<'checking' | 'existing' | 'none' | 'error'>('checking');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const sending = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let cancelled = false;
    // Eligibility requires a successful lookup; a pending or failed check never grants access.
    getListingOwnership(listingId).then(isOwner => {
      if (!cancelled) setOwnership(isOwner === false ? 'not-owner' : 'owner');
    }).catch(() => {
      if (!cancelled) setOwnership('error');
    });
    return () => { cancelled = true; };
  }, [listingId, userId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !userId || ownership !== 'not-owner') return;
    let cancelled = false;
    getMyOrders().then(orders => {
      if (!cancelled) setPurchase(orders.some(order => order.listing_id === listingId && isExistingPurchaseStatus(order.status)) ? 'existing' : 'none');
    }).catch(() => {
      if (!cancelled) setPurchase('error');
    });
    return () => { cancelled = true; };
  }, [listingId, userId, isAuthenticated, ownership]);

  const eligible = !!userId && ownership === 'not-owner' && purchase === 'none';
  if (isAuthenticated && !eligible) return null;

  const request = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/listings/${encodeURIComponent(slug)}`);
      return;
    }
    if (!eligible || sending.current || status === 'sent') return;
    sending.current = true;
    setStatus('sending');
    try {
      await requestUsdcPayment(listingId, slug, title, pricing.price);
      setStatus('sent');
    } catch {
      setStatus('error');
    } finally {
      sending.current = false;
    }
  };

  return <div className="mt-4 space-y-3 text-sm text-gray-600">
    <p>Buying for $10,000 or more? You can ask to pay in USDC on Solana.</p>
    {status === 'sent' ? <p role="status">Thanks. We will email you to arrange payment.</p> : <button
      type="button"
      onClick={request}
      disabled={status === 'sending'}
      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >Request USDC payment</button>}
    {status === 'error' && <p role="alert">We couldn&apos;t send your request. Please try again.</p>}
  </div>;
}
