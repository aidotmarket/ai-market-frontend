import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sitemap', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.API_URL = 'https://api.example.test';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ai.market';
  });

  it('appends request pages without removing listing pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [{ slug: 'test-listing', published_at: '2026-06-01T00:00:00Z' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [{
            slug: 'need-claims-data',
            published_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-02T00:00:00Z',
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { default: sitemap } = await import('./sitemap');

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://ai.market/listings/test-listing');
    expect(urls).toContain('https://ai.market/requests/need-claims-data');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/request-sitemap-entries',
      { next: { revalidate: 3600 } },
    );
  });
});
