'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getMyListings, getPendingSellerTermsListings, unpublishListing, deleteListing } from '@/api/listings';
import { getConnectStatus } from '@/api/connect';
import { useToast } from '@/components/Toast';
import SellerShareControls from '@/components/listings/SellerShareControls';
import { useTermsGate } from '@/components/legal/TermsGate';
import { useServedTermsVersion } from '@/components/legal/VersionedTermsCopy';
import { formatPrice, formatDate } from '@/lib/format';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  enhanced: 'bg-purple-100 text-purple-800',
  published: 'bg-green-100 text-green-800',
  unlisted: 'bg-orange-100 text-orange-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  enhanced: 'Enhanced',
  published: 'Published',
  unlisted: 'Unlisted',
  pending_review: 'Pending Review',
  suspended: 'Suspended',
  archived: 'Archived',
};

function isPublicReference(metadata: unknown): boolean {
  return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
    && Object.prototype.hasOwnProperty.call(metadata, 'public_reference');
}

const PAGE_SIZE = 20;

export default function ListingsPage() {
  const { user, hydrated, isAuthenticated, isLoading } = useAuthStore();
  if (!hydrated || isLoading || !isAuthenticated || !user?.id) {
    return <p role="status">Loading listings...</p>;
  }
  // Existing layout owns seller admission. Retire page work when auth admission
  // or the principal changes, without introducing another capability policy.
  return <OwnerListings key={user.id} userId={user.id} />;
}

function OwnerListings({ userId }: { userId: string }) {
  const termsVersion = useServedTermsVersion();
  const [listings, setListings] = useState<any[]>([]);
  const [pendingTermsCount, setPendingTermsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [payoutsStatus, setPayoutsStatus] = useState<'unknown' | 'enabled' | 'disabled'>('unknown');
  const router = useRouter();
  const { toast } = useToast();
  const { ensureTermsAccepted, TermsGatePrompt, checkingTerms } = useTermsGate('seller');

  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const busy = useRef(false);
  const mutating = useRef(false);
  const pageOffset = useRef(0);
  const isCurrent = useCallback((request: number) => {
    const auth = useAuthStore.getState();
    return mounted.current && sequence.current === request &&
      auth.user?.id === userId && auth.hydrated && auth.isAuthenticated && !auth.isLoading;
  }, [userId]);

  const fetchListings = useCallback(async (target: number) => {
    const request = ++sequence.current;
    busy.current = true;
    pageOffset.current = target;
    setOffset(target);
    setDeleteConfirm(null);
    setLoading(true);
    setError('');
    const [listingsRes, connectRes, pendingRes] = await Promise.allSettled([
      getMyListings({ skip: target, limit: PAGE_SIZE + 1 }),
      getConnectStatus(),
      getPendingSellerTermsListings(),
    ]);
    if (!isCurrent(request)) return;
    if (listingsRes.status === 'fulfilled') {
      const rows = listingsRes.value.data || [];
      setListings(rows.slice(0, PAGE_SIZE));
      setHasNext(rows.length > PAGE_SIZE);
    } else {
      setError('Failed to load listings.');
    }
    setPayoutsStatus(
      connectRes.status === 'fulfilled'
        ? connectRes.value.data?.payouts_enabled ? 'enabled' : 'disabled'
        : 'unknown'
    );
    setPendingTermsCount(pendingRes.status === 'fulfilled' ? pendingRes.value.data.count : 0);
    busy.current = false;
    setLoading(false);
  }, [isCurrent]);

  useEffect(() => {
    mounted.current = true;
    void fetchListings(0);
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, [fetchListings]);

  const changePage = (target: number) => {
    if (!isCurrent(sequence.current) || busy.current || mutating.current || target < 0) return;
    void fetchListings(target);
  };

  const handleMutation = async (id: string, kind: 'delete' | 'unpublish') => {
    const request = sequence.current;
    if (!isCurrent(request) || busy.current || mutating.current ||
        !listings.some(listing => listing.id === id)) return;
    mutating.current = true;
    setActionLoading(id);
    try {
      await (kind === 'delete' ? deleteListing(id) : unpublishListing(id));
      if (!isCurrent(request)) return;
      toast(kind === 'delete' ? 'Listing deleted' : 'Listing unpublished', 'success');
      setDeleteConfirm(null);
      await fetchListings(pageOffset.current);
    } catch (err: any) {
      if (isCurrent(request)) toast(err.response?.data?.detail || `Failed to ${kind}`, 'error');
    } finally {
      // Refresh increments the request sequence; only this mounted principal may
      // release the mutation lock. Paging stays disabled through acknowledgement.
      if (mounted.current && useAuthStore.getState().user?.id === userId) {
        mutating.current = false;
        setActionLoading(null);
      }
    }
  };

  const handleEdit = (id: string) => {
    const request = sequence.current;
    if (!isCurrent(request) || busy.current || mutating.current) return;
    void ensureTermsAccepted(() => {
      if (isCurrent(request) && !busy.current && !mutating.current) {
        router.push(`/dashboard/listings/${id}/edit`);
      }
    });
  };

  return (
    <div className="space-y-6">
      <TermsGatePrompt />
      {pendingTermsCount > 0 && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">{pendingTermsCount} inherited {pendingTermsCount === 1 ? 'listing is' : 'listings are'} not yet available to buy.</p>
        <p className="mt-1">Review and accept Terms {termsVersion || '1.1'} to make eligible listings available for purchase.</p>
        <Link href="/legal/terms/accept?context=seller&redirect=%2Fdashboard%2Flistings" className="mt-2 inline-block font-semibold underline">Review and accept Terms {termsVersion || '1.1'}</Link>
      </div>}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Your Listings</h1>
      </div>

      <nav aria-label="Listing pages" className="flex items-center justify-between gap-4">
        <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={() => changePage(offset - PAGE_SIZE)} disabled={loading || !!actionLoading || offset === 0}>Previous</button>
        <p>Page {offset / PAGE_SIZE + 1}{!loading && !error && listings.length > 0 ? ` · Showing ${offset + 1}–${offset + listings.length}` : ''}</p>
        <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={() => changePage(offset + PAGE_SIZE)} disabled={loading || !!actionLoading || !!error || !hasNext}>Next</button>
      </nav>
      {loading ? <p role="status">Loading listings...</p> : error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p>{error}</p>
          <p>Page {offset / PAGE_SIZE + 1} could not be loaded. Retry or return to the previous page.</p>
          <button onClick={() => changePage(offset)}>Retry</button>
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">{offset > 0 ? 'No listings on this page' : 'No listings yet'}</h3>
          <p className="mt-2 text-sm text-gray-500">{offset > 0 ? 'Use Previous to return to earlier listings.' : 'Listings you publish will appear here.'}</p>
          <p className="mt-2 text-sm text-gray-500">Gateway sellers: go to <Link href="/dashboard/gateways" className="text-indigo-700 underline">Dashboard → Gateways</Link> to create a listing.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Title
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Category
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Price
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {listings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <Link href={`/dashboard/listings/${encodeURIComponent(listing.id)}`} className="text-sm font-medium text-indigo-700 hover:underline">{listing.title}</Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[listing.status] || 'bg-gray-100 text-gray-800'}`}>
                      {STATUS_LABELS[listing.status] || listing.status}
                    </span>
                    {listing.status === 'published' && (isPublicReference(listing.structured_metadata) ? (
                      <p className="mt-2 max-w-xs whitespace-normal text-xs leading-5 text-gray-500">
                        Public source reference — no checkout.
                      </p>
                    ) : payoutsStatus === 'disabled' && (
                      <p className="mt-2 max-w-xs whitespace-normal text-xs leading-5 text-amber-700">
                        Published &mdash; not yet purchasable. Finish payout setup to enable sales.
                      </p>
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {listing.category}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatPrice(listing.price)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(listing.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(listing.id)}
                        disabled={checkingTerms || !!actionLoading}
                        className="text-xs font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      {(listing.status === 'published' || listing.status === 'unlisted') && (
                        <button
                          onClick={() => handleMutation(listing.id, 'unpublish')}
                          disabled={!!actionLoading}
                          className="text-xs font-medium text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                        >
                          Unpublish
                        </button>
                      )}
                      {listing.status === 'published' && (
                        <SellerShareControls listingId={listing.id} compact />
                      )}
                      {deleteConfirm === listing.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleMutation(listing.id, 'delete')}
                            disabled={!!actionLoading}
                            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          disabled={!!actionLoading}
                          onClick={() => setDeleteConfirm(listing.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
