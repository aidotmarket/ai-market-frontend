import { plainTextExcerpt } from '@/lib/plainTextExcerpt';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchDataRequests } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { requestDisplayTitle } from '@/lib/request-display-title';
import { requestUrgencyLabel } from '@/lib/request-urgency';
import type { DataRequestListItem, DataRequestUrgency } from '@/types';

export const metadata: Metadata = {
  alternates: { canonical: '/requests' },
  title: 'Data Requests',
  description: 'Browse open data requests on ai.market - tell the market what data you need.',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const HIDDEN_SAMPLE_SLUGS = new Set([
  'seeking-10-000-entirely-synthetic-retail-transaction-records-for-testing-a-d31ab91e',
  'seeking-a-fully-synthetic-retail-sales-dataset-for-testing-a-ce9be9aa',
  'i-need-a-fully-synthetic-retail-transactions-dataset-to-test-a-sales-15228d5e',
  'i-need-a-fully-synthetic-retail-sales-dataset-for-testing-a-demand-49e7b84c',
  'seeking-a-fully-synthetic-retail-transactions-dataset-for-testing-a-sales-047d7cd2',
  'i-need-a-fully-synthetic-retail-transactions-dataset-to-test-a-sales-07e5b9a4',
  'i-need-a-fully-synthetic-retail-transactions-dataset-for-testing-a-sales-9d78ecb4',
  'i-need-a-fully-synthetic-retail-sales-dataset-for-testing-a-demand-40b47d84',
]);

const FULFILLED_EXAMPLES = [
  'Synthetic retail transaction records for a sales analytics dashboard',
  'Synthetic retail sales for a demand-forecasting demo',
  'Synthetic daily retail transactions for a sales analytics dashboard',
  'Synthetic retail sales and inventory for a demand-forecasting demo',
];

const URGENCY_BADGE: Record<DataRequestUrgency, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-[#E8EAF6] text-[#3F51B5]',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-800',
};

interface Props {
  searchParams: Promise<{ page?: string | string[]; category?: string | string[]; search?: string | string[] }>;
}

export default async function BrowseRequestsPage({ searchParams }: Props) {
  const params = await searchParams;
  const parsedPage = typeof params.page === 'string' && /^\d+$/.test(params.page) ? Number(params.page) : NaN;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const category = typeof params.category === 'string' ? params.category.trim() : '';
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const hasFilters = Boolean(category || search);

  function buildBoardQuery(targetPage?: number) {
    const query = new URLSearchParams();
    if (targetPage) query.set('page', String(targetPage));
    if (category) query.set('category', category);
    if (search) query.set('search', search);
    return query.toString();
  }

  const boardQuery = buildBoardQuery(parsedPage === page ? page : undefined);

  function buildPageUrl(targetPage: number) {
    return `/requests?${buildBoardQuery(targetPage)}`;
  }

  // A native GET includes empty controls. Canonicalize their values before fetching.
  if (params.category !== (category || undefined) || params.search !== (search || undefined)) {
    redirect(boardQuery ? `/requests?${boardQuery}` : '/requests');
  }

  const data = await fetchDataRequests({
    page,
    per_page: PAGE_SIZE,
    category: category || undefined,
    search: search || undefined,
  }).catch(() => null);

  const requests: DataRequestListItem[] = Array.isArray(data) ? data : data?.items ?? [];
  const total = Array.isArray(data) ? undefined : data?.total;
  const hasNext = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0
    ? page * PAGE_SIZE < total
    : requests.length === PAGE_SIZE;

  const visibleRequests = requests
    .filter(({ is_sample, slug }) => !(is_sample === true && slug !== null && HIDDEN_SAMPLE_SLUGS.has(slug)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Requests.</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse open data requests, or post your own. Sellers respond with matching datasets. The whole conversation happens here.
          </p>
        </div>
        <div className="shrink-0 sm:text-center">
          <Link
            href="/requests/new"
            aria-describedby="post-request-account"
            className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] transition-colors"
          >
            Post a Data Request
          </Link>
          <p id="post-request-account" className="mt-1 text-sm text-gray-600">Free account needed</p>
        </div>
      </div>

      {/* Board filters */}
      <div className="flex gap-3 mb-8">
        <form action="/requests" method="get" className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="request-search" className="text-sm font-medium text-gray-700">Keyword</label>
            <input
              key={search}
              id="request-search"
              name="search"
              type="search"
              defaultValue={search}
              className="min-w-0 max-w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            />
          </div>
          <label htmlFor="request-category" className="text-sm font-medium text-gray-700">Category</label>
          <select
            key={category}
            id="request-category"
            name="category"
            defaultValue={category}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
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
          <button
            type="submit"
            className="rounded-lg bg-[#3F51B5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] transition-colors"
          >
            Apply filter
          </button>
          {hasFilters && <Link href="/requests" className="text-sm font-medium text-[#3F51B5] underline">Clear filters</Link>}
        </form>
      </div>

      {data === null && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg mb-2">Requests are unavailable</p>
          <p className="text-gray-400 text-sm mb-6">Please try again later.</p>
        </div>
      )}

      {/* Empty state */}
      {data !== null && visibleRequests.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg mb-2">
            {page > 1 || hasNext ? 'No requests on this page' : search ? 'No requests match your filters' : category ? 'No requests match this category' : 'No data requests yet'}
          </p>
          <p className="text-gray-400 text-sm mb-6">
            {hasNext ? 'Try the next page.' : page > 1 ? 'Return to the first page or try the previous page.' : search ? 'Try a different keyword or category.' : category ? 'Try another category.' : 'Be the first to tell the market what you need.'}
          </p>
          {page === 1 && !hasFilters && !hasNext && (
            <div>
              <Link
                href="/requests/new"
                aria-describedby="empty-post-request-account"
                className="inline-flex rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
              >
                Post a Data Request
              </Link>
              <p id="empty-post-request-account" className="mt-1 text-sm text-gray-600">Free account needed</p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {visibleRequests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleRequests.map((req) => (
            <RequestCard key={req.id} request={req} boardQuery={boardQuery} />
          ))}
        </div>
      )}

      {/* Pagination and empty-page recovery */}
      {data !== null && (page > 1 || hasNext) && (
        <div className="flex justify-center gap-2 mt-8">
          {page > 1 && visibleRequests.length === 0 && (
            <Link
              href={buildPageUrl(1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              First page
            </Link>
          )}
          {page > 1 && (
            <Link
              href={buildPageUrl(page - 1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Previous
            </Link>
          )}
          {hasNext && (
            <Link
              href={buildPageUrl(page + 1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Next
            </Link>
          )}
        </div>
      )}

      {page === 1 && !hasFilters && (
        <section aria-labelledby="fulfilled-examples" className="mt-10 border-t border-gray-200 pt-8">
          <h2 id="fulfilled-examples" className="text-xl font-semibold text-gray-900">Fulfilled examples</h2>
          <p className="mt-1 text-sm text-gray-600">These fictional requests show what a fulfilled request might look like.</p>
          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
            {FULFILLED_EXAMPLES.map(title => (
              <article key={title} className="rounded-xl border border-gray-200 bg-gray-50 p-6">
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <span className="mt-3 inline-flex rounded-full bg-[#E8EAF6] px-2.5 py-0.5 text-xs font-medium text-[#3F51B5]">
                  Fulfilled
                </span>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RequestCard({ request, boardQuery }: { request: DataRequestListItem; boardQuery: string }) {
  const hasResponseCount = typeof request.response_count === 'number'
    && Number.isFinite(request.response_count) && request.response_count >= 0;
  const urgencyCss = URGENCY_BADGE[request.urgency] || URGENCY_BADGE.low;

  const priceRange =
    request.price_range_min != null || request.price_range_max != null
      ? `${request.price_range_min != null ? `$${request.price_range_min.toLocaleString()}` : ''}${request.price_range_min != null && request.price_range_max != null ? ' – ' : ''}${request.price_range_max != null ? `$${request.price_range_max.toLocaleString()}` : ''} ${request.currency || 'USD'}`
      : null;

  return (
    <Link
      href={`/requests/${request.slug}${boardQuery ? `?${boardQuery}` : ''}`}
      className="block rounded-xl border border-gray-200 p-6 hover:border-[#C5CAE9] hover:shadow-md transition-all"
    >
      <div className="flex flex-wrap items-start justify-between gap-y-2 mb-3">
        <h3 className="font-semibold text-gray-900 line-clamp-2 flex-1 mr-2">{plainTextExcerpt(requestDisplayTitle(request.title, request.description)) || 'Buyer data request'}</h3>
        {request.is_sample === true && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 shrink-0">
            (SAMPLE)
          </span>
        )}
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${urgencyCss}`}>
          {requestUrgencyLabel(request.urgency)}
        </span>
      </div>

      <p className="text-sm text-gray-500 line-clamp-2 mb-4">{plainTextExcerpt(request.description)}</p>

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
          {hasResponseCount && (
            <span>{request.response_count} response{request.response_count !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
