import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { listListings, searchListings } from '@/api/listings';
import { formatPrice, privacyScoreColor, verificationBadgeColor } from '@/lib/format';
import { useToast } from '@/components/Toast';
import type { ListingListItem, SearchResultItem } from '@/types';

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low to High', value: 'price-asc' },
  { label: 'Price: High to Low', value: 'price-desc' },
] as const;

const PAGE_SIZE = 20;

export function BrowseListingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(q);

  // Use search endpoint when q is present, otherwise use list endpoint
  const isSearchMode = q.length > 0;

  const listQuery = useQuery({
    queryKey: ['listings', category, sort, page],
    queryFn: () =>
      listListings({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        category: category || undefined,
      }),
    enabled: !isSearchMode,
  });

  const searchQuery = useQuery({
    queryKey: ['search', q, category, page],
    queryFn: () =>
      searchListings(q, {
        category: category || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    enabled: isSearchMode,
  });

  const activeQuery = isSearchMode ? searchQuery : listQuery;
  const isLoading = activeQuery.isLoading;
  const isError = activeQuery.isError;

  // Normalize results to a common card shape
  const listings: ListingListItem[] = isSearchMode
    ? (searchQuery.data?.results ?? []).map(searchResultToCard)
    : (listQuery.data ?? []);

  // Sort client-side for list mode (backend doesn't have sort param)
  const sorted = [...listings].sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParam('q', searchInput.trim());
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">Browse Datasets</h1>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search datasets..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        <div className="flex gap-3">
          <select
            value={category}
            onChange={(e) => updateParam('category', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            <option value="healthcare">Healthcare</option>
            <option value="finance">Finance</option>
            <option value="technology">Technology</option>
            <option value="retail">Retail</option>
            <option value="real-estate">Real Estate</option>
            <option value="marketing">Marketing</option>
            <option value="government">Government</option>
            <option value="other">Other</option>
          </select>

          <select
            value={sort}
            onChange={(e) => updateParam('sort', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 p-6">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-3 bg-gray-200 rounded w-full mb-2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">Failed to load listings. Please try again.</p>
          <button
            onClick={() => {
              activeQuery.refetch();
              toast('Retrying...', 'info');
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && sorted.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg mb-2">No listings found</p>
          <p className="text-gray-400 text-sm">
            Try adjusting your search or filters to find what you&apos;re looking for.
          </p>
        </div>
      )}

      {/* Results Grid */}
      {!isLoading && !isError && sorted.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sorted.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-center gap-2 mt-8">
            {page > 1 && (
              <button
                onClick={() => updateParam('page', String(page - 1))}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Previous
              </button>
            )}
            {sorted.length === PAGE_SIZE && (
              <button
                onClick={() => updateParam('page', String(page + 1))}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Next
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ListingCard({ listing }: { listing: ListingListItem }) {
  return (
    <Link
      to={`/listings/${listing.id}`}
      className="block rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-900 line-clamp-2 flex-1 mr-2">{listing.title}</h3>
        <span className="text-lg font-bold text-gray-900 whitespace-nowrap">
          {formatPrice(listing.price)}
        </span>
      </div>

      {listing.short_description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-4">{listing.short_description}</p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {listing.category}
        </span>
        {listing.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${privacyScoreColor(listing.privacy_score)}`}>
          Privacy: {listing.privacy_score.toFixed(1)}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${verificationBadgeColor(listing.verification_status)}`}>
          {listing.verification_status}
        </span>
        <span className="text-gray-400 ml-auto">{listing.view_count} views</span>
      </div>
    </Link>
  );
}

/** Map SearchResultItem to ListingListItem shape for the card component */
function searchResultToCard(r: SearchResultItem): ListingListItem {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    short_description: r.short_description,
    price: r.price,
    pricing_type: 'one_time',
    category: r.category,
    tags: r.tags ?? [],
    privacy_score: r.privacy_score ?? 0,
    model_provider: 'openai',
    trust_level: 'L0',
    quality_score: 0,
    verification_status: 'unverified',
    view_count: 0,
    created_at: new Date().toISOString(),
  };
}
