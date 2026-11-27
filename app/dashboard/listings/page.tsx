'use client';

import { customerLoadError } from '@/lib/customerMessages';
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
import { formatMarketplaceCategoryName } from '@/lib/marketplaceCategories';
import { formatPrice, formatDate } from '@/lib/format';
import { formatListingActionError } from '@/lib/listing-action-error';
import { dangerSecondaryButtonClass, secondaryButtonClass } from '@/components/ui/button-styles';
import type { SellerListingItem } from '@/types';
import { heldStatus, listingStatus, sellerTermsHref } from './listing-status';

type ListingRow = SellerListingItem & { structured_metadata?: unknown };
type PayoutsStatus = 'unknown' | 'enabled' | 'disabled';

function listingReadiness(listing: ListingRow, pendingTerms: boolean, payoutsStatus: PayoutsStatus) {
  if (listing.status !== 'published') return null;
  if (isPublicReference(listing.structured_metadata)) {
    return { reason: 'Public source reference — no checkout.' };
  }
  if (pendingTerms) return { reason: 'Seller Terms need to be accepted.', href: sellerTermsHref, fix: 'Fix seller Terms' };
  if (payoutsStatus === 'disabled') return { reason: 'Payout setup is incomplete.', href: '/dashboard', fix: 'Fix payout setup' };
  return null;
}

function isPublicReference(metadata: unknown): boolean {
  return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
    && Object.prototype.hasOwnProperty.call(metadata, 'public_reference');
}

const PAGE_SIZE = 20;
const rowButtonClass = `min-h-11 w-auto! ${secondaryButtonClass}`;
const rowDangerButtonClass = `min-h-11 w-auto! ${dangerSecondaryButtonClass}`;

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
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [pendingTerms, setPendingTerms] = useState({ count: 0, ids: new Set<string>() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [workspaceHref, setWorkspaceHref] = useState<string | undefined>();
  const [setupHref, setSetupHref] = useState<string | undefined>();
  const [payoutsStatus, setPayoutsStatus] = useState<PayoutsStatus>('unknown');
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
      setError(customerLoadError("listings"));
    }
    const payoutsEnabled = connectRes.status === 'fulfilled' ? connectRes.value.data?.payouts_enabled : undefined;
    setPayoutsStatus(payoutsEnabled === true ? 'enabled' : payoutsEnabled === false ? 'disabled' : 'unknown');
    const terms = pendingRes.status === 'fulfilled' ? pendingRes.value.data : null;
    setPendingTerms({
      count: terms?.count ?? 0,
      ids: new Set(terms?.listings?.map(listing => listing.id)),
    });
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
    setWorkspaceHref(undefined);
    setSetupHref(undefined);
    setActionLoading(id);
    try {
      await (kind === 'delete' ? deleteListing(id) : unpublishListing(id));
      if (!isCurrent(request)) return;
      toast(kind === 'delete' ? 'Listing deleted' : 'Listing unpublished', 'success');
      setDeleteConfirm(null);
      await fetchListings(pageOffset.current);
    } catch (err: unknown) {
      if (isCurrent(request)) {
        const failure = formatListingActionError(err, kind === 'delete' ? 'delete' : 'update');
        toast(failure.message, 'error');
        setWorkspaceHref(failure.workspaceHref);
        setSetupHref(failure.setupHref);
      }
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

  const termsCoveredOnPage = loading || error ? 0 : listings.filter(listing =>
    listingReadiness(listing, pendingTerms.ids.has(listing.id), payoutsStatus)?.href === sellerTermsHref
  ).length;
  const remainingPendingTerms = pendingTerms.count - termsCoveredOnPage;

  return (
    <div className="space-y-6">
      <TermsGatePrompt />
      {setupHref && <p role="status" className="text-sm text-gray-700">
        <Link href={setupHref} className="font-semibold text-indigo-700 underline">Finish seller setup</Link>
      </p>}
      {workspaceHref && <p role="status" className="text-sm text-gray-700">
        <Link href={workspaceHref} className="font-semibold text-indigo-700 underline">Manage this listing in Seller Workspace.</Link>
      </p>}
      {remainingPendingTerms > 0 && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">{remainingPendingTerms} inherited {remainingPendingTerms === 1 ? 'listing needs' : 'listings need'} seller Terms.</p>
        <p className="mt-1">Review and accept Terms {termsVersion || '1.1'} to make eligible listings available for purchase.</p>
        <Link href={sellerTermsHref} className="mt-2 inline-block font-semibold underline">Review and accept Terms {termsVersion || '1.1'}</Link>
      </div>}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Your listings</h1>
      </div>

      <nav aria-label="Listing pages" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-700">
        <button className={rowButtonClass} onClick={() => changePage(offset - PAGE_SIZE)} disabled={loading || !!actionLoading || offset === 0}>Previous</button>
        <p>Page {offset / PAGE_SIZE + 1}{!loading && !error && listings.length > 0 ? ` · Showing ${offset + 1}–${offset + listings.length}` : ''}</p>
        <button className={rowButtonClass} onClick={() => changePage(offset + PAGE_SIZE)} disabled={loading || !!actionLoading || !!error || !hasNext}>Next</button>
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
          <p className="mt-2 text-sm text-gray-500"><Link href="/dashboard/seller-workspace" className="inline-flex min-h-11 items-center px-3 text-indigo-700 underline">Connect cloud storage</Link> <Link href="/dashboard/gateways" className="inline-flex min-h-11 items-center px-3 text-indigo-700 underline">Use your own server (gateway)</Link></p>
        </div>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => {
            const href = `/dashboard/listings/${encodeURIComponent(listing.id)}`;
            const readiness = listingReadiness(listing, pendingTerms.ids.has(listing.id), payoutsStatus);
            const status = readiness?.href ? heldStatus : listingStatus(listing.status);
            return (
              <li key={listing.id} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0 flex-[2_1_20rem]">
                    <h2 className="text-base font-semibold [overflow-wrap:anywhere]">
                      <Link href={href} className="text-indigo-700 hover:underline">{listing.title}</Link>
                    </h2>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 [overflow-wrap:anywhere]">
                      <div><dt className="sr-only">Category</dt><dd>{formatMarketplaceCategoryName(listing.category || 'other')}</dd></div>
                      <div><dt className="sr-only">Price</dt><dd>{formatPrice(listing.price)}</dd></div>
                      <div><dt className="sr-only">Created</dt><dd>{formatDate(listing.created_at)}</dd></div>
                    </dl>
                  </div>
                  <div className="min-w-0 flex-[1_1_15rem] text-sm [overflow-wrap:anywhere]">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${status.style}`}>{status.label}</span>
                    {readiness && (
                      <p className="mt-1.5 text-gray-700">
                        {readiness.reason}{readiness.href && <> <Link href={readiness.href} className="font-semibold text-indigo-700 underline">{readiness.fix}</Link></>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  {listing.status === 'published' && <SellerShareControls listingId={listing.id} compact />}
                  <button
                    type="button"
                    onClick={() => handleEdit(listing.id)}
                    disabled={checkingTerms || !!actionLoading}
                    className={rowButtonClass}
                  >
                    Edit
                  </button>
                  {listing.status === 'unlisted' && <Link href={`${href}/edit`} className={rowButtonClass}>Publish</Link>}
                  {listing.status === 'published' && (
                    <button
                      type="button"
                      onClick={() => handleMutation(listing.id, 'unpublish')}
                      disabled={!!actionLoading}
                      className={rowButtonClass}
                    >
                      Unlist
                    </button>
                  )}
                  {deleteConfirm === listing.id ? (
                    <div role="group" aria-label="Delete this listing? This cannot be undone." className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm text-red-700">This can&apos;t be undone.</span>
                      <button
                        type="button"
                        onClick={() => handleMutation(listing.id, 'delete')}
                        disabled={!!actionLoading}
                        className={rowDangerButtonClass}
                      >
                        Delete listing
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(null)}
                        className={rowButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!!actionLoading}
                      onClick={() => setDeleteConfirm(listing.id)}
                      className={rowDangerButtonClass}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
