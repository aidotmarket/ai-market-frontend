import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { get: apiGet, post: apiPost },
}));

const { createDraftListing, getMarketplaceCategoryFacets } = await import('./listings');

it('posts a typed draft to the listings endpoint', async () => {
  const body = { title: 'Safe data', description: 'A useful data set', price: 0, model_provider: 'anthropic' as const, listing_type: 'raw' as const, schema_info: { row_count: 2, columns: [{ name: 'safe', type: 'integer' }] } };
  apiPost.mockResolvedValueOnce({ data: { id: 'listing-1', status: 'draft' } });
  await expect(createDraftListing(body)).resolves.toEqual({ id: 'listing-1', status: 'draft' });
  expect(apiPost).toHaveBeenCalledWith('/listings/', body);
});

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
