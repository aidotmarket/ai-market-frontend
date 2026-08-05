// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_MARKETPLACE_CATEGORIES } from '@/lib/marketplaceCategories';

const mocks = vi.hoisted(() => ({
  facetQuery: {
    data: undefined as Record<string, number> | undefined,
    isPending: false,
    isError: false,
  },
}));

vi.mock('@/hooks/useMarketplaceCategoryFacets', () => ({
  useMarketplaceCategoryFacets: () => mocks.facetQuery,
}));

import { MarketplaceCategoryCards } from './MarketplaceCategoryCards';

beforeEach(() => {
  mocks.facetQuery.data = undefined;
  mocks.facetQuery.isPending = false;
  mocks.facetQuery.isError = false;
});

afterEach(cleanup);

describe('MarketplaceCategoryCards', () => {
  it('renders positive inventory categories with counts and hides zero inventory', () => {
    mocks.facetQuery.data = {
      finance: 0,
      healthcare: 2,
      geospatial: 1,
    };

    render(<MarketplaceCategoryCards />);

    expect(screen.getByRole('link', { name: /Healthcare \(2\)/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Geospatial \(1\)/ })).toBeTruthy();
    expect(screen.queryByText('Finance')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('falls back to the full static catalog after a facet request failure', () => {
    mocks.facetQuery.isError = true;

    render(<MarketplaceCategoryCards />);

    expect(screen.getAllByRole('link')).toHaveLength(FALLBACK_MARKETPLACE_CATEGORIES.length);
    for (const category of FALLBACK_MARKETPLACE_CATEGORIES) {
      expect(screen.getByText(category.name)).toBeTruthy();
    }
  });
});
