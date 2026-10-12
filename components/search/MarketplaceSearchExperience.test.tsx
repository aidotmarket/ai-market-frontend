// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  MarketplaceListingCard: () => <div data-testid="listing-card" />,
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
