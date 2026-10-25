// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingListItem, SearchResultItem } from '@/types';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/listings',
  useSearchListings: vi.fn(),
  searchParams: new URLSearchParams('category=finance'),
  facetQuery: {
    data: { healthcare: 2 } as Record<string, number> | undefined,
    isError: false,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/hooks/useSearchListings', () => ({
  useSearchListings: mocks.useSearchListings,
}));

vi.mock('@/hooks/useMarketplaceCategoryFacets', () => ({
  useMarketplaceCategoryFacets: () => mocks.facetQuery,
}));

vi.mock('@/components/search/SearchForm', () => ({
  SearchForm: () => <div data-testid="search-form" />,
}));

vi.mock('@/components/search/MarketplaceListingCard', () => ({
  MarketplaceListingCard: ({ listing }: { listing: { id: string } }) => (
    <div data-testid="listing-card" data-listing-id={listing.id} />
  ),
}));

import { MarketplaceSearchExperience } from './MarketplaceSearchExperience';

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.pathname = '/listings';
  mocks.searchParams = new URLSearchParams('category=finance');
  mocks.facetQuery.data = { healthcare: 2 };
  mocks.facetQuery.isError = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.useSearchListings.mockReset();
});

describe('MarketplaceSearchExperience', () => {
  describe('loaded format metadata', () => {
    const legacyListing: ListingListItem = {
      id: 'legacy', slug: 'legacy', title: 'Legacy listing', short_description: null,
      price: 10, pricing_type: 'one_time', access_window_days: 7,
      category: 'finance', tags: [], privacy_score: null, listing_type: 'raw',
      fulfillment_type: 'file_download', task_category: null, domain_tags: null,
      model_provider: null, trust_level: 'L0', view_count: 0,
      created_at: '2026-10-19T00:00:00Z',
    };
    const browseItems: ListingListItem[] = [
      { ...legacyListing, id: 'csv-1', data_format: 'csv' },
      { ...legacyListing, id: 'csv-2', data_format: 'csv' },
      { ...legacyListing, id: 'json', data_format: 'json' },
      { ...legacyListing, id: 'parquet', data_format: 'parquet' },
      { ...legacyListing, id: 'null-format', data_format: null },
      legacyListing,
    ];

    function mockLoadedItems(items: ListingListItem[] | SearchResultItem[], semanticMode = false) {
      mocks.useSearchListings.mockReturnValue({
        items, facets: null, total: items.length, semanticMode,
        isLoading: false, isError: false, error: null, hasNextPage: false,
        isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
      });
    }

    function renderedListingIds() {
      return screen.queryAllByTestId('listing-card').map((card) => card.getAttribute('data-listing-id'));
    }

    it('offers counted formats from loaded browse metadata without inventing legacy formats', () => {
      mocks.searchParams = new URLSearchParams('type=data');
      mockLoadedItems(browseItems);
      render(<MarketplaceSearchExperience mode="browse" />);

      const select = screen.getByRole('combobox', { name: 'Data type' });
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'All formats', 'CSV (2)', 'JSON (1)', 'PARQUET (1)',
      ]);
      expect(screen.getByText('Counts reflect loaded results only')).toBeTruthy();
      expect(screen.getByText('6 results')).toBeTruthy();
      expect(renderedListingIds()).toEqual(browseItems.map((item) => item.id));
    });

    it.each([
      { format: 'csv', ids: ['csv-1', 'csv-2'] },
      { format: 'json', ids: ['json'] },
      { format: 'parquet', ids: ['parquet'] },
    ])('selects $format through the URL and excludes other and unknown formats', ({ format, ids }) => {
      mocks.searchParams = new URLSearchParams('type=data&category=finance');
      mockLoadedItems(browseItems);
      const view = render(<MarketplaceSearchExperience mode="browse" />);

      fireEvent.change(screen.getByRole('combobox', { name: 'Data type' }), { target: { value: format } });
      expect(mocks.replace).toHaveBeenCalledTimes(1);
      const url = new URL(mocks.replace.mock.calls[0][0], 'https://ai.market');
      expect(url.pathname).toBe('/listings');
      expect(url.searchParams.get('type')).toBe('data');
      expect(url.searchParams.get('category')).toBe('finance');
      expect(url.searchParams.get('data_type')).toBe(format);
      mocks.searchParams = url.searchParams;
      view.rerender(<MarketplaceSearchExperience mode="browse" />);

      expect((screen.getByRole('combobox', { name: 'Data type' }) as HTMLSelectElement).value).toBe(format);
      expect(renderedListingIds()).toEqual(ids);
      expect(screen.getByText(`${ids.length} result${ids.length === 1 ? '' : 's'} filtered to ${format.toUpperCase()}`)).toBeTruthy();
      expect(screen.getByText('Counts reflect loaded results only')).toBeTruthy();

      fireEvent.change(screen.getByRole('combobox', { name: 'Data type' }), { target: { value: '' } });
      const clearedUrl = new URL(mocks.replace.mock.calls[1][0], 'https://ai.market');
      expect(clearedUrl.searchParams.has('data_type')).toBe(false);
      mocks.searchParams = clearedUrl.searchParams;
      view.rerender(<MarketplaceSearchExperience mode="browse" />);
      expect(renderedListingIds()).toEqual(browseItems.map((item) => item.id));
    });

    it('keeps null and absent legacy metadata visible with only the all-formats choice', () => {
      mocks.searchParams = new URLSearchParams('type=data');
      mockLoadedItems(browseItems.slice(4));
      render(<MarketplaceSearchExperience mode="browse" />);

      const select = screen.getByRole('combobox', { name: 'Data type' });
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['All formats']);
      expect(renderedListingIds()).toEqual(['null-format', 'legacy']);
      expect(screen.getByText('2 results')).toBeTruthy();
    });

    it('continues filtering semantic format metadata through the URL', () => {
      mocks.pathname = '/search';
      mocks.searchParams = new URLSearchParams('q=traffic&type=data');
      const semanticItems: SearchResultItem[] = ['csv', 'json', null].map((data_format, index) => ({
        id: `semantic-${index}`, slug: `semantic-${index}`, title: 'Related listing',
        description: null, short_description: null, category: 'finance', price: 10,
        privacy_score: null, compliance_status: null, data_format, source_row_count: null, tags: [],
      }));
      mockLoadedItems(semanticItems, true);
      const view = render(<MarketplaceSearchExperience mode="search" />);
      expect(renderedListingIds()).toEqual(semanticItems.map((item) => item.id));
      expect(screen.getByRole('option', { name: 'CSV (1)' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'JSON (1)' })).toBeTruthy();

      fireEvent.change(screen.getByRole('combobox', { name: 'Data type' }), { target: { value: 'csv' } });
      const url = new URL(mocks.replace.mock.calls[0][0], 'https://ai.market');
      expect(url.pathname).toBe('/search');
      expect(url.searchParams.get('q')).toBe('traffic');
      expect(url.searchParams.get('type')).toBe('data');
      expect(url.searchParams.get('data_type')).toBe('csv');
      mocks.searchParams = url.searchParams;
      view.rerender(<MarketplaceSearchExperience mode="search" />);

      expect(renderedListingIds()).toEqual(['semantic-0']);
      expect(screen.getByText('Marketplace suggestions for "traffic"')).toBeTruthy();
      expect(screen.getByText(/ranked by meaning and may be related rather than exact/i)).toBeTruthy();
      expect(screen.getByText('Counts reflect loaded results only')).toBeTruthy();
    });
  });

  describe.each([
    { mode: 'browse' as const, semanticMode: false, params: 'type=data&data_type=json' },
    { mode: 'search' as const, semanticMode: true, params: 'q=traffic&type=data&data_type=json' },
  ])('$mode result loading', ({ mode, semanticMode, params }) => {
    it.each([0, 1, 2])('replaces pending text with the completed count of %i', (count) => {
      mocks.pathname = mode === 'search' ? '/search' : '/listings';
      mocks.searchParams = new URLSearchParams(params);
      const pending = {
        items: [], facets: null, total: 0, semanticMode,
        isLoading: true, isError: false, error: null, hasNextPage: false,
        isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
      };
      mocks.useSearchListings.mockReturnValue(pending);

      const view = render(<MarketplaceSearchExperience mode={mode} />);

      expect(screen.getByText('Loading results...')).toBeTruthy();
      expect(screen.queryByText(/0 (results|suggestions)/)).toBeNull();
      expect(screen.queryByText('No data found')).toBeNull();
      expect(screen.queryByText(/Try adjusting the search text or filters/)).toBeNull();

      mocks.useSearchListings.mockReturnValue({
        ...pending,
        isLoading: false,
        total: count,
        items: Array.from({ length: count }, (_, index) => ({
          id: `listing-${index}`, price: 10, data_format: 'json',
        })),
      });
      view.rerender(<MarketplaceSearchExperience mode={mode} />);

      expect(screen.queryByText('Loading results...')).toBeNull();
      const noun = semanticMode && count > 0 ? 'suggestion' : 'result';
      expect(screen.getByText(`${count} ${noun}${count === 1 ? '' : 's'} filtered to JSON`)).toBeTruthy();
      expect(screen.queryAllByTestId('listing-card')).toHaveLength(count);
      if (count === 0) {
        expect(screen.getByText('No data found')).toBeTruthy();
        expect(screen.getByText(/Try adjusting the search text or filters/)).toBeTruthy();
      } else {
        expect(screen.queryByText('No data found')).toBeNull();
      }
    });
  });

  describe.each([
    { mode: 'browse' as const, semanticMode: false },
    { mode: 'search' as const, semanticMode: true },
  ])('$mode format pagination', ({ mode, semanticMode }) => {
    const csv = { id: 'first-csv', price: 10, data_format: 'csv' };
    const json = { id: 'later-json', price: 20, data_format: 'json' };

    function setup(overrides = {}) {
      mocks.pathname = semanticMode ? '/search' : '/listings';
      mocks.searchParams = new URLSearchParams({
        type: 'data', data_type: 'json', ...(semanticMode ? { q: 'traffic' } : {}),
      });
      const state = {
        items: [csv], facets: null, total: 24, semanticMode,
        isLoading: false, isError: false, error: null, hasNextPage: true,
        isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
        ...overrides,
      };
      mocks.useSearchListings.mockReturnValue(state);
      return state;
    }

    it('retains an absent selected format and reaches a later match only after explicit continuation', () => {
      const state = setup();
      const view = render(<MarketplaceSearchExperience mode={mode} />);

      expect(screen.queryAllByTestId('listing-card')).toHaveLength(0);
      expect(screen.getByText('No matching data loaded yet')).toBeTruthy();
      expect(screen.queryByText('No data found')).toBeNull();
      expect(screen.getByText(/Load more results to look for matches/)).toBeTruthy();
      expect((screen.getByRole('combobox', { name: 'Data type' }) as HTMLSelectElement).value).toBe('json');
      expect(screen.getByRole('option', { name: 'JSON (0 loaded)' })).toBeTruthy();
      expect(screen.getByText('0 results filtered to JSON')).toBeTruthy();
      expect(screen.getByText('Counts reflect loaded results only')).toBeTruthy();
      expect(state.fetchNextPage).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      expect(state.fetchNextPage).toHaveBeenCalledTimes(1);
      mocks.useSearchListings.mockReturnValue({ ...state, items: [csv, json], hasNextPage: false });
      view.rerender(<MarketplaceSearchExperience mode={mode} />);

      expect(screen.getByTestId('listing-card').getAttribute('data-listing-id')).toBe('later-json');
      expect(screen.getByRole('option', { name: 'JSON (1)' })).toBeTruthy();
      expect(screen.getByText(`1 ${semanticMode ? 'suggestion' : 'result'} filtered to JSON`)).toBeTruthy();
      expect(screen.queryByText(/24 (results|suggestions) filtered/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      expect(screen.getByText("You've reached the end of the results.")).toBeTruthy();
      expect(state.fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('preserves definitive empty recovery when no pages remain', () => {
      const state = setup({ hasNextPage: false });
      render(<MarketplaceSearchExperience mode={mode} />);
      expect(screen.getByText('No data found')).toBeTruthy();
      expect(screen.getByText(/Try adjusting the search text or filters/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      expect(state.fetchNextPage).not.toHaveBeenCalled();
      if (semanticMode) expect(screen.getByRole('link', { name: 'Browse all marketplace listings' }).getAttribute('href')).toBe('/listings');
    });

    it('disables continuation while the next page is pending', () => {
      const state = setup({ isFetchingNextPage: true });
      render(<MarketplaceSearchExperience mode={mode} />);
      const button = screen.getByRole('button', { name: 'Loading more...' }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(state.fetchNextPage).not.toHaveBeenCalled();
    });

    it.each(['loading', 'error'])('withholds continuation during initial %s and preserves recovery', (status) => {
      const state = setup({ isLoading: status === 'loading', isError: status === 'error', error: new Error('Synthetic failure') });
      render(<MarketplaceSearchExperience mode={mode} />);
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      expect(screen.queryByText('No matching data loaded yet')).toBeNull();
      expect(state.fetchNextPage).not.toHaveBeenCalled();
      if (status === 'loading') expect(screen.getByText('Loading results...')).toBeTruthy();
      else {
        expect(screen.getByText('Synthetic failure')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(state.refetch).toHaveBeenCalledTimes(1);
      }
    });

    it('preserves ordinary unfiltered counts, ordering and explicit pagination', () => {
      const state = setup({ items: [csv, json] });
      mocks.searchParams.delete('data_type');
      render(<MarketplaceSearchExperience mode={mode} />);
      expect(screen.getByText(semanticMode ? '24 suggestions' : '2 results')).toBeTruthy();
      expect(screen.getAllByTestId('listing-card').map((card) => card.getAttribute('data-listing-id'))).toEqual(['first-csv', 'later-json']);
      expect((screen.getByRole('combobox', { name: 'Sort' }) as HTMLSelectElement).value).toBe(semanticMode ? 'relevance' : 'newest');
      expect(state.fetchNextPage).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      expect(state.fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('keeps an exact case-sensitive URL format without assigning missing metadata', () => {
      setup({ items: [csv, json, { id: 'unknown', price: 10 }] });
      mocks.searchParams.set('data_type', 'JSON');
      render(<MarketplaceSearchExperience mode={mode} />);
      expect((screen.getByRole('combobox', { name: 'Data type' }) as HTMLSelectElement).value).toBe('JSON');
      expect(screen.getByRole('option', { name: 'JSON (0 loaded)' })).toBeTruthy();
      expect(screen.queryAllByTestId('listing-card')).toHaveLength(0);
    });
  });

  it('clears the search query and filters from the marketplace URL', () => {
    mocks.searchParams = new URLSearchParams(
      'q=financial+markets&type=data&category=finance&sort=price-asc',
    );
    mocks.useSearchListings.mockReturnValue({
      items: [],
      facets: null,
      total: 0,
      semanticMode: true,
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(<MarketplaceSearchExperience mode="browse" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(mocks.push).toHaveBeenCalledWith('/listings');
  });

  function renderPriceFilters() {
    vi.useFakeTimers();
    mocks.useSearchListings.mockReturnValue({
      items: [], facets: null, total: 0, semanticMode: false,
      isLoading: false, isError: false, error: null, hasNextPage: false,
      isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    });
    return render(<MarketplaceSearchExperience mode="browse" />);
  }

  it('retains both prices entered within one debounce interval', () => {
    renderPriceFilters();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum price' }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum price' }), { target: { value: '20' } });
    act(() => vi.advanceTimersByTime(500));
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    const url = new URL(mocks.replace.mock.calls[0][0], 'https://ai.market');
    expect(url.searchParams.get('min_price')).toBe('10');
    expect(url.searchParams.get('max_price')).toBe('20');
    expect(url.searchParams.get('category')).toBe('finance');
  });

  it('does not restore an old search after clearing a pending price edit', () => {
    mocks.searchParams = new URLSearchParams('q=traffic&category=finance');
    renderPriceFilters();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum price' }), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    act(() => vi.advanceTimersByTime(500));
    expect(mocks.push).toHaveBeenCalledWith('/listings');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect((screen.getByRole('spinbutton', { name: 'Minimum price' }) as HTMLInputElement).value).toBe('');
  });

  it('keeps a pending price when another filter changes', () => {
    renderPriceFilters();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum price' }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'price-asc' } });
    act(() => vi.advanceTimersByTime(500));
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    const url = new URL(mocks.replace.mock.calls[0][0], 'https://ai.market');
    expect(url.searchParams.get('min_price')).toBe('10');
    expect(url.searchParams.get('sort')).toBe('price-asc');
  });

  it('cancels a pending price edit when navigation changes the URL', () => {
    const view = renderPriceFilters();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum price' }), { target: { value: '10' } });
    mocks.searchParams = new URLSearchParams('category=healthcare');
    view.rerender(<MarketplaceSearchExperience mode="browse" />);
    act(() => vi.advanceTimersByTime(500));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect((screen.getByRole('spinbutton', { name: 'Minimum price' }) as HTMLInputElement).value).toBe('');
  });

  it('keeps a direct link to an empty category active and shows the empty state', () => {
    mocks.useSearchListings.mockReturnValue({
      items: [],
      facets: null,
      total: 0,
      semanticMode: false,
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(<MarketplaceSearchExperience mode="browse" />);

    expect(mocks.useSearchListings).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance' }),
    );
    expect(screen.getByText('No listings found')).toBeTruthy();

    const select = screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement;
    expect(select.value).toBe('finance');
    const selectedContext = screen.getByRole('option', { name: 'Finance (0)' }) as HTMLOptionElement;
    expect(selectedContext.disabled).toBe(true);
    expect(screen.getByRole('option', { name: 'Healthcare (2)' })).toBeTruthy();
  });

  it('falls back to the full category filter when facet loading fails', () => {
    mocks.searchParams = new URLSearchParams();
    mocks.facetQuery.data = undefined;
    mocks.facetQuery.isError = true;
    mocks.useSearchListings.mockReturnValue({
      items: [],
      facets: null,
      total: 0,
      semanticMode: false,
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(<MarketplaceSearchExperience mode="browse" />);

    expect(screen.getByRole('option', { name: 'Finance' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Government' })).toBeTruthy();
  });

  it('offers the full catalog when a search has no results', () => {
    mocks.pathname = '/search';
    mocks.searchParams = new URLSearchParams('q=traffic');
    mocks.useSearchListings.mockReturnValue({
      items: [],
      facets: null,
      total: 0,
      semanticMode: true,
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(<MarketplaceSearchExperience mode="search" />);

    expect(screen.getByText('No listings found')).toBeTruthy();
    const recoveryLink = screen.getByRole('link', {
      name: 'Browse all marketplace listings',
    });
    expect(recoveryLink.getAttribute('href')).toBe('/listings');
  });

  it('labels nonempty semantic results as related suggestions', () => {
    const query = 'real-time telepathy recordings from wild unicorns on Mars';
    mocks.pathname = '/search';
    mocks.searchParams = new URLSearchParams({ q: query });
    mocks.useSearchListings.mockReturnValue({
      items: [
        {
          id: 'listing-1',
          slug: 'related-listing-1',
          title: 'Related listing one',
          description: 'A semantically related listing.',
          short_description: 'A semantically related listing.',
          category: 'Research',
          price: 10,
          privacy_score: null,
          compliance_status: null,
          data_format: 'json',
          source_row_count: 100,
          tags: [],
        },
        {
          id: 'listing-2',
          slug: 'related-listing-2',
          title: 'Related listing two',
          description: 'Another semantically related listing.',
          short_description: 'Another semantically related listing.',
          category: 'Research',
          price: 20,
          privacy_score: null,
          compliance_status: null,
          data_format: 'csv',
          source_row_count: 200,
          tags: [],
        },
      ],
      facets: null,
      total: 2,
      semanticMode: true,
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    render(<MarketplaceSearchExperience mode="search" />);

    expect(screen.getByText(`Marketplace suggestions for "${query}"`)).toBeTruthy();
    expect(screen.getByText('2 suggestions')).toBeTruthy();
    expect(screen.getByText(/ranked by meaning and may be related rather than exact/i)).toBeTruthy();
    expect(screen.getByText(/refine your search text or filters if they do not fit/i)).toBeTruthy();
    expect(screen.getAllByTestId('listing-card')).toHaveLength(2);
  });
});
