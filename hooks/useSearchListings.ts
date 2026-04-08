'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { listListings, searchListings } from '@/api/listings';
import type { ListingListItem, SearchResultItem, SearchResponse } from '@/types';

const PAGE_SIZE = 12;

export type ResultItem = ListingListItem | SearchResultItem;

export interface UseSearchListingsParams {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  enabled?: boolean;
}

export function useSearchListings({
  q = '',
  category,
  minPrice,
  maxPrice,
  enabled = true,
}: UseSearchListingsParams) {
  const semanticMode = q.length > 0;

  const query = useInfiniteQuery({
    queryKey: ['marketplace-results', semanticMode ? 'semantic' : 'browse', q, category, minPrice, maxPrice],
    enabled: semanticMode ? q.length > 0 && enabled : enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = typeof pageParam === 'number' ? pageParam : 0;

      if (semanticMode) {
        return searchListings(q, {
          category: category || undefined,
          min_price: minPrice,
          max_price: maxPrice,
          limit: PAGE_SIZE,
          offset,
        });
      }

      return listListings({
        skip: offset,
        limit: PAGE_SIZE,
        category: category || undefined,
        min_price: minPrice,
        max_price: maxPrice,
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      const pageItems = Array.isArray(lastPage) ? lastPage : lastPage.results;
      if (pageItems.length < PAGE_SIZE) return undefined;

      const loadedCount = allPages.reduce((sum, page) => {
        return sum + (Array.isArray(page) ? page.length : page.results.length);
      }, 0);

      // Use backend total when available to avoid fetching an empty final page
      if (!Array.isArray(lastPage) && lastPage.total > 0 && loadedCount >= lastPage.total) {
        return undefined;
      }

      return loadedCount;
    },
  });

  const rawItems: ResultItem[] = query.data?.pages.flatMap((page): ResultItem[] =>
    Array.isArray(page) ? page : page.results
  ) || [];

  const firstPage = query.data?.pages[0];
  const facets = Array.isArray(firstPage) ? null : (firstPage as SearchResponse | undefined)?.facets;
  const total = semanticMode
    ? (Array.isArray(firstPage) ? rawItems.length : (firstPage as SearchResponse | undefined)?.total || rawItems.length)
    : rawItems.length;

  // In browse mode (no facets), derive category counts from loaded items
  const browseCategoryCounts: Record<string, number> | null = facets ? null : (() => {
    const counts: Record<string, number> = {};
    for (const item of rawItems) {
      const cat = 'category' in item && item.category ? item.category : null;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.keys(counts).length > 0 ? counts : null;
  })();

  return {
    ...query,
    items: rawItems,
    facets,
    browseCategoryCounts,
    total,
    semanticMode,
    pageSize: PAGE_SIZE,
  };
}
