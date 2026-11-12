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
  vi.useRealTimers();
  vi.resetAllMocks();
});

it.each(['', 'licence'])('keeps a pre-restore response hidden after restoring %j', async q => {
  vi.useFakeTimers({ toFake: ['Date'] });
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

  const response = q ? { results: [listing], total: 1 } : [listing];
  const route = q ? api.searchListings : api.listListings;
  route.mockResolvedValueOnce(response);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const search = renderHook(() => useSearchListings({ q }), { wrapper });
  await waitFor(() => expect(search.result.current.items).toHaveLength(1));

  let finish!: (value: typeof response) => void;
  route.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  route.mockRejectedValue(new Error('Controlled post-restore refresh failure'));
  const request = search.result.current.refetch();
  await waitFor(() => expect(route).toHaveBeenCalledTimes(2));

  vi.setSystemTime(Date.now() - 60 * 60_000 + 16 * 60_000);
  act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(search.result.current.items).toHaveLength(0);
  expect(search.result.current.isLoading).toBe(true);
  expect(search.result.current.isError).toBe(false);
  expect(search.result.current.error).toBeNull();

  await act(async () => {
    finish(response);
    await request;
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(search.result.current.items).toHaveLength(0);
  search.unmount();
  client.clear();
});

it.each(['', 'licence'])('expires %j after foreground sleep and a failed refresh without pageshow', async q => {
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
  vi.setSystemTime(Date.now() + minute - 60 * minute + 16 * minute);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  route.mockRejectedValue(new Error('Controlled refresh failure'));
  await act(async () => { await search.result.current.refetch(); });
  await waitFor(() => expect(search.result.current.isError).toBe(true));
  expect(search.result.current.items).toHaveLength(0);
  search.unmount();
  client.clear();
});
