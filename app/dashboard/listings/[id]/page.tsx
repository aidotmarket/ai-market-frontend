'use client';

import { use, useEffect, useState } from 'react';
import type { AxiosRequestConfig } from 'axios';
import Link from 'next/link';
import { getSellerListing, getListingOwnership } from '@/api/listings';
import { getGatewayListingSource } from '@/api/sellerGateways';
import { getAwsVerifierStatus, getCloudflareVerifierStatus } from '@/api/dataVerificationGateway';
import { useAuthStore } from '@/store/auth';
import GatewayVerificationFlow from '@/components/listings/GatewayVerificationFlow';
import { primaryButtonClass, secondaryButtonClass } from '@/components/ui/button-styles';
import { formatDate, formatPrice } from '@/lib/format';
import { formatBytes } from '@/lib/formatBytes';
import { readLicenseDisplay } from '@/lib/publicPresentation';
import { listingStatus } from '../listing-status';

type OwnedListing = Awaited<ReturnType<typeof getSellerListing>>;
type VerifierStatus = { state: 'loading' | 'unavailable'; connectionId?: never } | { state: 'ready'; connectionId: string | null };
const OPTIONAL_STATUS_TIMEOUT_MS = 10_000;

const nextSteps: Record<string, string> = {
  draft: 'Finish your draft in the editor.',
  unlisted: 'Open the editor to publish this listing.',
};

function ListingOverview({ listing, id }: { listing: OwnedListing; id: string }) {
  const status = listingStatus(listing.status);
  const nextStep = Object.hasOwn(nextSteps, listing.status) ? nextSteps[listing.status] : 'Open the editor to review your listing.';
  const summary = listing.at_a_glance;
  const count = listing.raw_metadata?.object_count;
  const summarySize = summary?.size_bytes;
  const size = listing.raw_metadata?.file_size_bytes ?? (summarySize?.provenance !== 'absent' ? summarySize?.value : null);
  const summaryLicence = summary?.license;
  const licence = readLicenseDisplay(listing.license_display)?.license_label ??
    (summaryLicence?.provenance !== 'absent' ? summaryLicence?.value : null);
  const updated = listing.updated_at;

  return (
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="owner-listing-title">
      <div>
        <h1 id="owner-listing-title" className="text-2xl font-semibold text-gray-900 [overflow-wrap:anywhere]">{listing.title || 'Listing title unavailable'}</h1>
        <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold [overflow-wrap:anywhere] ${status.style}`}>{status.label}</span>
        <p className="mt-2 text-sm text-gray-700">{nextStep}</p>
      </div>
      <dl className="grid gap-4 border-t border-gray-100 pt-4 text-sm [overflow-wrap:anywhere] sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-semibold text-gray-900">Files</dt>
          <dd className="mt-1 text-gray-700">{typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count.toLocaleString('en-US') : 'Count unavailable'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-900">Total size</dt>
          <dd className="mt-1 text-gray-700">{typeof size === 'number' && Number.isFinite(size) && size >= 0 ? formatBytes(size) : 'Size unavailable'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-900">Price</dt>
          <dd className="mt-1 text-gray-700">{typeof listing.price === 'number' && Number.isFinite(listing.price) ? formatPrice(listing.price) : 'Price unavailable'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-900">Licence</dt>
          <dd className="mt-1 text-gray-700">{typeof licence === 'string' && licence.trim() ? licence : 'Licence unavailable'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-900">Last updated</dt>
          <dd className="mt-1 text-gray-700">{typeof updated === 'string' && Number.isFinite(Date.parse(updated)) ? formatDate(updated) : 'Update date unavailable'}</dd>
        </div>
      </dl>
      <Link href={`/dashboard/listings/${encodeURIComponent(id)}/edit`} className={primaryButtonClass}>Edit listing</Link>
    </section>
  );
}

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
  if (state === 'error' || !listing) return <><p>We could not load your listing just now. Try again, or contact support if it keeps happening.</p><button className={secondaryButtonClass} onClick={() => setRetry(value => value + 1)}>Try again</button></>;
  return <div className="space-y-6">
    <p><Link href="/dashboard/listings" className="text-indigo-700 underline">Back to listings</Link></p>
    <ListingOverview listing={listing} id={id} />
    {listing.status === 'published' && <>
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
