import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPublicListings } from '@/lib/api';
import { formatPrice, privacyScoreColor, verificationBadgeColor } from '@/lib/format';
import type { ListingListItem } from '@/types';

export const metadata: Metadata = {
  title: 'Browse Datasets',
  description: 'Discover enterprise datasets on ai.market — findable, queryable, and purchasable by AI systems.',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

interface Props {
  searchParams: Promise<{ page?: string; per_page?: string; category?: string; sort?: string }>;
}

export default async function BrowseListingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const category = params.category || '';
  const sort = params.sort || 'newest';

  const data = await fetchPublicListings({
    page,
    per_page: PAGE_SIZE,
    category: category || undefined,
    sort: sort || undefined,
  });

  // The public endpoint may return an array or a paginated object
  const listings: ListingListItem[] = Array.isArray(data) ? data : data?.items ?? [];

  // Client-side sort fallback
  const sorted = [...listings].sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { page: String(page), category, sort, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/listings?${p.toString()}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">Browse Datasets</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="flex gap-3">
          <form>
            <select
              name="category"
              defaultValue={category}
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
          </form>

          <div className="flex gap-2">
            {[
              { label: 'Newest', value: 'newest' },
              { label: 'Price: Low', value: 'price-asc' },
              { label: 'Price: High', value: 'price-desc' },
            ].map((opt) => (
              <Link
                key={opt.value}
                href={buildUrl({ sort: opt.value, page: '1' })}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  sort === opt.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Empty */}
      {sorted.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg mb-2">No listings found</p>
          <p className="text-gray-400 text-sm">
            Try adjusting your filters to find what you&apos;re looking for.
          </p>
        </div>
      )}

      {/* Results Grid */}
      {sorted.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sorted.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-center gap-2 mt-8">
            {page > 1 && (
              <Link
                href={buildUrl({ page: String(page - 1) })}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {sorted.length === PAGE_SIZE && (
              <Link
                href={buildUrl({ page: String(page + 1) })}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Next
              </Link>
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
      href={`/listings/${listing.slug}`}
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
