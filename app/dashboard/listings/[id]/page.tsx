'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSellerListing, getListingOwnership } from '@/api/listings';
import { getGatewayListingSource } from '@/api/sellerGateways';
import { getAwsVerifierStatus, getCloudflareVerifierStatus } from '@/api/dataVerificationGateway';
import { useAuthStore } from '@/store/auth';
import GatewayVerificationFlow from '@/components/listings/GatewayVerificationFlow';

type OwnedListing = Awaited<ReturnType<typeof getSellerListing>>;

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAuthenticated, hydrated } = useAuthStore();
  const [listing, setListing] = useState<OwnedListing | null>(null);
  const [gateway, setGateway] = useState(false);
  const [cloudflareConnectionId, setCloudflareConnectionId] = useState<string | null>(null);
  const [awsConnectionId, setAwsConnectionId] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  // Reload only when the signed-in account changes. A token refresh replaces the
  // user object; reloading then remounted the panel and dropped the seller's click.
  const userId = user?.id;
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !userId) return;
    let current = true;
    setState('loading'); setListing(null); setGateway(false); setAwsConnectionId(null); setCloudflareConnectionId(null);
    async function load() {
      try {
        // Check this listing directly; the inventory endpoint is paginated.
        const isOwner = await getListingOwnership(id);
        if (!current) return;
        if (!isOwner) { setState('unavailable'); return; }
        const owned = await getSellerListing(id);
        if (!current) return;
        const source = await getGatewayListingSource(id);
        if (!current) return;
        if (source?.type !== 'gateway') {
          try {
            const status = await getAwsVerifierStatus(id);
            if (!current) return;
            if (status.eligible && status.connection_id) setAwsConnectionId(status.connection_id);
          } catch {
            // Verification is optional; an unavailable status hides its entry.
            if (!current) return;
          }
          try {
            const status = await getCloudflareVerifierStatus(id);
            if (!current) return;
            if (status.eligible && status.connection_id) setCloudflareConnectionId(status.connection_id);
          } catch {
            if (!current) return;
          }
        }
        setListing(owned); setGateway(source?.type === 'gateway'); setState('ready');
      } catch (cause) {
        if (!current) return;
        const status = (cause as { response?: { status?: number } })?.response?.status;
        setState(status === 404 || status === 403 ? 'unavailable' : 'error');
      }
    }
    void load();
    return () => { current = false; };
  }, [hydrated, isAuthenticated, userId, id, retry]);
  if (!hydrated) return <p>Loading your listing…</p>;
  if (!isAuthenticated || !user) return <p><Link href="/login" className="underline">Sign in</Link> to manage your listing.</p>;
  if (state === 'loading') return <p>Loading your listing…</p>;
  if (state === 'unavailable') return <p>This listing is not available.</p>;
  if (state === 'error') return <><p>We could not load your listing.</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></>;
  return <div className="space-y-6">
    <Link href="/dashboard/listings" className="text-indigo-700 underline">Back to listings</Link>
    <h1 className="text-2xl font-semibold">{listing?.title}</h1>
    <Link href={`/dashboard/listings/${encodeURIComponent(id)}/edit`} className="text-indigo-700 underline">Edit listing</Link>
    {listing?.status === 'published' && gateway && <GatewayVerificationFlow key={`${user.id}:${id}`} listingId={id} sellerId={user.id} />}
    {listing?.status === 'published' && !gateway && !cloudflareConnectionId && awsConnectionId && <GatewayVerificationFlow key={`${user.id}:${id}:${awsConnectionId}`} listingId={id} sellerId={user.id} verifier={{ kind: 'aws', connectionId: awsConnectionId }} />}
    {listing?.status === 'published' && !gateway && cloudflareConnectionId && <GatewayVerificationFlow key={`${user.id}:${id}:${cloudflareConnectionId}`} listingId={id} sellerId={user.id} verifier={{ kind: 'cloudflare', connectionId: cloudflareConnectionId }} />}
  </div>;
}
