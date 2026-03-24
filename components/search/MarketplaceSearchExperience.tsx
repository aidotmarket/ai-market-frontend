'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSearchListings, type ResultItem } from '@/hooks/useSearchListings';
import { MarketplaceListingCard } from '@/components/search/MarketplaceListingCard';
import { SearchForm } from '@/components/search/SearchForm';

type SearchMode = 'browse' | 'search';

interface MarketplaceSearchExperienceProps {
  mode: SearchMode;
}

function sortItems(items: ResultItem[], sort: string, semanticMode: boolean) {
  const next = [...items];

  if (sort === 'price-asc') {
    next.sort((a, b) => a.price - b.price);
    return next;
  }

  if (sort === 'price-desc') {
    next.sort((a, b) => b.price - a.price);
    return next;
  }

  if (!semanticMode || sort === 'newest') {
    next.sort((a, b) => {
      const aTime = 'created_at' in a && a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = 'created_at' in b && b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }

  return next;
}

function buildDataTypeCounts(items: ResultItem[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const value = 'data_format' in item ? item.data_format : null;
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function MarketplaceSearchExperience({
  mode,
}: MarketplaceSearchExperienceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get('q') || '').trim();
  const category = searchParams.get('category') || '';
  const dataType = searchParams.get('data_type') || '';
  const minPrice = parseNumber(searchParams.get('min_price'));
  const maxPrice = parseNumber(searchParams.get('max_price'));

  const {
    items: rawItems,
    facets,
    total,
    semanticMode,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useSearchListings({ q, category, minPrice, maxPrice });

  const sort = searchParams.get('sort') || (semanticMode ? 'relevance' : 'newest');

  const filteredItems = rawItems.filter((item) => {
    if (!dataType) return true;
    return 'data_format' in item && item.data_format === dataType;
  });

  const items = sortItems(filteredItems, sort, semanticMode);
  const categoryCounts = facets ? Object.entries(facets.categories) : [];
  const dataTypeCounts = buildDataTypeCounts(rawItems);
  const priceStats = facets?.price || null;
  const resultCount = semanticMode ? total : items.length;

  function updateParams(updates: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }

    next.delete('page');
    next.delete('per_page');
    next.delete('offset');

    router.push(`${pathname}?${next.toString()}`);
  }

  const sortOptions = semanticMode
    ? [
        { label: 'Relevance', value: 'relevance' },
        { label: 'Price: Low to High', value: 'price-asc' },
        { label: 'Price: High to Low', value: 'price-desc' },
      ]
    : [
        { label: 'Newest', value: 'newest' },
        { label: 'Price: Low to High', value: 'price-asc' },
        { label: 'Price: High to Low', value: 'price-desc' },
      ];

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                {mode === 'search' ? 'Search' : 'Browse'}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {mode === 'search' ? 'Search Marketplace' : 'Browse Datasets'}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                {mode === 'search'
                  ? 'Search across marketplace listings with semantic ranking and refine the result set with filters.'
                  : 'Explore the marketplace with a URL-driven search state, filters, and incremental loading.'}
              </p>
            </div>
            <div className="w-full max-w-3xl">
              <SearchForm
                targetPath={mode === 'search' ? '/search' : '/listings'}
                placeholder="Search datasets by topic, company, geography, or format"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
                <button
                  type="button"
                  onClick={() => router.push(pathname + (q ? `?q=${encodeURIComponent(q)}` : ''))}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Category
              </label>
              <select
                value={category}
                onChange={(event) => updateParams({ category: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">All categories</option>
                {categoryCounts.map(([value, count]) => (
                  <option key={value} value={value}>
                    {value} ({count})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data type
              </label>
              <select
                value={dataType}
                onChange={(event) => updateParams({ data_type: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">All formats</option>
                {dataTypeCounts.map(([value, count]) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()} ({count})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Price range
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={minPrice ?? ''}
                  onChange={(event) => updateParams({ min_price: event.target.value })}
                  placeholder="Min"
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={maxPrice ?? ''}
                  onChange={(event) => updateParams({ max_price: event.target.value })}
                  placeholder="Max"
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              {priceStats && (
                <p className="text-xs text-slate-500">
                  Marketplace range: ${priceStats.min.toLocaleString()} to ${priceStats.max.toLocaleString()}
                </p>
              )}
            </div>
          </aside>

          <section className="min-w-0">
            <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {semanticMode && q ? `Results for \u201c${q}\u201d` : 'Marketplace results'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {resultCount} result{resultCount === 1 ? '' : 's'}
                  {dataType ? ` filtered to ${dataType.toUpperCase()}` : ''}
                </p>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-500">
                <span>Sort</span>
                <select
                  value={sort}
                  onChange={(event) => updateParams({ sort: event.target.value })}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isLoading && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                  />
                ))}
              </div>
            )}

            {!isLoading && items.length === 0 && (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <p className="text-lg font-semibold text-slate-900">No datasets found</p>
                <p className="mt-2 text-sm text-slate-500">
                  Try adjusting the search text or filters to widen the result set.
                </p>
              </div>
            )}

            {items.length > 0 && (
              <>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <MarketplaceListingCard key={item.id} listing={item} />
                  ))}
                </div>

                <div className="mt-8 flex justify-center">
                  {hasNextPage ? (
                    <button
                      type="button"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isFetchingNextPage ? 'Loading more...' : 'Load more'}
                    </button>
                  ) : (
                    <p className="text-sm text-slate-400">You&apos;ve reached the end of the results.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
