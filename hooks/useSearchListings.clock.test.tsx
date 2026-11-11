// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { MarketplaceListingCard } from '@/components/search/MarketplaceListingCard';
import wire from '@/tests/fixtures/s1922-backend-wire.json';
import { useSearchListings } from './useSearchListings';

const query = vi.hoisted(() => ({ useInfiniteQuery: vi.fn() }));
const api = vi.hoisted(() => ({ listListings: vi.fn(), searchListings: vi.fn() }));
vi.mock('@tanstack/react-query', () => query);
vi.mock('@/api/listings', () => api);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetAllMocks();
});

// Adapted from Athena's s1929 diagnostic: retain a corrected licence after a failed refresh.
function retainedSearch() {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'performance'] });
  vi.setSystemTime(10_000_000);
  const correction = wire.public[2].corrected;
  const listing = {
    id: correction.listing_id,
    slug: 'synthetic',
    title: 'Synthetic',
    short_description: 'Synthetic',
    price: 1,
    category: 'Business',
    tags: [],
    privacy_score: null,
    status: 'published',
    license_display: {
      license_label: correction.license_label,
      provenance: correction.provenance,
      correction_id: correction.correction_id,
      correction_digest: correction.correction_digest,
    },
  };
  query.useInfiniteQuery.mockReturnValue({
    data: { pages: [{ result: [listing], observedAt: Date.now(), observedAtMonotonic: performance.now() }] },
    isError: true,
    error: new Error('Controlled refresh failure'),
  });
  return renderHook(() => useSearchListings({}));
}

function cards(search: ReturnType<typeof retainedSearch>) {
  return renderToStaticMarkup(<>{search.result.current.items.map(listing => (
    <MarketplaceListingCard key={listing.id} listing={listing} />
  ))}</>);
}

function expectExpired(search: ReturnType<typeof retainedSearch>) {
  expect(search.result.current.items).toEqual([]);
  expect(search.result.current.isError).toBe(true);
  expect(search.result.current.error?.message).toBe('Refresh to load current marketplace results.');
  expect(cards(search)).not.toContain('ai.market Standard Data Licence v1.1');
}

it('preserves ordinary timing, expiring at the existing ten-minute boundary', () => {
  const search = retainedSearch();
  act(() => vi.advanceTimersByTime(9 * 60_000));
  expect(cards(search)).toContain('ai.market Standard Data Licence v1.1');
  act(() => vi.advanceTimersByTime(60_000));
  expectExpired(search);
});

it('removes the retained licence card after a backward wall-clock change and failed refresh', () => {
  const search = retainedSearch();
  expect(cards(search)).toContain('ai.market Standard Data Licence v1.1');
  act(() => vi.advanceTimersByTime(60_000));
  vi.setSystemTime(Date.now() - 60 * 60_000);
  act(() => vi.advanceTimersByTime(15 * 60_000));
  expect(performance.now()).toBe(16 * 60_000);
  expectExpired(search);
});

it('expires immediately on persisted pageshow even if the suspended performance clock paused', () => {
  const search = retainedSearch();
  vi.setSystemTime(Date.now() + 16 * 60_000);
  expect(search.result.current.items).toHaveLength(1);
  act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expectExpired(search);
});

it.each(['pageshow', 'visibilitychange'])('rechecks monotonic expiry on %s before any timer tick', event => {
  const search = retainedSearch();
  vi.setSystemTime(Date.now() - 60 * 60_000);
  vi.spyOn(performance, 'now').mockReturnValue(16 * 60_000);
  expect(search.result.current.items).toHaveLength(1);
  act(() => {
    if (event === 'pageshow') {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    } else {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  expectExpired(search);
});

it.each(['', 'licence'])('timestamps successful %j queries with both clocks', async q => {
  retainedSearch().unmount();
  api.listListings.mockResolvedValue([]);
  api.searchListings.mockResolvedValue({ results: [], total: 0 });
  renderHook(() => useSearchListings({ q }));
  const options = query.useInfiniteQuery.mock.calls.at(-1)![0];
  vi.setSystemTime(Date.now() - 60 * 60_000);
  vi.spyOn(performance, 'now').mockReturnValue(42_000);
  const page = await options.queryFn({ pageParam: 0 });
  expect(page).toMatchObject({ observedAt: Date.now(), observedAtMonotonic: 42_000 });
  expect(q ? api.searchListings : api.listListings).toHaveBeenCalledOnce();
});
