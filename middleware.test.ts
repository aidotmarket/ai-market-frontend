import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, middleware } from './middleware';

describe('AI crawler middleware', () => {
  const fetchMock = vi.fn();
  const waitUntil = vi.fn();
  const event = { waitUntil } as unknown as NextFetchEvent;
  const request = (path = '/listings', userAgent = 'GPTBot/1.0', ip?: string) =>
    new NextRequest(`https://ai.market${path}`, {
      headers: { 'user-agent': userAgent, ...(ip ? { 'x-forwarded-for': ip } : {}) },
    });
  const expectNext = (response: NextResponse) => {
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
    expect([...response.headers]).toEqual([...NextResponse.next().headers]);
    expect(response.body).toBeNull();
  };

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    waitUntil.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('API_URL', 'https://backend.example');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://public-backend.example');
    vi.stubEnv('AI_CRAWL_BEACON_KEY', 'test-beacon-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends exactly one POST for GPTBot and returns next before the beacon settles', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204})).mockReturnValue(new Promise(() => {}));
    expectNext(await middleware(request('/listings/some-slug?source=bot', 'GPTBot/1.0', '203.0.113.7, 10.0.0.1'), event));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      'https://backend.example/api/v1/internal/ai-crawl-event',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ai-crawl-beacon-key': 'test-beacon-key' },
        body: JSON.stringify({ user_agent: 'GPTBot/1.0', path: '/listings/some-slug', ip: '203.0.113.7', status_code: 200 }),
        keepalive: true,
      },
    );
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
  });

  it('does not send a beacon for Chrome', async () => {
    expectNext(await middleware(request('/listings', 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'), event));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each(['/listings-private', '/requests-private'])('excludes %s even for GPTBot', async (path) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(false);
    expectNext(await middleware(request(path), event));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['/dashboard', '/dashboard/orders/purchase', '/dashboard/orders/purchase/license-record', '/dashboard/listings/owned', '/dashboard/sales/purchase/license-record', '/dashboard/settings'])('keeps %s private and outside crawler reporting', async path => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
    expect((await middleware(request(path), event)).headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['/', '/listings', '/listings/some-slug', '/requests', '/requests/some-slug', '/llms.txt', '/llms-full.txt', '/sitemap.xml', '/sitemap-listings.xml'])
    ('matches and reports public route %s', async (path) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
      expectNext(await middleware(request(path), event));
      expect(fetchMock).toHaveBeenCalledTimes(path === '/listings/some-slug' ? 2 : 1);
      expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({
        user_agent: 'GPTBot/1.0', path, ip: null, status_code: 200,
      });
    });

  it('uses the server-side API URL fallback', async () => {
    vi.stubEnv('API_URL', '');
    expectNext(await middleware(request(), event));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://public-backend.example/api/v1/internal/ai-crawl-event', expect.any(Object),
    );
  });

  it.each(['key', 'base'])('skips the beacon when the %s is missing', async (missing) => {
    if (missing === 'key') vi.stubEnv('AI_CRAWL_BEACON_KEY', undefined);
    else {
      vi.stubEnv('API_URL', undefined);
      vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    }
    expectNext(await middleware(request(), event));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('does not use the internal API key when the beacon key is unset', async () => {
    vi.stubEnv('AI_CRAWL_BEACON_KEY', undefined);
    vi.stubEnv('INTERNAL_API_KEY', 'test-internal-key');
    expectNext(await middleware(request('/listings', 'GPTBot/1.0'), event));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('swallows a rejected beacon', async () => {
    fetchMock.mockRejectedValue(new Error('backend unavailable'));
    expectNext(await middleware(request(), event));
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it('swallows a synchronous fetch failure', async () => {
    fetchMock.mockImplementation(() => { throw new Error('fetch failed'); });
    expectNext(await middleware(request(), event));
  });

  it.each([410, 451, 503])('returns a fixed no-store %i before SSR or crawler reporting', async status => {
    fetchMock.mockResolvedValue(new Response('private title', {status}));
    const version = 'edcae881-b66a-4d3e-abbe-1fb8984954ee';
    const original = new NextRequest(`https://ai.market/listings/some-slug?version=${version}`, {
      headers: {RSC: '1', 'Next-Router-Prefetch': '1', 'User-Agent': 'GPTBot/1.0'},
    });
    const response = await middleware(original, event);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('private title');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `https://backend.example/api/v1/public/listing-disposition/some-slug?version=${version}`,
      expect.objectContaining({cache: 'no-store'}),
    );
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('sends missing and hidden requests to the same framework 404', async () => {
    const responses = [];
    for (const ref of ['hidden', 'absent']) {
      fetchMock.mockResolvedValueOnce(new Response(null, {status: 404}));
      const response = await middleware(request(`/listings/${ref}`, 'Chrome'), event);
      expect(response.headers.get('x-middleware-request-x-aim-listing-missing')).toBe('1');
      responses.push([...response.headers]);
    }
    expect(responses[0]).toEqual(responses[1]);
  });

  it('preserves Keystatic header rewriting without a beacon', async () => {
    const path = '/api/keystatic/github/oauth/callback';
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
    const original = request(path);
    const headers = new Headers(original.headers);
    headers.set('x-forwarded-host', 'ai.market');
    headers.set('x-forwarded-proto', 'https');
    headers.set('host', 'ai.market');
    const response = await middleware(original, event);
    expect([...response.headers]).toEqual([...NextResponse.next({ request: { headers } }).headers]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
