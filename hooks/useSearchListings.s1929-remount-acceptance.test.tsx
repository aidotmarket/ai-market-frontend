// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
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


it.each(['', 'licence'])('keeps cached %j cards hidden if restoration happened while search was unmounted', async q => {
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
  function Search() {
    const { items } = useSearchListings({ q });
    return <>{items.map(item => <MarketplaceListingCard key={item.id} listing={item} />)}</>;
  }
  const tree = (search: boolean) => (
    <QueryClientProvider client={client}>{search ? <Search /> : <div>Another route</div>}</QueryClientProvider>
  );
  const view = render(tree(true));
  const label = 'ai.market Standard Data Licence v1.1';
  await waitFor(() => expect(view.container.textContent).toContain(label));
  view.rerender(tree(false));

  vi.setSystemTime(Date.now() - 60 * 60_000 + 16 * 60_000);
  act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  route.mockReturnValue(new Promise(() => {}));
  view.rerender(tree(true));
  expect(view.container.textContent).not.toContain(label);
  view.unmount();
  client.clear();
});
