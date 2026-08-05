// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  useSearchListings: vi.fn(),
  searchParams: new URLSearchParams('category=finance'),
  facetQuery: {
    data: { healthcare: 2 } as Record<string, number> | undefined,
    isError: false,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/listings',
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
  mocks.searchParams = new URLSearchParams('category=finance');
  mocks.facetQuery.data = { healthcare: 2 };
  mocks.facetQuery.isError = false;
});

afterEach(() => {
  cleanup();
  mocks.useSearchListings.mockReset();
});

describe('MarketplaceSearchExperience', () => {
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
});
