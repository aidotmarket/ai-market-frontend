import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchDataRequests } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { DataRequestListItem, DataRequestUrgency } from '@/types';

export const metadata: Metadata = {
  title: 'Data Requests',
  description: 'Browse open data requests on ai.market — tell the market what data you need.',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const URGENCY_BADGE: Record<DataRequestUrgency, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-800',
};

interface Props {
  searchParams: Promise<{ page?: string; category?: string }>;
}

export default async function BrowseRequestsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const category = params.category || '';

  const data = await fetchDataRequests({
    page,
    per_page: PAGE_SIZE,
    category: category || undefined,
  });

  const requests: DataRequestListItem[] = Array.isArray(data) ? data : data?.items ?? [];

  const sorted = [...requests].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { page: String(page), category, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/requests?${p.toString()}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse what buyers are looking for, or post your own request.
          </p>
        </div>
        <Link
          href="/requests/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Post a Data Request
        </Link>
      </div>

      {/* Category filter */}
      <div className="flex gap-3 mb-8">
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
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg mb-2">No data requests yet</p>
          <p className="text-gray-400 text-sm mb-6">
            Be the first to tell the market what you need.
          </p>
          <Link
            href="/requests/new"
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Post a Data Request
          </Link>
        </div>
      )}

      {/* Results */}
      {sorted.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sorted.map((req) => (
              <RequestCard key={req.id} request={req} />
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

function RequestCard({ request }: { request: DataRequestListItem }) {
  const urgencyCss = URGENCY_BADGE[request.urgency] || URGENCY_BADGE.low;

  const priceRange =
    request.price_range_min != null || request.price_range_max != null
      ? `${request.price_range_min != null ? `$${request.price_range_min.toLocaleString()}` : ''}${request.price_range_min != null && request.price_range_max != null ? ' – ' : ''}${request.price_range_max != null ? `$${request.price_range_max.toLocaleString()}` : ''} ${request.currency || 'USD'}`
      : null;

  return (
    <Link
      href={`/requests/${request.slug}`}
      className="block rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-900 line-clamp-2 flex-1 mr-2">{request.title}</h3>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${urgencyCss}`}>
          {request.urgency}
        </span>
      </div>

      <p className="text-sm text-gray-500 line-clamp-2 mb-4">{request.description}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {request.categories.slice(0, 4).map((cat) => (
          <span
            key={cat}
            className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
          >
            {cat}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{formatDate(request.created_at)}</span>
        <div className="flex items-center gap-3">
          {priceRange && <span className="font-medium text-gray-700">{priceRange}</span>}
          <span>{request.response_count} response{request.response_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </Link>
  );
}
