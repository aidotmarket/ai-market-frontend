import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, middleware } from './middleware';

describe('AI crawler middleware', () => {
  const fetchMock = vi.fn();
  const waitUntil = vi.fn();
  const event = { waitUntil } as unknown as NextFetchEvent;
  const request = (path = '/listings/some-slug', userAgent = 'GPTBot/1.0', ip?: string) =>
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
    vi.stubEnv('INTERNAL_API_KEY', 'test-internal-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends exactly one POST for GPTBot and returns next before the beacon settles', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    expectNext(middleware(request('/listings/some-slug?source=bot', 'GPTBot/1.0', '203.0.113.7, 10.0.0.1'), event));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://backend.example/api/v1/internal/ai-crawl-event',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-api-key': 'test-internal-key' },
        body: JSON.stringify({ user_agent: 'GPTBot/1.0', path: '/listings/some-slug', ip: '203.0.113.7', status_code: 200 }),
        keepalive: true,
      },
    );
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
  });

  it('does not send a beacon for Chrome', () => {
    expectNext(middleware(request('/listings/some-slug', 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'), event));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each(['/dashboard', '/listings-private', '/requests-private'])('excludes %s even for GPTBot', (path) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(false);
    expectNext(middleware(request(path), event));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['/', '/listings', '/listings/some-slug', '/requests', '/requests/some-slug', '/llms.txt', '/llms-full.txt', '/sitemap.xml', '/sitemap-listings.xml'])
    ('matches and reports public route %s', (path) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
      expectNext(middleware(request(path), event));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        user_agent: 'GPTBot/1.0', path, ip: null, status_code: 200,
      });
    });

  it('uses the server-side API URL fallback', () => {
    vi.stubEnv('API_URL', '');
    expectNext(middleware(request(), event));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://public-backend.example/api/v1/internal/ai-crawl-event', expect.any(Object),
    );
  });

  it.each(['key', 'base'])('skips the beacon when the %s is missing', (missing) => {
    if (missing === 'key') vi.stubEnv('INTERNAL_API_KEY', undefined);
    else {
      vi.stubEnv('API_URL', undefined);
      vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    }
    expectNext(middleware(request(), event));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('swallows a rejected beacon', async () => {
    fetchMock.mockRejectedValue(new Error('backend unavailable'));
    expectNext(middleware(request(), event));
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it('swallows a synchronous fetch failure', () => {
    fetchMock.mockImplementation(() => { throw new Error('fetch failed'); });
    expectNext(middleware(request(), event));
  });

  it('preserves Keystatic header rewriting without a beacon', () => {
    const path = '/api/keystatic/github/oauth/callback';
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
    const original = request(path);
    const headers = new Headers(original.headers);
    headers.set('x-forwarded-host', 'ai.market');
    headers.set('x-forwarded-proto', 'https');
    headers.set('host', 'ai.market');
    const response = middleware(original, event);
    expect([...response.headers]).toEqual([...NextResponse.next({ request: { headers } }).headers]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
