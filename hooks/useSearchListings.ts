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
      const pageSize = Array.isArray(lastPage) ? lastPage.length : lastPage.results.length;
      if (pageSize < PAGE_SIZE) return undefined;

      return allPages.reduce((total, page) => {
        return total + (Array.isArray(page) ? page.length : page.results.length);
      }, 0);
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

  return {
    ...query,
    items: rawItems,
    facets,
    total,
    semanticMode,
    pageSize: PAGE_SIZE,
  };
}
