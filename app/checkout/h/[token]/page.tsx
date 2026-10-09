import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { checkoutDomainEnabled } from '@/lib/checkout-domain';
import CheckoutHandoffReview from './CheckoutHandoffReview';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default function CheckoutHandoffPage() {
  if (!checkoutDomainEnabled()) notFound();
  return <Suspense fallback={<main role="status">Loading checkout…</main>}><CheckoutHandoffReview /></Suspense>;
}
