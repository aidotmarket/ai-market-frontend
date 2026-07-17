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
    const retiredRoutes = [
      `https://ai.market/${['aim', 'federate'].join('-')}`,
      `https://ai.market/${['run-feder', 'ated-learning'].join('')}`,
    ];

    expect(urls).toContain('https://ai.market/listings/test-listing');
    expect(urls).toContain('https://ai.market/requests/need-claims-data');
    for (const retiredRoute of retiredRoutes) {
      expect(urls).not.toContain(retiredRoute);
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/public/request-sitemap-entries',
      { next: { revalidate: 3600 } },
    );
  });

  it('redirects legacy download root and suffix URLs to AIM Data without dropping attribution', async () => {
    const { default: config } = await import('../next.config');

    const redirects = await config.redirects!();
    const rootRedirect = redirects.find(({ source }) => source === '/download/aim-channel');
    const suffixRedirect = redirects.find(({ source }) => source === '/download/aim-channel/:path*');

    expect(rootRedirect).toEqual({
      source: '/download/aim-channel',
      destination: '/aim-data',
      permanent: true,
    });
    expect(suffixRedirect).toEqual({
      source: '/download/aim-channel/:path*',
      destination: '/aim-data',
      permanent: true,
    });

    const legacyRequest = new URL(
      'https://ai.market/download/aim-channel/windows?utm_source=test&ref=partner123',
    );
    const redirectedUrl = new URL(`${suffixRedirect!.destination}${legacyRequest.search}`, legacyRequest);

    expect(redirectedUrl.toString()).toBe(
      'https://ai.market/aim-data?utm_source=test&ref=partner123',
    );
  });
});
