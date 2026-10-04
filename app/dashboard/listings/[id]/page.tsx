'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSellerListing, getListingOwnership } from '@/api/listings';
import { getGatewayListingSource } from '@/api/sellerGateways';
import { useAuthStore } from '@/store/auth';
import GatewayVerificationFlow from '@/components/listings/GatewayVerificationFlow';

type OwnedListing = Awaited<ReturnType<typeof getSellerListing>>;

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAuthenticated, hydrated } = useAuthStore();
  const [listing, setListing] = useState<OwnedListing | null>(null);
  const [gateway, setGateway] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !user) return;
    let current = true;
    setState('loading'); setListing(null); setGateway(false);
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
        setListing(owned); setGateway(source?.type === 'gateway'); setState('ready');
      } catch (cause) {
        if (!current) return;
        const status = (cause as { response?: { status?: number } })?.response?.status;
        setState(status === 404 || status === 403 ? 'unavailable' : 'error');
      }
    }
    void load();
    return () => { current = false; };
  }, [hydrated, isAuthenticated, user, id, retry]);
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
  </div>;
}
