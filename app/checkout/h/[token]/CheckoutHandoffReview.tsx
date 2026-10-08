'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { checkoutReplayKey, clearCheckoutReplay } from '@/lib/checkout-replay';
import { useSessionGeneration } from '@/hooks/useSessionGeneration';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getCheckoutHandoff, type CheckoutHandoff } from '@/api/checkout';
import { getListing } from '@/api/listings';
import BuyButton, { parseCheckoutRefusal } from '@/components/BuyButton';
import { checkoutDomainEnabled, paymentUrl, validHandoffToken } from '@/lib/checkout-domain';
import { isListingLicenseDetails } from '@/lib/listingLicense';
import type { ListingDetail } from '@/types';
import { AxiosError } from 'axios';

export default function CheckoutHandoffReview() {
  const { token } = useParams<{ token: string }>();
  const { user, token: accessToken, hydrated, isLoading } = useAuthStore();
  const enabled = checkoutDomainEnabled();
  const valid = validHandoffToken(token);
  const sessionGeneration = useSessionGeneration(accessToken);
  const identity = `${user?.id || ''}:${sessionGeneration}:${token}`;
  const [review, setReview] = useState<{ identity: string; handoff: CheckoutHandoff; listing: ListingDetail | null } | null>(null);
  const [error, setError] = useState<{ identity: string; cause: unknown } | null>(null);
  const [reload, setReload] = useState(0);
  const [expiryCheck, setExpiryCheck] = useState<{ identity: string; failed: boolean } | null>(null);
  const [purchaseStarted, setPurchaseStarted] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled || !valid || !hydrated || isLoading || !accessToken || !user) return;
    let active = true;
    setReview(previous => previous?.identity === identity ? previous : null);
    setError(null);
    setExpiryCheck(null);
    // Inspection never accepts a licence or starts a purchase.
    getCheckoutHandoff(token).then(async inspected => {
      let handoff = inspected;
      const listing = handoff.status === 'open' && Date.parse(handoff.expires_at) > Date.now()
        ? await getListing(encodeURIComponent(handoff.listing_id)) : null;
      if (handoff.status === 'open' && Date.parse(handoff.expires_at) <= Date.now()) {
        handoff = await getCheckoutHandoff(token);
      }
      if (active) {
        setNow(Date.now()); setReview({ identity, handoff, listing });
      }
    }).catch(cause => { if (active) setError({ identity, cause }); });
    return () => { active = false; };
  }, [enabled, valid, hydrated, isLoading, accessToken, user, token, identity, reload]);
  const data = review?.identity === identity ? review : null;
  const failure = error?.identity === identity ? error : null;
  useEffect(() => {
    const handoff = data?.handoff;
    if (user && handoff?.status === 'consumed'
      && ['finalised', 'failed', 'payment_conflict', 'refunded'].includes(handoff.checkout_status || '')) {
      clearCheckoutReplay(checkoutReplayKey(user.id, handoff.listing_id, handoff.version_id, token));
    }
  }, [data, user, token]);
  useEffect(() => {
    if (data?.handoff.status !== 'open') return;
    const remaining = Date.parse(data.handoff.expires_at) - Date.now();
    if (remaining <= 0) return;
    let active = true;
    const timer = setTimeout(async () => {
      setExpiryCheck({ identity, failed: false });
      try {
        // An open inspection may now be consumed. Its original expiry is not authoritative.
        const handoff = await getCheckoutHandoff(token);
        if (active) {
          setNow(Date.now());
          setReview({ ...data, handoff });
          setExpiryCheck(null);
        }
      } catch {
        if (active) setExpiryCheck({ identity, failed: true });
      }
    }, Math.min(remaining, 2_147_483_647));
    return () => { active = false; clearTimeout(timer); };
  }, [data, identity, token]);
  const path = `/checkout/h/${token}`;
  const status = (failure?.cause as { response?: { status?: number } })?.response?.status;
  const refusal = failure?.cause instanceof AxiosError ? parseCheckoutRefusal(failure.cause) : null;
  let content;
  if (!enabled || !valid) content = <><h1>Checkout link unavailable</h1><p>Return to the listing to review checkout.</p></>;
  else if (!hydrated || isLoading) content = <p role="status">Loading checkout…</p>;
  else if (!user || !accessToken || status === 401) content = <><h1>Review checkout</h1><Link href={`/login?redirect=${encodeURIComponent(path)}`} prefetch={false}>Sign in to review checkout</Link></>;
  else if (failure && (!data || status === 403 || status === 404)) content = <><h1>Checkout link unavailable</h1><p role="alert">{refusal?.message || 'Return to the listing or try again later.'}</p>
    {refusal?.webPath && <Link href={refusal.webPath}>Review listing</Link>}</>;
  else if (!data) content = <p role="status">Loading checkout…</p>;
  else {
    const { handoff, listing } = data;
    if (handoff.status === 'consumed') {
      const finalised = handoff.checkout_status === 'finalised';
      const processing = handoff.checkout_status === 'reserved' || handoff.checkout_status === 'provider_unknown';
      content = <><h1>Checkout {finalised ? 'started' : handoff.checkout_status === 'failed' ? 'failed' : handoff.checkout_status === 'refunded' ? 'refunded' : handoff.checkout_status === 'payment_conflict' ? 'needs review' : 'processing'}</h1>
        {processing && <><p role="status">Checkout is processing. Check its status before continuing.</p><button onClick={() => setReload(value => value + 1)}>Check checkout status</button></>}
        {handoff.checkout_status === 'payment_conflict' && <p role="alert">A payment is being reconciled. This cancelled order will not be fulfilled.</p>}
        {finalised && paymentUrl(handoff.checkout_url) && <a href={handoff.checkout_url} rel="noreferrer" referrerPolicy="no-referrer">Continue to payment</a>}
        {handoff.order_id && <Link href={`/dashboard/orders/${encodeURIComponent(handoff.order_id)}`}>View order</Link>}</>;
    } else if (handoff.status !== 'open' || Date.parse(handoff.expires_at) <= now || !listing) {
      content = <><h1>Checkout link expired or replaced</h1><p>Return to the listing to start a new checkout.</p></>;
    } else {
      const license = isListingLicenseDetails(listing.license) ? listing.license : undefined;
      if (!license || listing.id !== handoff.listing_id || license.sha256 !== handoff.license_sha256
        || license.covenant_sha256 !== handoff.covenant_sha256 || license.rider_sha256 !== handoff.rider_sha256
        || Math.round(listing.pricing.price * 100) !== handoff.price_cents) {
        content = <><h1>The terms changed</h1><Link href={`/listings/${encodeURIComponent(listing.slug)}`}>Review the current listing</Link></>;
      } else content = <><h1 className="text-2xl font-semibold">Review checkout for {listing.title}</h1>
        <p>{handoff.currency} {(handoff.price_cents / 100).toFixed(2)}</p>
        <p>Review the licence and confirm your authority before continuing to payment.</p>
        <BuyButton key={identity} listingId={listing.id} slug={listing.slug} price={listing.pricing.price}
          pricingType={listing.pricing.pricing_type} versionId={handoff.version_id} licenseDetails={license}
          checkoutContext={{ handoffToken: token }} onCheckoutStarted={() => setPurchaseStarted(identity)}
          disabledReason={(expiryCheck?.identity === identity ? 'Checking checkout status before starting a purchase.' : undefined) || listing.purchase_hold_reason || (!listing.purchasable ? 'This listing is currently unavailable for purchase.' : undefined)} /></>;
    }
  }
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-12">{failure && data && status !== 401 && status !== 403 && status !== 404
    && <p role="alert">Could not refresh checkout status. Retry the status check.</p>}
    {expiryCheck?.identity === identity && <div role={expiryCheck.failed ? 'alert' : 'status'}>
    {expiryCheck.failed ? 'Could not check checkout status. Retry the status check.' : 'Checking checkout status…'}
    {purchaseStarted === identity && <p>Your purchase may have started. Keep checking the same checkout.</p>}
    {expiryCheck.failed && <button onClick={() => setReload(value => value + 1)}>Check checkout status</button>}
  </div>}{content}</main>;
}
