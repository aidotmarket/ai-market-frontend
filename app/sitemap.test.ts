import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listingUrl = 'https://api.example.test/api/v1/public/sitemap-entries';
const requestUrl = 'https://api.example.test/api/v1/public/request-sitemap-entries';
const now = new Date('2026-10-11T12:00:00Z');
const staticPages = [
  ['', 'weekly', 1],
  ['/listings', 'daily', 0.9],
  ['/find-data', 'weekly', 0.9],
  ['/requests', 'daily', 0.9],
  ['/sell-data', 'weekly', 0.9],
  ['/aim-data', 'weekly', 0.8],
  ['/partner', 'weekly', 0.8],
  ['/docs/claude', 'monthly', 0.7],
  ['/verified', 'monthly', 0.7],
].map(([path, changeFrequency, priority]) => ({
  url: `https://ai.market${path}`,
  lastModified: now,
  changeFrequency,
  priority,
}));
const listingPage = {
  url: 'https://ai.market/listings/test-listing',
  lastModified: new Date('2026-06-01T00:00:00Z'),
  changeFrequency: 'weekly',
  priority: 0.8,
};
const requestPage = {
  url: 'https://ai.market/requests/need-claims-data',
  lastModified: new Date('2026-06-02T00:00:00Z'),
  changeFrequency: 'weekly',
  priority: 0.7,
};
function healthyResponse(url: string) {
  return {
    ok: true,
    json: async () => ({ entries: [{
      slug: url === listingUrl ? 'test-listing' : 'need-claims-data',
      published_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    }] }),
  };
}
function failedResponse(mode: string) {
  if (mode === 'transport') return Promise.reject(new Error('transport failed'));
  if (mode === 'HTTP') return { ok: false, status: 503, json: vi.fn() };
  return { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } };
}

describe('sitemap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('API_URL', 'https://api.example.test');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ai.market');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['HTTP', 'transport', 'JSON'])('preserves requests after listing %s failure', async (mode) => {
    const fetchMock = vi.fn((url: string) => url === listingUrl
      ? failedResponse(mode) : healthyResponse(url));
    vi.stubGlobal('fetch', fetchMock);
    const { default: sitemap } = await import('./sitemap');

    expect(await sitemap()).toEqual([...staticPages, requestPage]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['HTTP', 'transport', 'JSON'])('preserves listings after request %s failure', async (mode) => {
    vi.stubGlobal('fetch', vi.fn((url: string) => url === requestUrl
      ? failedResponse(mode) : healthyResponse(url)));
    const { default: sitemap } = await import('./sitemap');

    expect(await sitemap()).toEqual([...staticPages, listingPage]);
  });

  it.each(['HTTP', 'transport', 'JSON'])('returns static pages when both feeds have %s failures', async (mode) => {
    const fetchMock = vi.fn(() => failedResponse(mode));
    vi.stubGlobal('fetch', fetchMock);
    const { default: sitemap } = await import('./sitemap');

    expect(await sitemap()).toEqual(staticPages);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch when API_URL is missing', async () => {
    vi.stubEnv('API_URL', undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { default: sitemap } = await import('./sitemap');

    expect(await sitemap()).toEqual(staticPages);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts both feeds before either settles and keeps output order when requests finish first', async () => {
    let resolveListing!: (value: ReturnType<typeof healthyResponse>) => void;
    let resolveRequest!: (value: ReturnType<typeof healthyResponse>) => void;
    const listing = new Promise<ReturnType<typeof healthyResponse>>((resolve) => { resolveListing = resolve; });
    const request = new Promise<ReturnType<typeof healthyResponse>>((resolve) => { resolveRequest = resolve; });
    const fetchMock = vi.fn((url: string) => url === listingUrl ? listing : request);
    vi.stubGlobal('fetch', fetchMock);
    const { default: sitemap } = await import('./sitemap');

    const result = sitemap();
    // Both fetches must start while both promises are still unresolved.
    expect(fetchMock.mock.calls).toEqual([[listingUrl, { next: { revalidate: 3600 } }],
      [requestUrl, { next: { revalidate: 3600 } }]]);
    resolveRequest(healthyResponse(requestUrl));
    await request;
    resolveListing(healthyResponse(listingUrl));
    expect(await result).toEqual([...staticPages, listingPage, requestPage]);
  });

  it('uses published_at when a request has no updated_at and tolerates empty feeds', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => ({
      ok: true,
      json: async () => url === listingUrl ? {} : { entries: [{
        slug: 'need-claims-data', published_at: '2026-06-01T00:00:00Z',
      }] },
    })));
    const { default: sitemap } = await import('./sitemap');

    expect(await sitemap()).toEqual([...staticPages, {
      ...requestPage, lastModified: listingPage.lastModified,
    }]);
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
    expect(entries).toEqual([...staticPages, listingPage, requestPage]);
    const urls = entries.map((entry) => entry.url);
    const retiredRoutes = [
      `https://ai.market/${['aim', 'federate'].join('-')}`,
      `https://ai.market/${['run-feder', 'ated-learning'].join('')}`,
    ];

    expect(urls).toContain('https://ai.market/listings/test-listing');
    expect(urls).toContain('https://ai.market/requests');
    expect(urls).toContain('https://ai.market/requests/need-claims-data');
    expect(urls).toContain('https://ai.market/verified');
    expect(urls).toContain('https://ai.market/docs/claude');
    for (const retiredRoute of retiredRoutes) {
      expect(urls).not.toContain(retiredRoute);
    }
    expect(fetchMock).toHaveBeenCalledWith(listingUrl, { next: { revalidate: 3600 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
