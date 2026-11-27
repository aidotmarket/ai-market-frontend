'use client';

import {useEffect,useState,useSyncExternalStore} from 'react';
import { useInfiniteQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { listListings, searchListings } from '@/api/listings';
import { DATA_FULFILLMENT_TYPES } from '@/lib/marketplaceListings';
import {verifyCurrentListing} from '@/lib/publicPresentation';
import type { ListingListItem, SearchResultItem } from '@/types';

const PAGE_SIZE = 12;

export type ResultItem = ListingListItem | SearchResultItem;

export interface UseSearchListingsParams {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  enabled?: boolean;
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

function createRestorationClock(client: QueryClient) {
  let refreshScheduled = false;
  const refresh = () => {
    if (refreshScheduled) return;
    refreshScheduled = true;
    // Let adjacent restoration events publish their latest epoch first. Explicit
    // cancellation also supersedes initial requests, where cancelRefetch alone
    // does not cancel a fetch without cached data. Infinite refetch reloads every
    // retained page, rather than just the page that happened to be in flight.
    queueMicrotask(() => {
      // Cancellation updates query state synchronously; start the replacement
      // in the same turn so the focus handler cannot start a competing fetch.
      void client.cancelQueries({ queryKey: ['marketplace-results'] });
      refreshScheduled = false;
      void client.refetchQueries(
        { queryKey: ['marketplace-results'], type: 'active' },
        { cancelRefetch: true },
      );
    });
  };
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
        refresh();
        listeners.forEach(listener => listener());
      }
    },
  };
}

export function useSearchListings({
  q = '',
  category,
  minPrice,
  maxPrice,
  enabled = true,
}: UseSearchListingsParams) {
  const client = useQueryClient();
  let restorationClock = restorationClocks.get(client);
  if (!restorationClock) {
    restorationClock = createRestorationClock(client);
    restorationClocks.set(client, restorationClock);
    registerRestorationClock(restorationClock);
  }
  const restorationEpoch = useSyncExternalStore(
    restorationClock.subscribe, restorationClock.getSnapshot, restorationClock.getSnapshot,
  );
  const semanticMode = q.length > 0;

  const query = useInfiniteQuery({
    queryKey: ['marketplace-results', semanticMode ? 'semantic' : 'browse', q, category, minPrice, maxPrice],
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
          fulfillment_type: DATA_FULFILLMENT_TYPES,
          limit: PAGE_SIZE,
          offset,
        });
        return {result: {...result, results: await Promise.all(result.results.map(withVerifiedDisplay))}, observedAt:Date.now(), observedAtMonotonic:performance.now(), observationEpoch};
      }

      const result = await listListings({
        skip: offset,
        limit: PAGE_SIZE,
        category: category || undefined,
        min_price: minPrice,
        max_price: maxPrice,
        fulfillment_type: DATA_FULFILLMENT_TYPES,
      });
      return {result: await Promise.all(result.map(withVerifiedDisplay)), observedAt:Date.now(), observedAtMonotonic:performance.now(), observationEpoch};
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
  const rawItems: ResultItem[] = filterDiscoverableItems(query.data?.pages.flatMap((page): ResultItem[] =>
    Array.isArray(page.result) ? page.result : page.result.results
  ) || []);

  const firstPage = query.data?.pages[0]?.result;
  const firstSearchPage = Array.isArray(firstPage) ? undefined : firstPage;
  const facets = Array.isArray(firstPage) ? null : firstSearchPage?.facets;
  const total = semanticMode ? firstSearchPage?.total || rawItems.length : rawItems.length;

  const queryHints = semanticMode && enabled && query.isSuccess && !query.isFetching
    && !query.isPlaceholderData && !expired ? firstSearchPage : undefined;

  return {
    ...query,
    items: expired ? rawItems.map(withoutDisplay) : rawItems,
    currentDisplayExpired: expired,
    facets,
    total,
    suggestedQuery: queryHints?.suggested_query,
    hint: queryHints?.hint,
    semanticMode,
    pageSize: PAGE_SIZE,
  };
}

function withoutDisplay<T extends ResultItem>(item: T): T {
  if (!('license_display' in item)) return item;
  return {...item, license_display: null};
}

async function withVerifiedDisplay<T extends ResultItem>(item: T): Promise<T> {
  if (!item.license_display) return item;
  try {
    const {display} = await verifyCurrentListing({...item});
    return {...item, license_display: display};
  } catch {
    return withoutDisplay(item);
  }
}

export function filterDiscoverableItems(items: ResultItem[]) {
  return items.filter((item) => !('status' in item) || item.status !== 'unlisted');
}
