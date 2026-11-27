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
const emptyPage = { results: [], total: 0 };
const correction = { suggested_query: 'climate data' };
const hint = { hint: 'no_results_try_other_words' };
const correctionName = 'Did you mean climate data?';
const hintText = 'Try searching with different words.';
const dataFulfillmentTypes = ['ai_queryable', 'file_download', 'reference'];
const referenceListing = {
  id: 'synthetic-reference', slug: 'synthetic-reference', title: 'Synthetic public source dataset',
  fulfillment_type: 'reference', category: 'finance', data_format: 'csv', price: 20,
};
const firstPageListings = Array.from({ length: 12 }, (_, index) => ({
  id: `fixture-${index}`, slug: `fixture-${index}`, title: `Fixture dataset ${index}`,
  category: 'finance', data_format: 'json', price: 15,
}));

function expectDiscoveryRequests(fetchMock: ReturnType<typeof mockDiscoveryFetch>, path: string, pagination: string) {
  expect(fetchMock).toHaveBeenCalledTimes(2);
  return fetchMock.mock.calls.map(([request], index) => {
    const url = new URL(request.url);
    expect(url.pathname).toBe(`/api/v1/${path}`);
    expect(url.searchParams.getAll('fulfillment_type')).toEqual(dataFulfillmentTypes);
    expect(url.searchParams.has('fulfillment_type[]')).toBe(false);
    expect(url.searchParams.get('limit')).toBe('12');
    expect(url.searchParams.get(pagination)).toBe(String(index * 12));
    return url.searchParams;
  });
}

function mockDiscoveryFetch(firstPage: unknown, secondPage: (items: typeof referenceListing[]) => unknown) {
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>()
    .mockImplementationOnce(async () => Response.json(firstPage))
    .mockImplementationOnce(async request => {
      const types = new URL(request.url).searchParams.getAll('fulfillment_type');
      return Response.json(secondPage(types.includes(referenceListing.fulfillment_type) ? [referenceListing] : []));
    });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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
  vi.unstubAllGlobals();
});

it('waits for an explicit correction and then searches with all the active filters', async () => {
  const filters = { category: 'finance', data_type: 'csv', min_price: '5', max_price: '30', sort: 'price-asc' };
  const request = {
    category: 'finance', min_price: 5, max_price: 30,
    fulfillment_type: dataFulfillmentTypes, limit: 12, offset: 0,
  };
  mocks.searchParams = new URLSearchParams({ q: 'climte data', ...filters, page: '2', per_page: '12', offset: '12' });
  mocks.searchListings
    .mockResolvedValueOnce({ ...emptyPage, ...correction })
    .mockResolvedValueOnce({ results: [{ ...firstPageListings[0], title: 'EU emissions dataset', data_format: 'csv' }], total: 1 });
  const navigate = setup();
  const button = await screen.findByRole('button', { name: correctionName });

  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('climte data');
  expect(screen.getByText('Data results for "climte data"')).toBeTruthy();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.searchListings).toHaveBeenCalledExactlyOnceWith('climte data', request);

  fireEvent.click(button);
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  const url = new URL(mocks.replace.mock.calls[0][0], 'https://ai.market');
  expect(url.pathname).toBe('/listings');
  expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'climate data', ...filters });
  navigate(url.searchParams);

  expect(await screen.findByText('EU emissions dataset')).toBeTruthy();
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('climate data');
  expect(mocks.searchListings).toHaveBeenLastCalledWith('climate data', request);
  expect(mocks.listListings).not.toHaveBeenCalled();
  expectNoHints();
});

it('ignores correction and hint metadata on a later page', async () => {
  const { searchListings } = await vi.importActual<typeof import('@/api/listings')>('@/api/listings');
  mocks.searchListings.mockImplementation(searchListings);
  const fetchMock = mockDiscoveryFetch(
    { results: firstPageListings, total: 13 },
    results => ({ results, total: 13, ...correction, ...hint }),
  );
  setup();

  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  const link = await screen.findByRole('link', { name: new RegExp(referenceListing.title) });
  expect(link.getAttribute('href')).toBe(`/listings/${referenceListing.slug}`);
  for (const params of expectDiscoveryRequests(fetchMock, 'search/listings', 'offset')) {
    expect(params.get('q')).toBe('climte data');
  }
  expectNoHints();
});

it('browses and pages through data with no type selector in the URL', async () => {
  mocks.searchParams = new URLSearchParams('category=finance&min_price=5&max_price=30&data_type=csv&sort=price-asc');
  const { listListings } = await vi.importActual<typeof import('@/api/listings')>('@/api/listings');
  mocks.listListings.mockImplementation(listListings);
  const fetchMock = mockDiscoveryFetch(firstPageListings, items => items);
  setup();

  const loadMore = await screen.findByRole('button', { name: 'Load more' });
  expect(screen.getByText('Showing 0 results filtered to CSV')).toBeTruthy();

  fireEvent.click(loadMore);
  const link = await screen.findByRole('link', { name: new RegExp(referenceListing.title) });
  expect(link.getAttribute('href')).toBe(`/listings/${referenceListing.slug}`);
  expect(screen.getByText('1 result filtered to CSV')).toBeTruthy();
  for (const params of expectDiscoveryRequests(fetchMock, 'listings/', 'skip')) {
    expect(params.get('category')).toBe('finance');
    expect(params.get('min_price')).toBe('5');
    expect(params.get('max_price')).toBe('30');
  }
  expect(mocks.searchListings).not.toHaveBeenCalled();
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
  expect(await screen.findByText('No data found')).toBeTruthy();
  expectNoHints();
});
