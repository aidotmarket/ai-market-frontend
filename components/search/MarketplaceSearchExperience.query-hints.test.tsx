// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketplaceSearchExperience } from './MarketplaceSearchExperience';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
  push: vi.fn(),
  listListings: vi.fn(),
  searchListings: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/listings',
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('@/api/listings', () => ({
  listListings: mocks.listListings,
  searchListings: mocks.searchListings,
  getMarketplaceCategoryFacets: async () => ({ finance: 4 }),
}));
vi.mock('@/components/search/MarketplaceListingCard', () => ({
  MarketplaceListingCard: ({ listing }: { listing: { title: string } }) => <p>{listing.title}</p>,
}));

const emptyPage = { results: [], total: 0 };
const correction = { suggested_query: 'climate data' };
const hint = { hint: 'no_results_try_other_words' };
const correctionName = 'Did you mean climate data?';
const hintText = 'Try searching with different words.';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const experience = () => (
    <QueryClientProvider client={client}>
      <MarketplaceSearchExperience mode="browse" />
    </QueryClientProvider>
  );
  const view = render(experience());
  return (params: URLSearchParams) => {
    mocks.searchParams = params;
    view.rerender(experience());
  };
}

function expectNoHints() {
  expect(screen.queryByRole('button', { name: /Did you mean/ })).toBeNull();
  expect(screen.queryByText(hintText)).toBeNull();
}

beforeEach(() => {
  mocks.searchParams = new URLSearchParams('q=climte+data');
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('waits for an explicit correction and then searches with all the active filters', async () => {
  const filters = { category: 'finance', type: 'data', data_type: 'csv', min_price: '5', max_price: '30', sort: 'price-asc' };
  mocks.searchParams = new URLSearchParams({ q: 'climte data', ...filters, page: '2', per_page: '12', offset: '12' });
  mocks.searchListings
    .mockResolvedValueOnce({ ...emptyPage, ...correction })
    .mockResolvedValueOnce({ results: [{ id: 'eu-emissions', title: 'EU emissions dataset', data_format: 'csv' }], total: 1 });
  const navigate = setup();
  const button = await screen.findByRole('button', { name: correctionName });

  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('climte data');
  expect(screen.getByText('Data results for "climte data"')).toBeTruthy();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.searchListings).toHaveBeenCalledExactlyOnceWith('climte data', expect.objectContaining({ offset: 0 }));

  fireEvent.click(button);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  const url = new URL(mocks.replace.mock.calls[0][0], 'https://ai.market');
  expect(url.pathname).toBe('/listings');
  expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'climate data', ...filters });
  navigate(url.searchParams);

  expect(await screen.findByText('EU emissions dataset')).toBeTruthy();
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('climate data');
  expect(mocks.searchListings).toHaveBeenLastCalledWith('climate data', expect.objectContaining({
    category: 'finance', min_price: 5, max_price: 30, fulfillment_type: ['ai_queryable', 'file_download'], offset: 0,
  }));
  expectNoHints();
});

it('ignores correction and hint metadata on a later page', async () => {
  mocks.searchListings
    .mockResolvedValueOnce({ results: Array.from({ length: 12 }, (_, id) => ({ id })), total: 13 })
    .mockResolvedValueOnce({ results: [{ id: 'later', title: 'Later result' }], total: 13, ...correction, ...hint });
  setup();

  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Later result')).toBeTruthy();
  expectNoHints();
});

it('clears the previous hint during loading, after a new query fails, and in browse', async () => {
  let failSearch!: (error: Error) => void;
  mocks.searchListings
    .mockResolvedValueOnce({ ...emptyPage, ...hint })
    .mockReturnValueOnce(new Promise((_resolve, reject) => { failSearch = reject; }));
  mocks.listListings.mockResolvedValueOnce([]);
  const navigate = setup();
  expect(await screen.findByText(hintText)).toBeTruthy();

  navigate(new URLSearchParams('q=traffic+data'));
  expect(screen.getByText('Loading results...')).toBeTruthy();
  expectNoHints();
  await waitFor(() => expect(mocks.searchListings).toHaveBeenCalledTimes(2));
  failSearch(new Error('Search unavailable'));
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  expectNoHints();

  navigate(new URLSearchParams());
  expect(await screen.findByText('No listings found')).toBeTruthy();
  expectNoHints();
});
