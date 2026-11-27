import { runInNewContext } from 'node:vm';
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
  const expectNext = (response: Response) => {
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
    expect([...response.headers]).toEqual([...NextResponse.next().headers]);
    expect(response.body).toBeNull();
  };

  beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async (url: string) =>
      url.includes('/public/listings/') ? Response.json({title: 'Public listing'}) : new Response(null, {status: 204}));
    waitUntil.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('API_URL', 'https://backend.example');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://public-backend.example');
    vi.stubEnv('AI_CRAWL_BEACON_KEY', 'test-beacon-key');
    vi.stubEnv('LISTING_DISPOSITION_MIDDLEWARE_ENABLED', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends exactly one POST for GPTBot and returns next before the beacon settles', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}))
      .mockResolvedValueOnce(Response.json({title: 'Public listing'})).mockReturnValue(new Promise(() => {}));
    const response = await middleware(request('/listings/some-slug?source=bot', 'GPTBot/1.0', '203.0.113.7, 10.0.0.1'), event);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(3,
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

  it('keeps a direct listing link with the same query parameter on the listing read path', async () => {
    const response = await middleware(request('/listings/some-slug?type=models', 'Chrome'), event);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      expect((await middleware(request(path), event)).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(path === '/listings/some-slug' ? 3 : 1);
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
    expect(response.headers.get('retry-after')).toBe(status === 503 ? '60' : null);
    expect(await response.text()).not.toContain('private title');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `https://backend.example/api/v1/public/listing-disposition/some-slug?version=${version}`,
      expect.objectContaining({cache: 'no-store'}),
    );
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('fails closed on a disposition redirect without following or retrying it', async () => {
    fetchMock.mockResolvedValueOnce(Response.redirect('https://backend.example/elsewhere', 302));
    const response = await middleware(request('/listings/some-slug'), event);
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      expect.objectContaining({redirect: 'manual'}),
    );
  });

  const mockListingTimeouts = () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'performance']});
    // Use fake timers for the native timeout signal as well as for the retry delay.
    return vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
  };

  const stallUntilAborted = (_url: string, {signal}: {signal: AbortSignal}) =>
    new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    });

  const stallBodyUntilAborted = (response: Response) => {
    const readBody = vi.spyOn(response, 'json');
    fetchMock.mockImplementationOnce(async (url: string, options: {signal: AbortSignal}) => {
      readBody.mockImplementation(() => stallUntilAborted(url, options));
      return response;
    });
    return readBody;
  };

  it('retries a timed-out disposition check before reading the listing', async () => {
    const timeout = mockListingTimeouts();
    fetchMock.mockImplementationOnce(stallUntilAborted);
    const pending = middleware(request('/listings/some-slug', 'Chrome'), event);

    await vi.advanceTimersByTimeAsync(10_249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-aim-listing-data')).toBe(
      encodeURIComponent(JSON.stringify({title: 'Public listing'})),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
    ]);
    expect(timeout.mock.calls).toEqual([[10_000], [4_750], [4_750]]);
  });

  it('fails closed at 15 seconds when every fetch stalls', async () => {
    const timeout = mockListingTimeouts();
    fetchMock.mockImplementation(stallUntilAborted);
    const settled = vi.fn();
    const pending = middleware(request('/listings/some-slug'), event).then(response => {
      settled(response);
      return response;
    });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).not.toHaveBeenCalled();
    expect(timeout.mock.calls).toEqual([[10_000], [4_750]]);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);

    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('This listing is temporarily unavailable.');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
    ]);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each([
    ['disposition', 410, 'This listing was withdrawn.'],
    ['disposition', 451, 'This listing is unavailable for legal reasons.'],
    ['full read', 410, 'This listing was withdrawn.'],
    ['full read', 451, 'This listing is unavailable for legal reasons.'],
  ])('fails closed when the %s times out and then returns %i', async (read, status, message) => {
    mockListingTimeouts();
    const dispositionUrl = 'https://backend.example/api/v1/public/listing-disposition/some-slug';
    const fullReadUrl = 'https://backend.example/api/v1/public/listings/some-slug';
    if (read === 'full read') fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}));
    fetchMock.mockImplementationOnce(stallUntilAborted).mockResolvedValueOnce(
      Response.json({detail: 'Listing has been withdrawn', title: 'private title'}, {status}),
    );
    const pending = middleware(request('/listings/some-slug'), event);
    await vi.advanceTimersByTimeAsync(10_250);

    const response = await pending;
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-aim-listing-data')).toBeNull();
    expect(await response.text()).toBe(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Listing unavailable</title><h1>${message}</h1><a href="/">Back to ai.market</a></html>`);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(read === 'disposition'
      ? [dispositionUrl, dispositionUrl]
      : [dispositionUrl, fullReadUrl, fullReadUrl]);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('retries a full listing read after a network error without rechecking disposition', async () => {
    const timeout = mockListingTimeouts();
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const pending = middleware(request('/listings/some-slug', 'Chrome'), event);

    await vi.advanceTimersByTimeAsync(250);

    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-aim-listing-data')).toBe(
      encodeURIComponent(JSON.stringify({title: 'Public listing'})),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
    ]);
    expect(timeout.mock.calls).toEqual([[10_000], [10_000], [10_000]]);
  });

  it.each(['TypeError', 'TimeoutError', 'AbortError'])('retries a %s from another realm', async name => {
    mockListingTimeouts();
    const error: unknown = runInNewContext('Object.assign(new Error("fetch failed"), {name})', {name});
    expect(error).not.toBeInstanceOf(Error);
    fetchMock.mockRejectedValueOnce(error);
    const pending = middleware(request('/listings/some-slug', 'Chrome'), event);
    await vi.advanceTimersByTimeAsync(250);

    expect((await pending).status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
    ]);
  });

  it('retries a full read when 200 headers arrive and the body stalls until abort', async () => {
    const timeout = mockListingTimeouts();
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}));
    const readBody = stallBodyUntilAborted(new Response(null, {status: 200}));
    const pending = middleware(request('/listings/some-slug', 'Chrome'), event);
    await vi.advanceTimersByTimeAsync(10_249);
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-aim-listing-data')).toBe(
      encodeURIComponent(JSON.stringify({title: 'Public listing'})),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
    ]);
    expect(timeout.mock.calls).toEqual([[10_000], [10_000], [4_750]]);
  });

  it('fails closed when the deadline expires while reading a 410 detail body', async () => {
    mockListingTimeouts();
    fetchMock.mockImplementationOnce(stallUntilAborted);
    const readBody = stallBodyUntilAborted(new Response(null, {status: 410}));
    const pending = middleware(request('/listings/some-slug'), event);
    await vi.advanceTimersByTimeAsync(15_000);

    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('fails closed when both full reads fail', async () => {
    mockListingTimeouts();
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}))
      .mockRejectedValue(new TypeError('fetch failed'));
    const pending = middleware(request('/listings/some-slug'), event);
    await vi.advanceTimersByTimeAsync(250);

    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
    ]);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('fails closed without retrying malformed JSON in a full read', async () => {
    mockListingTimeouts();
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}))
      .mockResolvedValueOnce(new Response('{', {status: 200}));
    const pending = middleware(request('/listings/some-slug'), event);
    await vi.advanceTimersByTimeAsync(250);

    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
    ]);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('shares the deadline across both reads and skips a full-read retry with too little time left', async () => {
    const timeout = mockListingTimeouts();
    fetchMock.mockImplementationOnce(stallUntilAborted)
      .mockImplementationOnce(() => new Promise(resolve => {
        setTimeout(() => resolve(new Response(null, {status: 204})), 3_350);
      }))
      .mockRejectedValue(new TypeError('fetch failed'));
    const pending = middleware(request('/listings/some-slug'), event);
    await vi.advanceTimersByTimeAsync(13_600);
    expect(timeout.mock.calls).toEqual([[10_000], [4_750], [1_400]]);

    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listing-disposition/some-slug',
      'https://backend.example/api/v1/public/listings/some-slug',
    ]);
  });

  it('sends missing and hidden requests to the same framework 404', async () => {
    const responses = [];
    for (const ref of ['hidden', 'absent']) {
      fetchMock.mockResolvedValueOnce(new Response(null, {status: 404}));
      const response = await middleware(request(`/listings/${ref}`, 'Chrome'), event);
      expect(response.headers.get('x-middleware-rewrite')).toBe('https://ai.market/_listing-not-found');
      responses.push([...response.headers]);
    }
    expect(responses[0]).toEqual(responses[1]);
  });

  it.each([
    [410, 'This listing was withdrawn.'],
    [451, 'This listing is unavailable for legal reasons.'],
    [503, 'This listing is temporarily unavailable.'],
  ])('returns the full read’s %i after disposition returns 204', async (status, message) => {
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204})).mockResolvedValueOnce(
      Response.json({detail: 'Listing has been withdrawn', title: 'private title'}, {status}),
    );
    const response = await middleware(request('/listings/some-slug'), event);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe(status === 503 ? '60' : null);
    expect(await response.text()).toBe(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Listing unavailable</title><h1>${message}</h1><a href="/">Back to ai.market</a></html>`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the full read’s 404 to the framework without forwarding any listing data', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}))
      .mockResolvedValueOnce(Response.json({title: 'private title'}, {status: 404}));
    const original = request('/listings/hidden', 'Chrome');
    original.headers.set('x-aim-listing-data', 'spoofed');
    const response = await middleware(original, event);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://ai.market/_listing-not-found');
    expect(response.headers.get('x-middleware-request-x-aim-listing-data')).toBeNull();
  });

  it('returns fixed 503 when no API base is configured', async () => {
    vi.stubEnv('API_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    const response = await middleware(request('/listings/some-slug'), event);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('This listing is temporarily unavailable.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips only the disposition probe when switched off', async () => {
    vi.stubEnv('LISTING_DISPOSITION_MIDDLEWARE_ENABLED', 'false');
    fetchMock.mockResolvedValueOnce(Response.json({title: 'private title'}, {status: 451}));
    const response = await middleware(request('/listings/some-slug', 'Chrome'), event);
    expect(response.status).toBe(451);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://backend.example/api/v1/public/listings/some-slug', expect.anything());
    expect(await response.text()).not.toContain('private title');
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
