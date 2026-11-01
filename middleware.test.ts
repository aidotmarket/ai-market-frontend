import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, middleware } from './middleware';
import schema from './tests/fixtures/share-resolve-request.schema.json';
import { trustedClientIp } from './lib/trustedClientIp';
import { detectPreviewBot } from './lib/previewBot';

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

  beforeEach(async () => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    waitUntil.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('API_URL', 'https://backend.example');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://public-backend.example');
    vi.stubEnv('AI_CRAWL_BEACON_KEY', 'test-beacon-key');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends exactly one POST for GPTBot and returns next before the beacon settles', async () => {
    fetchMock.mockReturnValue(new Promise(async () => {}));
    expectNext(await middleware(request('/listings/some-slug?source=bot', 'GPTBot/1.0', '203.0.113.7, 10.0.0.1'), event));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
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
    expectNext(await middleware(request('/listings/some-slug', 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'), event));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each(['/dashboard', '/dashboard/settings', '/dashboard/settings/connected-apps', '/listings-private', '/requests-private'])('excludes %s even for GPTBot', async (path) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(false);
    expectNext(await middleware(request(path), event));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['/', '/listings', '/listings/some-slug', '/requests', '/requests/some-slug', '/llms.txt', '/llms-full.txt', '/sitemap.xml', '/sitemap-listings.xml'])
    ('matches and reports public route %s', async (path) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
      expectNext(await middleware(request(path), event));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
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
    expectNext(await middleware(request('/listings/some-slug', 'GPTBot/1.0'), event));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('swallows a rejected beacon', async () => {
    fetchMock.mockRejectedValue(new Error('backend unavailable'));
    expectNext(await middleware(request(), event));
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it('swallows a synchronous fetch failure', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('fetch failed'); });
    expectNext(await middleware(request(), event));
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


describe('Promote link resolver', () => {
  const fetchMock = vi.fn();
  const event = { waitUntil: vi.fn() } as unknown as NextFetchEvent;
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(Response.json({ slug: 'dataset', cookie_value: null })));
    vi.stubEnv('API_URL', 'https://backend.example');
    vi.stubEnv('AI_CRAWL_BEACON_KEY', 'test-key');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const request = (path: string, method = 'GET', headers = {}) => new NextRequest(`https://ai.market${path}`, { method, headers });

  it.each([['/l/Code/card.png', 'GET'], ['/l/Code/card.png', 'HEAD'], ['/l/Code/zz', 'GET'], ['/l/Code', 'POST'], ['/l/abcdefghijklmnopq', 'GET']])('passes through %s %s', async (path, method) => {
    const response = await middleware(request(path, method), event);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toEqual([]);
  });
  it.each(['/l/Code', '/l/Code/x'])('redirects %s with no-store and no flag-off cookie', async path => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
    const response = await middleware(request(path), event);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://ai.market/listings/dataset');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.cookies.getAll()).toEqual([]);
  });
  it('sets only the returned cookie with the approved attributes', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ slug: 'dataset', cookie_value: 'signed-ref' }));
    const response = await middleware(request('/l/Code/x'), event);
    expect(response.cookies.get('aim_ref')).toMatchObject({ value: 'signed-ref', domain: '.ai.market', path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 604800 });
  });
  it.each([410, 500])('rewrites on status %s', async status => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    const response = await middleware(request('/l/Code/x'), event);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://ai.market/l/Code');
    expect(response.cookies.getAll()).toEqual([]);
  });
  it('rewrites on timeout', async () => {
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    }));
    const response = await middleware(request('/l/Code/x'), event);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://ai.market/l/Code');
  });
  it.each(['key', 'base'])('rewrites when %s is absent', async missing => {
    if (missing === 'key') vi.stubEnv('AI_CRAWL_BEACON_KEY', '');
    else { vi.stubEnv('API_URL', ''); vi.stubEnv('NEXT_PUBLIC_API_URL', ''); }
    const response = await middleware(request('/l/Code/x'), event);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://ai.market/l/Code');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['203.0.113.7', '203.0.113.8'])('validates actual serialized request against backend schema for client %s', async client => {
    await middleware(request('/l/Code', 'GET', { cookie: 'aim_ref=incoming', 'x-forwarded-for': `${client}, 10.0.0.1`, 'user-agent': 'Twitterbot' }), event);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://backend.example/api/v1/internal/share-resolve');
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(options.headers).get('X-AI-Crawl-Beacon-Key')).toBe('test-key');
    const body = JSON.parse(options.body);
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(body).sort()).toEqual([...schema.required].sort());
    for (const [key, field] of Object.entries(schema.properties)) {
      const value = body[key];
      const types = Array.isArray(field.type) ? field.type : [field.type];
      expect(types).toContain(value === null ? 'null' : typeof value);
      if ('pattern' in field && typeof value === 'string') expect(value).toMatch(new RegExp(field.pattern));
      if ('enum' in field) expect(field.enum).toContain(value);
      if ('maxLength' in field && typeof value === 'string') expect(value.length).toBeLessThanOrEqual(field.maxLength);
    }
    expect(body).toEqual({ code: 'Code', net: 'other', crawler: true, visitor_ip: client, cookie: 'incoming' });
  });
  it('sends tagged network and AI crawler with absent cookie and address', async () => {
    await middleware(request('/l/Code/li', 'GET', { 'user-agent': 'GPTBot' }), event);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: 'Code', net: 'li', crawler: true, visitor_ip: null, cookie: null });
  });
});

describe('trusted Railway caller address', () => {
  it.each(['203.0.113.7', '203.0.113.8', '2001:db8::1'])('selects the caller from <client>, <edge>: %s', client => {
    expect(trustedClientIp(new Headers({ 'x-forwarded-for': `${client}, 10.0.0.1` }))).toBe(client);
  });
  it.each([undefined, '', 'garbage, 10.0.0.1', '999.1.2.3', '1.2.3', '[::1]', '::zzz'])('rejects missing or unparsable %s', value => {
    expect(trustedClientIp(new Headers(value === undefined ? {} : { 'x-forwarded-for': value }))).toBeNull();
  });
});

describe('preview crawler detection', () => {
  it.each(['Twitterbot', 'LinkedInBot', 'facebookexternalhit', 'Slackbot', 'TelegramBot', 'WhatsApp', 'Discordbot', 'redditbot', 'Bluesky Cardyb', 'Googlebot', 'bingbot', 'Applebot'])('recognizes %s case insensitively', ua => {
    expect(detectPreviewBot(ua)).toBe(true);
    expect(detectPreviewBot(ua.toUpperCase())).toBe(true);
  });
  it.each([null, '', 'Mozilla/5.0 Chrome'])('excludes %s', ua => expect(detectPreviewBot(ua)).toBe(false));
});
