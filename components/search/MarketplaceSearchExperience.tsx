'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSearchListings, type ResultItem } from '@/hooks/useSearchListings';
import { MarketplaceListingCard } from '@/components/search/MarketplaceListingCard';
import { SearchForm } from '@/components/search/SearchForm';

type SearchMode = 'browse' | 'search';
type ListingTypeFilter = 'all' | 'data' | 'models';
type FulfillmentType = 'ai_queryable' | 'file_download' | 'model_access';

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

/*
 * Known limitation: data_type / data_format counts are computed client-side
 * from loaded items only. The backend does not currently return format facets.
 * Counts reflect only the items fetched so far, not the full result set.
 * If the backend adds format facets in the future, wire them in here.
 */
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

function parseListingType(value: string | null): ListingTypeFilter {
  if (value === 'data' || value === 'models') return value;
  return 'all';
}

function getFulfillmentTypes(type: ListingTypeFilter): FulfillmentType[] | undefined {
  if (type === 'data') return ['ai_queryable', 'file_download'];
  if (type === 'models') return ['model_access'];
  return undefined;
}

const PRICE_DEBOUNCE_MS = 500;

export function MarketplaceSearchExperience({
  mode,
}: MarketplaceSearchExperienceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get('q') || '').trim();
  const category = searchParams.get('category') || '';
  const dataType = searchParams.get('data_type') || '';
  const listingType = parseListingType(searchParams.get('type'));
  const minPrice = parseNumber(searchParams.get('min_price'));
  const maxPrice = parseNumber(searchParams.get('max_price'));
  const fulfillmentType = getFulfillmentTypes(listingType);

  const [localMinPrice, setLocalMinPrice] = useState(searchParams.get('min_price') ?? '');
  const [localMaxPrice, setLocalMaxPrice] = useState(searchParams.get('max_price') ?? '');
  const priceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalMinPrice(searchParams.get('min_price') ?? '');
    setLocalMaxPrice(searchParams.get('max_price') ?? '');
  }, [searchParams]);

  const {
    items: rawItems,
    facets,
    browseCategoryCounts,
    total,
    semanticMode,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useSearchListings({ q, category, minPrice, maxPrice, fulfillmentType });

  const sort = searchParams.get('sort') || (semanticMode ? 'relevance' : 'newest');

  const filteredItems = rawItems.filter((item) => {
    if (!dataType || listingType !== 'data') return true;
    return 'data_format' in item && item.data_format === dataType;
  });

  const items = sortItems(filteredItems, sort, semanticMode);

  const categoryCounts: [string, number][] = facets
    ? Object.entries(facets.categories)
    : browseCategoryCounts
      ? Object.entries(browseCategoryCounts)
      : [];

  const dataTypeCounts = buildDataTypeCounts(rawItems);
  const priceStats = facets?.price || null;
  const resultCount = semanticMode ? total : items.length;
  const typeLabel = listingType === 'data' ? 'Data' : listingType === 'models' ? 'Models' : 'Marketplace';
  const searchPlaceholder = listingType === 'models'
    ? 'Search models by provider, task, capability, or category'
    : listingType === 'data'
      ? 'Search data by topic, company, geography, or format'
      : 'Search data and models by topic, provider, geography, or capability';
  const browseDescription = listingType === 'models'
    ? 'Explore model listings with URL-driven filters, sorting, and incremental loading.'
    : listingType === 'data'
      ? 'Explore data listings with URL-driven filters, sorting, and incremental loading.'
      : 'Explore marketplace listings with URL-driven filters, sorting, and incremental loading.';
  const emptyLabel = listingType === 'data' ? 'data' : listingType === 'models' ? 'models' : 'listings';

  const updateParams = useCallback((updates: Record<string, string | number | undefined>) => {
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

    const nextQuery = next.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const debouncePriceUpdate = useCallback((key: string, value: string) => {
    if (priceTimerRef.current) clearTimeout(priceTimerRef.current);
    priceTimerRef.current = setTimeout(() => {
      updateParams({ [key]: value });
    }, PRICE_DEBOUNCE_MS);
  }, [updateParams]);

  useEffect(() => {
    return () => {
      if (priceTimerRef.current) clearTimeout(priceTimerRef.current);
    };
  }, []);

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
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                  {mode === 'search' ? `Search ${typeLabel}` : `Browse ${typeLabel}`}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  {mode === 'search' ? `Search ${typeLabel}` : 'Browse Marketplace'}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                  {mode === 'search'
                    ? 'Search across marketplace listings with semantic ranking and refine the result set with filters.'
                    : browseDescription}
                </p>
              </div>
              <div className="w-full max-w-3xl">
                <SearchForm
                  targetPath={mode === 'search' ? '/search' : '/listings'}
                  placeholder={searchPlaceholder}
                />
              </div>
            </div>

            <div className="inline-flex w-full rounded-full bg-slate-100 p-1 sm:w-auto">
              {[
                { label: 'All', value: 'all' as const },
                { label: 'Data', value: 'data' as const },
                { label: 'Models', value: 'models' as const },
              ].map((option) => {
                const isActive = listingType === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => updateParams({
                      type: option.value === 'all' ? undefined : option.value,
                      data_type: option.value === 'data' ? dataType : undefined,
                    })}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:flex-none ${
                      isActive
                        ? 'bg-[#0F6E56] text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
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
                  onClick={() => {
                    const next = new URLSearchParams();
                    if (q) next.set('q', q);
                    if (listingType !== 'all') next.set('type', listingType);
                    router.push(pathname + (next.toString() ? `?${next.toString()}` : ''));
                  }}
                  className="text-xs font-medium text-[#3F51B5] hover:text-[#3F51B5]"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="filter-category" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Category
              </label>
              <select
                id="filter-category"
                value={category}
                onChange={(event) => updateParams({ category: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-[#3F51B5] focus:outline-none"
              >
                <option value="">All categories</option>
                {categoryCounts.map(([value, count]) => (
                  <option key={value} value={value}>
                    {value} ({count})
                  </option>
                ))}
              </select>
            </div>

            {listingType === 'data' && (
              <div className="space-y-2">
                <label htmlFor="filter-data-type" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Data type
                </label>
                <select
                  id="filter-data-type"
                  value={dataType}
                  onChange={(event) => updateParams({ data_type: event.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-[#3F51B5] focus:outline-none"
                >
                  <option value="">All formats</option>
                  {dataTypeCounts.map(([value, count]) => (
                    <option key={value} value={value}>
                      {value.toUpperCase()} ({count})
                    </option>
                  ))}
                </select>
                {dataTypeCounts.length > 0 && (
                  <p className="text-xs text-slate-400">Counts reflect loaded results only</p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500" id="price-range-label">
                Price range
              </span>
              <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="price-range-label">
                <div>
                  <label htmlFor="filter-min-price" className="sr-only">Minimum price</label>
                  <input
                    id="filter-min-price"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={localMinPrice}
                    onChange={(event) => {
                      setLocalMinPrice(event.target.value);
                      debouncePriceUpdate('min_price', event.target.value);
                    }}
                    placeholder="Min"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-[#3F51B5] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="filter-max-price" className="sr-only">Maximum price</label>
                  <input
                    id="filter-max-price"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={localMaxPrice}
                    onChange={(event) => {
                      setLocalMaxPrice(event.target.value);
                      debouncePriceUpdate('max_price', event.target.value);
                    }}
                    placeholder="Max"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-[#3F51B5] focus:outline-none"
                  />
                </div>
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
                  {semanticMode && q ? `${typeLabel} results for "${q}"` : `${typeLabel} results`}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {resultCount} result{resultCount === 1 ? '' : 's'}
                  {listingType === 'data' && dataType ? ` filtered to ${dataType.toUpperCase()}` : ''}
                </p>
              </div>

              <label htmlFor="filter-sort" className="flex items-center gap-3 text-sm text-slate-500">
                <span>Sort</span>
                <select
                  id="filter-sort"
                  value={sort}
                  onChange={(event) => updateParams({ sort: event.target.value })}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#3F51B5] focus:outline-none"
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

            {!isLoading && isError && (
              <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-6 py-16 text-center shadow-sm">
                <p className="text-lg font-semibold text-red-900">Something went wrong</p>
                <p className="mt-2 text-sm text-red-600">
                  {error instanceof Error ? error.message : 'Failed to load results. Please try again.'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-4 rounded-full border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !isError && items.length === 0 && (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <p className="text-lg font-semibold text-slate-900">No {emptyLabel} found</p>
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
