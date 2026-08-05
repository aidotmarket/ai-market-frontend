import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { get: apiGet },
}));

const { getMarketplaceCategoryFacets } = await import('./listings');

describe('getMarketplaceCategoryFacets', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('returns facets.categories from the public search payload', async () => {
    apiGet.mockResolvedValue({
      data: {
        results: [],
        total: 0,
        query: '*',
        facets: {
          categories: { healthcare: 2, finance: 0 },
          price: { min: 0, max: 10 },
        },
      },
    });

    await expect(getMarketplaceCategoryFacets()).resolves.toEqual({
      healthcare: 2,
      finance: 0,
    });
    expect(apiGet).toHaveBeenCalledWith('/search/listings', {
      params: { q: '*', limit: 1, offset: 0 },
      paramsSerializer: { indexes: null },
    });
  });

  it('fails when the search payload has no category facet data', async () => {
    apiGet.mockResolvedValue({
      data: {
        results: [],
        total: 0,
        query: '*',
        facets: undefined,
      },
    });

    await expect(getMarketplaceCategoryFacets()).rejects.toThrow(
      'Category facets are unavailable',
    );
  });
});
