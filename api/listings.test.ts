import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { get: apiGet, post: apiPost },
}));

const { createDraftListing, getMarketplaceCategoryFacets, getListingOwnership } = await import('./listings');

describe('getListingOwnership', () => {
  it.each([true, false, 'true', 1, null, undefined])('accepts only literal true from is_owner: %s', async (is_owner) => {
    apiGet.mockResolvedValue({ data: { is_owner } });
    await expect(getListingOwnership('listing-1')).resolves.toBe(is_owner === true);
    expect(apiGet).toHaveBeenCalledWith('/listings/listing-1/ownership');
  });

  it('treats a missing payload as nonownership', async () => {
    apiGet.mockResolvedValue({ data: null });
    await expect(getListingOwnership('listing-1')).resolves.toBe(false);
  });
});

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

  it('loads public inventory counts without a semantic search request', async () => {
    apiGet.mockResolvedValue({
      data: {
        categories: { healthcare: 2, finance: 0 },
        price: { min: 0, max: 10 },
      },
    });

    await expect(getMarketplaceCategoryFacets()).resolves.toEqual({
      healthcare: 2,
      finance: 0,
    });
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/search/facets');
  });

  it('fails when the facet payload has no category data', async () => {
    apiGet.mockResolvedValue({ data: { categories: undefined } });
    await expect(getMarketplaceCategoryFacets()).rejects.toThrow(
      'Category facets are unavailable',
    );
  });
});
