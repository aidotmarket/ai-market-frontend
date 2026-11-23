'use client';

import { ExplainEntry, explainControl, isExplainId, useExplainPage } from '@/components/allai/ExplainContext';

import { use, useEffect, useState } from 'react';
import type { AxiosRequestConfig } from 'axios';
import Link from 'next/link';
import { getSellerListing, getListingOwnership } from '@/api/listings';
import { getGatewayListingSource } from '@/api/sellerGateways';
import { getAwsVerifierStatus, getCloudflareVerifierStatus } from '@/api/dataVerificationGateway';
import { useAuthStore } from '@/store/auth';
import GatewayVerificationFlow from '@/components/listings/GatewayVerificationFlow';

type OwnedListing = Awaited<ReturnType<typeof getSellerListing>>;
type VerifierStatus = { state: 'loading' | 'unavailable'; connectionId?: never } | { state: 'ready'; connectionId: string | null };
const OPTIONAL_STATUS_TIMEOUT_MS = 10_000;

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAuthenticated, hydrated } = useAuthStore();
  const [listing, setListing] = useState<OwnedListing | null>(null);
  const [sourceState, setSourceState] = useState<'loading' | 'gateway' | 'other' | 'unavailable'>('loading');
  const [cloudflareStatus, setCloudflareStatus] = useState<VerifierStatus>({ state: 'loading' });
  const [awsStatus, setAwsStatus] = useState<VerifierStatus>({ state: 'loading' });
  const [loadOwner, setLoadOwner] = useState<{ id: string; userId: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  // Reload only when the signed-in account changes. A token refresh replaces the
  // user object; reloading then remounted the panel and dropped the seller's click.
  const userId = user?.id;
  useExplainPage(state === 'ready' && isAuthenticated && loadOwner?.userId === userId && loadOwner?.id === id
    && isExplainId(id) ? {
      route: `/dashboard/listings/${id}`,
      scope: 'owner-listing',
      targets: { listing_status: { kind: 'listing', listing_id: id } },
      actions: { view_listing: () => explainControl('view_listing')?.focus(), view_listings: () => explainControl('view_listings')?.focus() },
    } : null);
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !userId) return;
    let current = true;
    const cleanups: (() => void)[] = [];
    setLoadOwner({ id, userId });
    setState('loading'); setListing(null); setSourceState('loading');
    setAwsStatus({ state: 'loading' }); setCloudflareStatus({ state: 'loading' });

    function optional<T>(request: (options: Pick<AxiosRequestConfig, 'timeout' | 'signal'>) => Promise<T>, apply: (data: T) => void, unavailable: () => void) {
      const controller = new AbortController();
      let pending = true;
      function finish() {
        if (!current || !pending) return false;
        pending = false;
        clearTimeout(timer);
        return true;
      }
      // Axios bounds the request; this deadline also bounds interceptor/refresh
      // waits. Late results cannot restore eligibility after timeout or cleanup.
      const timer = setTimeout(() => {
        if (!finish()) return;
        controller.abort();
        unavailable();
      }, OPTIONAL_STATUS_TIMEOUT_MS);
      cleanups.push(() => { pending = false; clearTimeout(timer); controller.abort(); });
      void request({ timeout: OPTIONAL_STATUS_TIMEOUT_MS, signal: controller.signal }).then(
        data => { if (finish()) apply(data); },
        () => { if (finish()) unavailable(); },
      );
    }

    async function load() {
      try {
        // Check this listing directly; the inventory endpoint is paginated.
        const isOwner = await getListingOwnership(id);
        if (!current) return;
        if (!isOwner) { setState('unavailable'); return; }
        const owned = await getSellerListing(id);
        if (!current) return;
        setListing(owned); setState('ready');
        optional(options => getGatewayListingSource(id, options), source => {
          setSourceState(source?.type === 'gateway' ? 'gateway' : 'other');
          if (source?.type === 'gateway') return;
          optional(options => getAwsVerifierStatus(id, options), status => {
            setAwsStatus({ state: 'ready', connectionId: status.eligible === true && status.connection_id ? status.connection_id : null });
          }, () => setAwsStatus({ state: 'unavailable' }));
          optional(options => getCloudflareVerifierStatus(id, options), status => {
            setCloudflareStatus({ state: 'ready', connectionId: status.eligible === true && status.connection_id ? status.connection_id : null });
          }, () => setCloudflareStatus({ state: 'unavailable' }));
        }, () => setSourceState('unavailable'));
      } catch (cause) {
        if (!current) return;
        const status = (cause as { response?: { status?: number } })?.response?.status;
        setState(status === 404 || status === 403 ? 'unavailable' : 'error');
      }
    }
    void load();
    return () => { current = false; cleanups.forEach(cleanup => cleanup()); };
  }, [hydrated, isAuthenticated, userId, id, retry]);
  if (!hydrated) return <p>Loading your listing…</p>;
  if (!isAuthenticated || !user) return <p><Link href="/login" className="underline">Sign in</Link> to manage your listing.</p>;
  if (state === 'loading' || loadOwner?.id !== id || loadOwner.userId !== userId) return <p>Loading your listing…</p>;
  if (state === 'unavailable') return <p>We could not find a listing you can manage here. Open Your listings to choose another listing. <Link href="/dashboard/listings" className="underline">Your listings</Link></p>;
  if (state === 'error') return <><p>We could not load your listing just now. Try again, or contact support if it keeps happening.</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></>;
  return <div className="space-y-6">
    <Link data-explain-control="view_listings" href="/dashboard/listings" className="text-indigo-700 underline">Back to listings</Link>
    <h1 data-explain-control="view_listing" tabIndex={-1} className="text-2xl font-semibold">{listing?.title}</h1>
    <ExplainEntry question="listing_status" />
    <p className="text-sm text-gray-600">Your private owner view remains available when this listing is not public.</p>
    <Link href={`/dashboard/listings/${encodeURIComponent(id)}/edit`} className="text-indigo-700 underline">Edit listing</Link>
    {listing?.status === 'published' && <>
      {sourceState === 'loading' && <p role="status">Loading verification availability…</p>}
      {sourceState === 'unavailable' && <div><p role="status">We could not check whether this listing can be verified. Try again, or contact support if it keeps happening.</p><button className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
      {sourceState === 'gateway' && <GatewayVerificationFlow key={`${user.id}:${id}`} listingId={id} sellerId={user.id} />}
      {sourceState === 'other' && <>
        {awsStatus.state === 'loading' && <p role="status">Loading AWS verification status…</p>}
        {awsStatus.state === 'unavailable' && <div><p role="status">We could not check your AWS data verification status. Try again, or contact support if it keeps happening.</p><button className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
        {cloudflareStatus.state === 'loading' && <p role="status">Loading Cloudflare verification status…</p>}
        {cloudflareStatus.state === 'unavailable' && <div><p role="status">We could not check your Cloudflare data verification status. Try again, or contact support if it keeps happening.</p><button className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
        {/* Cloudflare takes precedence; unknown Cloudflare status must not select AWS. */}
        {cloudflareStatus.state === 'ready' && !cloudflareStatus.connectionId && awsStatus.connectionId && <GatewayVerificationFlow key={`${user.id}:${id}:${awsStatus.connectionId}`} listingId={id} sellerId={user.id} verifier={{ kind: 'aws', connectionId: awsStatus.connectionId }} />}
        {cloudflareStatus.connectionId && <GatewayVerificationFlow key={`${user.id}:${id}:${cloudflareStatus.connectionId}`} listingId={id} sellerId={user.id} verifier={{ kind: 'cloudflare', connectionId: cloudflareStatus.connectionId }} />}
      </>}
    </>}
  </div>;
}
