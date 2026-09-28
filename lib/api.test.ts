import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDataRequest, fetchDataRequests, fetchPublicListing } from './api';

describe('fetchPublicListing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bypasses the Next data cache for the mutable public scan projection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'listing-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchPublicListing('mutable listing');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/public/listings/mutable%20listing'),
      { cache: 'no-store' },
    );
  });
});

describe('public data request freshness', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses fresh list reads with pagination and does not reuse a withdrawn public result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ slug: 'request-1' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    expect((await fetchDataRequests({ page: 2, per_page: 20, category: 'healthcare' })).items).toHaveLength(1);
    expect((await fetchDataRequests({ page: 2, per_page: 20, category: 'healthcare' })).items).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toContain('/api/v1/data-requests?page=2&per_page=20&category=healthcare');
      expect(options).toEqual({ cache: 'no-store' });
    }
  });

  it('returns null on a later private or withdrawn detail response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ slug: 'request-1' }) })
      .mockResolvedValueOnce({ ok: false, status: 410 });
    vi.stubGlobal('fetch', fetchMock);

    expect((await fetchDataRequest('request-1'))?.slug).toBe('request-1');
    expect(await fetchDataRequest('request-1')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/data-requests/request-1'), { cache: 'no-store' });
  });
});
