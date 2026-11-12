// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { MarketplaceListingCard } from '@/components/search/MarketplaceListingCard';
import wire from '@/tests/fixtures/s1922-backend-wire.json';
import { useSearchListings } from './useSearchListings';

const api = vi.hoisted(() => ({ listListings: vi.fn(), searchListings: vi.fn() }));
vi.mock('@/api/listings', () => api);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetAllMocks();
});

it.each(['', 'licence'])('hides an old %j card when sleep and a wall setback cancel at foreground return', async q => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(10_000_000);
  const monotonic = vi.spyOn(performance, 'now').mockReturnValue(0);
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

  const response = q ? { results: [listing], total: 1 } : [listing];
  const route = q ? api.searchListings : api.listListings;
  route.mockResolvedValueOnce(response);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const search = renderHook(() => useSearchListings({ q }), { wrapper });
  await waitFor(() => expect(search.result.current.items).toHaveLength(1));


  const minute = 60_000;
  monotonic.mockReturnValue(minute);
  vi.setSystemTime(Date.now() + minute - 16 * minute + 16 * minute);
  expect(Date.now() - 10_000_000).toBe(performance.now());
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  route.mockRejectedValue(new Error('Controlled refresh failure'));
  await act(async () => { await search.result.current.refetch(); });
  await waitFor(() => expect(search.result.current.isError).toBe(true));
  expect(search.result.current.items).toHaveLength(0);
  const cards = renderToStaticMarkup(<>{search.result.current.items.map(listing => (
    <MarketplaceListingCard key={listing.id} listing={listing} />
  ))}</>);
  expect(cards).not.toContain('ai.market Standard Data Licence v1.1');
  search.unmount();
  client.clear();
});
