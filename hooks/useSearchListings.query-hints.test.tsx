// @vitest-environment jsdom

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSearchListings } from './useSearchListings';

const api = vi.hoisted(() => ({ listListings: vi.fn(), searchListings: vi.fn() }));
vi.mock('@/api/listings', () => api);

const correction = { suggested_query: 'climate data', hint: 'first-page hint' };
const emptyPage = { results: [], total: 0 };
const fullPage = { results: Array.from({ length: 12 }, (_, id) => ({ id })), total: 13 };
const noHints = { suggestedQuery: undefined, hint: undefined };
const dataFulfillmentTypes = ['ai_queryable', 'file_download'];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } });
  return renderHook(({ q }) => useSearchListings({ q }), {
    initialProps: { q: 'climte data' },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each([true, false])('uses only page one with first-page metadata present: %s', async (hasCorrection) => {
  api.searchListings
    .mockResolvedValueOnce({ ...fullPage, ...(hasCorrection ? correction : {}) })
    .mockResolvedValueOnce({ ...emptyPage, suggested_query: 'later query', hint: 'later-page hint' });
  const search = setup();
  const expected = hasCorrection ? { suggestedQuery: 'climate data', hint: correction.hint } : noHints;

  await waitFor(() => expect(search.result.current.hasNextPage).toBe(true));
  expect(search.result.current).toMatchObject(expected);
  expect(api.searchListings).toHaveBeenCalledExactlyOnceWith('climte data', expect.objectContaining({
    offset: 0, fulfillment_type: dataFulfillmentTypes,
  }));

  await act(async () => { await search.result.current.fetchNextPage(); });
  await waitFor(() => expect(search.result.current.hasNextPage).toBe(false));
  expect(api.searchListings).toHaveBeenLastCalledWith('climte data', expect.objectContaining({
    offset: 12, fulfillment_type: dataFulfillmentTypes,
  }));
  expect(search.result.current).toMatchObject(expected);
});

it('withholds metadata during a refresh and after it fails even with cached results', async () => {
  let failRefresh!: (error: Error) => void;
  api.searchListings
    .mockResolvedValueOnce({ ...emptyPage, ...correction })
    .mockReturnValueOnce(new Promise((_resolve, reject) => { failRefresh = reject; }));
  const search = setup();
  await waitFor(() => expect(search.result.current.suggestedQuery).toBe('climate data'));

  act(() => { void search.result.current.refetch(); });
  await waitFor(() => expect(search.result.current.isFetching).toBe(true));
  expect(search.result.current).toMatchObject(noHints);

  failRefresh(new Error('Search unavailable'));
  await waitFor(() => expect(search.result.current.isError).toBe(true));
  expect(search.result.current).toMatchObject(noHints);
});

it('withholds previous-query metadata during and after navigation to a different query', async () => {
  let finishSearch!: (page: typeof emptyPage) => void;
  api.searchListings
    .mockResolvedValueOnce({ ...emptyPage, ...correction })
    .mockReturnValueOnce(new Promise(resolve => { finishSearch = resolve; }));
  const search = setup();
  await waitFor(() => expect(search.result.current.suggestedQuery).toBe('climate data'));

  search.rerender({ q: 'traffic data' });
  expect(search.result.current.isPlaceholderData).toBe(true);
  expect(search.result.current).toMatchObject(noHints);

  finishSearch(emptyPage);
  await waitFor(() => expect(search.result.current.isFetching).toBe(false));
  expect(search.result.current).toMatchObject(noHints);
});

it('withholds search metadata when switching to browse without a query', async () => {
  api.searchListings.mockResolvedValueOnce({ ...emptyPage, ...correction });
  api.listListings.mockResolvedValueOnce([]);
  const search = setup();
  await waitFor(() => expect(search.result.current.suggestedQuery).toBe('climate data'));

  search.rerender({ q: '' });
  expect(search.result.current).toMatchObject(noHints);
  await waitFor(() => expect(search.result.current.isFetching).toBe(false));
  expect(search.result.current).toMatchObject({ semanticMode: false, ...noHints });
  expect(api.listListings).toHaveBeenCalledTimes(1);
});

it('requests only data in search and browse and ignores legacy model results', async () => {
  const data = { id: 'dataset', fulfillment_type: 'file_download' };
  const items = [
    { id: 'model', fulfillment_type: 'model_access' },
    data,
    { id: 'pipeline', fulfillment_type: 'pipeline_invocation' },
  ];
  api.searchListings.mockResolvedValueOnce({ ...emptyPage, results: items });
  api.listListings.mockResolvedValueOnce(items);
  const search = setup();

  await waitFor(() => expect(search.result.current.items).toEqual([data]));
  expect(api.searchListings).toHaveBeenCalledExactlyOnceWith('climte data', expect.objectContaining({
    fulfillment_type: dataFulfillmentTypes,
  }));

  search.rerender({ q: '' });
  await waitFor(() => expect(search.result.current.isPlaceholderData).toBe(false));
  expect(search.result.current.items).toEqual([data]);
  expect(api.listListings).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    fulfillment_type: dataFulfillmentTypes,
  }));
});
