import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { get: apiGet, post: apiPost, patch: apiPatch },
}));

const { createDraftListing, getMarketplaceCategoryFacets, getListingOwnership, getMyListings, getListingAccessWindow, updateListingAccessWindow, searchListings } = await import('./listings');

it.each([
  { suggested_query: 'climate data' },
  { hint: 'no_results_try_other_words' },
])('preserves optional search metadata %j', async (metadata) => {
  const data = { results: [], total: 0, query: 'climte data', ...metadata };
  apiGet.mockResolvedValueOnce({ data });

  const { suggested_query, hint } = await searchListings('climte data', { offset: 0 });

  expect(suggested_query).toBe(metadata.suggested_query);
  expect(hint).toBe(metadata.hint);
  expect(apiGet).toHaveBeenLastCalledWith('/search/listings', expect.objectContaining({
    params: { q: 'climte data', offset: 0 },
  }));
});

it('keeps owner GET authority state separate from the original PATCH response',async()=>{
  apiGet.mockResolvedValueOnce({data:{listing_id:'listing-1',access_window_days:7,authority_version_id:'version'}});
  const owner=await getListingAccessWindow('listing-1');
  apiPatch.mockResolvedValueOnce({data:{listing_id:'listing-1',access_window_days:30}});
  expect(await updateListingAccessWindow('listing-1',30)).toEqual({listing_id:'listing-1',access_window_days:30});
  expect(owner).toEqual({listing_id:'listing-1',access_window_days:7,authority_version_id:'version'});
  expect(apiGet).toHaveBeenLastCalledWith('/listings/listing-1/access-window',{adapter:'fetch',fetchOptions:{cache:'no-store'}});
  expect(apiPatch).toHaveBeenCalledWith('/listings/listing-1/access-window',{access_window_days:30});
});

describe('getListingOwnership', () => {
  it.each([true, false, 'true', 1, null, undefined])('accepts only literal true from is_owner: %s', async (is_owner) => {
    apiGet.mockResolvedValue({ data: { is_owner } });
    await expect(getListingOwnership('listing-1')).resolves.toBe(is_owner === true);
    expect(apiGet).toHaveBeenCalledWith('/listings/listing-1/ownership', { adapter: 'fetch', fetchOptions: { cache: 'no-store' } });
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


describe('getMyListings paging compatibility', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });
  it('preserves the overview no-argument request and array response', async () => {
    const response = { data: [{ id: 'owner-row', status: 'unlisted' }] };
    apiGet.mockResolvedValue(response);
    await expect(getMyListings()).resolves.toBe(response);
    expect(apiGet).toHaveBeenCalledExactlyOnceWith('/listings/mine');
  });
  it.each([{ skip: 0, limit: 21 }, { skip: 20, limit: 21 }, { skip: 40 }, { limit: 100 }])(
    'passes optional typed paging without owner or status filters: %j', async paging => {
      const response = { data: [] }; apiGet.mockResolvedValue(response);
      await expect(getMyListings(paging)).resolves.toBe(response);
      expect(apiGet).toHaveBeenCalledExactlyOnceWith('/listings/mine', { params: paging });
    },
  );
  it('propagates a rejected owner read rather than returning empty inventory', async () => {
    const error = new Error('unavailable'); apiGet.mockRejectedValue(error);
    await expect(getMyListings({ skip: 20, limit: 21 })).rejects.toBe(error);
  });
});
