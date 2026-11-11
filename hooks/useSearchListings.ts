'use client';

import {useEffect,useState,useSyncExternalStore} from 'react';
import { useInfiniteQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { listListings, searchListings } from '@/api/listings';
import type { FulfillmentType, ListingListItem, SearchResultItem, SearchResponse } from '@/types';

const PAGE_SIZE = 12;
type ListingCategory = 'data' | 'models' | 'all';
type FulfillmentTypeParam = FulfillmentType | FulfillmentType[];

export type ResultItem = ListingListItem | SearchResultItem;

export interface UseSearchListingsParams {
  q?: string;
  category?: string;
  listingCategory?: ListingCategory;
  minPrice?: number;
  maxPrice?: number;
  enabled?: boolean;
}

function getFulfillmentTypesForCategory(listingCategory: ListingCategory): FulfillmentTypeParam | undefined {
  if (listingCategory === 'data') {
    return ['ai_queryable', 'file_download'];
  }

  if (listingCategory === 'models') {
    return ['model_access', 'pipeline_invocation'];
  }

  return undefined;
}

// Restoration invalidation must outlive route observers, just like the cache.
const restorationClocks = new WeakMap<QueryClient, ReturnType<typeof createRestorationClock>>();

// One browser listener pair serves clocks even while their hooks are unmounted.
// Weak references let discarded QueryClients release their restoration state.
const browserClocks = new Set<WeakRef<ReturnType<typeof createRestorationClock>>>();
let restorationListenersInstalled = false;

function registerRestorationClock(clock: ReturnType<typeof createRestorationClock>) {
  if (typeof window === 'undefined') return;
  browserClocks.add(new WeakRef(clock));
  if (restorationListenersInstalled) return;
  restorationListenersInstalled = true;
  const restore = () => {
    for (const reference of browserClocks) {
      const clock = reference.deref();
      if (clock) clock.recheck(true);
      else browserClocks.delete(reference);
    }
  };
  window.addEventListener('pageshow', event => {
    if (event.persisted) restore();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restore();
  });
}

function createRestorationClock() {
  let epoch: symbol | undefined;
  let wall = Date.now();
  let monotonic = performance.now();
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => epoch,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    recheck: (restored = false) => {
      const nextWall = Date.now();
      const nextMonotonic = performance.now();
      // A paused performance clock or wall-clock correction makes age uncertain.
      const clockGap = Math.abs((nextWall - wall) - (nextMonotonic - monotonic));
      wall = nextWall;
      monotonic = nextMonotonic;
      if (restored || clockGap >= 60_000) {
        epoch = Symbol('restoration');
        listeners.forEach(listener => listener());
      }
    },
  };
}

export function useSearchListings({
  q = '',
  category,
  listingCategory = 'all',
  minPrice,
  maxPrice,
  enabled = true,
}: UseSearchListingsParams) {
  const client = useQueryClient();
  let restorationClock = restorationClocks.get(client);
  if (!restorationClock) {
    restorationClock = createRestorationClock();
    restorationClocks.set(client, restorationClock);
    registerRestorationClock(restorationClock);
  }
  const restorationEpoch = useSyncExternalStore(
    restorationClock.subscribe, restorationClock.getSnapshot, restorationClock.getSnapshot,
  );
  const semanticMode = q.length > 0;
  const fulfillmentType = getFulfillmentTypesForCategory(listingCategory);

  const query = useInfiniteQuery({
    queryKey: ['marketplace-results', semanticMode ? 'semantic' : 'browse', q, category, listingCategory, minPrice, maxPrice],
    enabled: semanticMode ? q.length > 0 && enabled : enabled,
    initialPageParam: 0,
    staleTime: 0,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async ({ pageParam }) => {
      const offset = typeof pageParam === 'number' ? pageParam : 0;
      // A response started before restoration cannot certify the restored view.
      const observationEpoch = restorationClock.getSnapshot();

      if (semanticMode) {
        const result = await searchListings(q, {
          category: category || undefined,
          min_price: minPrice,
          max_price: maxPrice,
          fulfillment_type: fulfillmentType,
          limit: PAGE_SIZE,
          offset,
        });
        return {result, observedAt:Date.now(), observedAtMonotonic:performance.now(), observationEpoch};
      }

      const result = await listListings({
        skip: offset,
        limit: PAGE_SIZE,
        category: category || undefined,
        min_price: minPrice,
        max_price: maxPrice,
        fulfillment_type: fulfillmentType,
      });
      return {result, observedAt:Date.now(), observedAtMonotonic:performance.now(), observationEpoch};
    },
    getNextPageParam: (lastPage, allPages) => {
      const result=lastPage.result;
      const pageItems = Array.isArray(result) ? result : result.results;
      if (pageItems.length < PAGE_SIZE) return undefined;

      const loadedCount = allPages.reduce((sum, page) => {
        return sum + (Array.isArray(page.result) ? page.result.length : page.result.results.length);
      }, 0);

      // Use backend total when available to avoid fetching an empty final page
      if (!Array.isArray(result) && result.total > 0 && loadedCount >= result.total) {
        return undefined;
      }

      return loadedCount;
    },
  });

  const [,setClock] = useState(0);
  useEffect(() => {
    const recheck = () => {
      restorationClock.recheck();
      setClock(tick => tick + 1);
    };
    const timer = setInterval(recheck, 60_000);
    return () => { clearInterval(timer); };
  }, [restorationClock]);
  // Appending a fresh page must never extend the life of older pages.
  // Monotonic elapsed time prevents clock rollback from extending visibility.
  // Wall time also expires suspended pages on platforms whose performance clock pauses.
  const expired = query.data?.pages.some(page => (
    restorationEpoch !== undefined && page.observationEpoch !== restorationEpoch
  ) || Math.max(
    performance.now() - page.observedAtMonotonic,
    Date.now() - page.observedAt
  ) >= 10 * 60_000) ?? false;
  const rawItems: ResultItem[] = expired ? [] : filterDiscoverableItems(query.data?.pages.flatMap((page): ResultItem[] =>
    Array.isArray(page.result) ? page.result : page.result.results
  ) || []);

  const firstPage = query.data?.pages[0]?.result;
  const facets = Array.isArray(firstPage) ? null : (firstPage as SearchResponse | undefined)?.facets;
  const total = semanticMode
    ? (Array.isArray(firstPage) ? rawItems.length : (firstPage as SearchResponse | undefined)?.total || rawItems.length)
    : rawItems.length;

  return {
    ...query,
    items: rawItems,
    isError: query.isError || expired,
    error: expired ? new Error('Refresh to load current marketplace results.') : query.error,
    facets,
    total,
    semanticMode,
    pageSize: PAGE_SIZE,
  };
}

export function filterDiscoverableItems(items: ResultItem[]) {
  return items.filter((item) => !('status' in item) || item.status !== 'unlisted');
}
