import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicListing } from './api';

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
