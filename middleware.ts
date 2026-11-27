import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import { LISTING_DATA_HEADER, listingHttpStatus, listingIsWithdrawn, listingUnavailableResponse } from './lib/listing-http-status';
import { requestPublicListing } from './lib/public-listing-read';
import { detectAiBot } from './lib/aiBot';
import { isSupportPrivatePath, supportAccountCsp, SUPPORT_ACCOUNT_PATH } from './lib/support-private-policy';

const LISTING_BACKEND_TIMEOUT_MS = 10_000;
const LISTING_DEADLINE_MS = 15_000;
const LISTING_RETRY_DELAY_MS = 250;
const LISTING_MIN_RETRY_TIME_MS = 1_500;

async function readListingWithRetry<T>(deadline: number, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const remaining = () => deadline - performance.now();
  const attempt = async () => {
    const timeout = Math.min(LISTING_BACKEND_TIMEOUT_MS, Math.ceil(remaining()));
    if (timeout <= 0) throw new Error('Listing deadline exhausted');
    const result = await read(AbortSignal.timeout(timeout));
    if (remaining() <= 0) throw new Error('Listing deadline exhausted');
    return result;
  };

  try {
    return await attempt();
  } catch (error) {
    const name = (error as {name?: unknown} | null | undefined)?.name;
    if ((name === 'TypeError' || name === 'TimeoutError' || name === 'AbortError') &&
        remaining() >= LISTING_RETRY_DELAY_MS + LISTING_MIN_RETRY_TIME_MS) {
      await new Promise(resolve => setTimeout(resolve, LISTING_RETRY_DELAY_MS));
      if (remaining() >= LISTING_MIN_RETRY_TIME_MS) return attempt();
    }
    throw error;
  }
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (/^\/dashboard(?:\/|$)/.test(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  if (isSupportPrivatePath(request.nextUrl.pathname)) {
    // Never canonicalize a bearer-bearing private URL through a redirect.
    if (request.headers.get('host') !== 'ai.market' || request.nextUrl.protocol !== 'https:') {
      return new NextResponse('Support recovery unavailable on this origin.', { status: 400,
        headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    if (request.nextUrl.pathname.replace(/\/$/, '') === SUPPORT_ACCOUNT_PATH) {
      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
      const policy = supportAccountCsp(nonce, process.env.NEXT_PUBLIC_API_URL || process.env.API_URL);
      const headers = new Headers(request.headers);
      // Next15 extracts the script nonce from the request CSP for its bootstrap.
      headers.set('Content-Security-Policy', policy);
      const response = NextResponse.next({ request: { headers } });
      response.headers.set('Content-Security-Policy', policy);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    }
    // Next's external rewrite copies the original Origin/Cookie and backend
    // Set-Cookie. Do not substitute an API Origin or rewrite cookie attributes.
    return NextResponse.next();
  }
  // Fix: Railway proxy sends internal hostname. Rewrite headers
  // so Keystatic builds OAuth redirect_uri with the public URL.
  if (request.nextUrl.pathname.startsWith('/api/keystatic')) {
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', 'ai.market');
    headers.set('x-forwarded-proto', 'https');
    headers.set('host', 'ai.market');

    return NextResponse.next({
      request: { headers },
    });
  }

  const path = request.nextUrl.pathname;
  const isPublicRoute = path === '/' ||
    /^\/(listings|requests)(\/|$)/.test(path) ||
    ['/llms.txt', '/llms-full.txt', '/sitemap.xml'].includes(path) ||
    path.startsWith('/sitemap-');
  const userAgent = request.headers.get('user-agent');
  const apiBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  const listingRef = /^\/listings\/([^/]+)\/?$/.exec(path)?.[1];
  let listingStatus = 204;
  let listingData: string | undefined;
  if (listingRef) {
    // Both reads, their response bodies, and any retries share a worst-case wait of about 15 s.
    const deadline = performance.now() + LISTING_DEADLINE_MS;
    let decodedRef: string;
    try {
      decodedRef = decodeURIComponent(listingRef);
    } catch {
      return NextResponse.rewrite(new URL('/_listing-not-found', request.url));
    }
    if (!apiBase) return listingUnavailableResponse(503);
    try {
      const version = request.nextUrl.searchParams.get('version');
      if (version !== null) {
        const query = `?${new URLSearchParams({version})}`;
        const {status, withdrawn} = await readListingWithRetry(deadline, async signal => {
          const response = await fetch(`${apiBase}/api/v1/public/listing-disposition/${listingRef}${query}`, {
            // Keep redirects fail-closed and let their HTTP status bypass the retry.
            cache: 'no-store', redirect: 'manual', signal,
          });
          const status = listingHttpStatus(response.status);
          return {status, withdrawn: status === 410 && await listingIsWithdrawn(response)};
        });
        listingStatus = status;
        if (listingStatus === 410 || listingStatus === 451 || listingStatus === 503) {
          return listingUnavailableResponse(listingStatus, withdrawn);
        }
      }
      if (listingStatus === 204) {
        // Resolve the page's full read before App Router can commit response headers.
        // Pass only a successful snapshot to the renderer so metadata uses the same read.
        const {status, payload, withdrawn} = await readListingWithRetry(deadline, async signal => {
          const response = await requestPublicListing(apiBase, decodedRef, userAgent, signal);
          const {status} = response;
          const payload: unknown = status === 200 ? await response.json() : undefined;
          return {status, payload, withdrawn: status === 410 && await listingIsWithdrawn(response)};
        });
        if (status === 200) {
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return listingUnavailableResponse(503);
          listingData = encodeURIComponent(JSON.stringify(payload));
        } else {
          const mappedStatus = listingHttpStatus(status);
          if (mappedStatus !== 404) {
            return listingUnavailableResponse(mappedStatus === 204 ? 503 : mappedStatus, withdrawn);
          }
          listingStatus = 404;
        }
      }
    } catch {
      return listingUnavailableResponse(503);
    }
  }
  const aiCrawlBeaconKey = process.env.AI_CRAWL_BEACON_KEY;

  if (isPublicRoute && detectAiBot(userAgent) && apiBase && aiCrawlBeaconKey) {
    try {
      event.waitUntil(fetch(`${apiBase}/api/v1/internal/ai-crawl-event`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ai-crawl-beacon-key': aiCrawlBeaconKey,
        },
        body: JSON.stringify({
          user_agent: userAgent,
          path,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || null,
          status_code: listingStatus === 404 ? 404 : 200,
        }),
        keepalive: true,
      }).catch(() => {}));
    } catch {
      // Beacon failures must never affect the visitor's response.
    }
  }

  if (listingRef) {
    // The framework's unmatched-route response sets 404 before rendering,
    // including for Flight requests whose page-level notFound() can stream a 200.
    if (listingStatus === 404) return NextResponse.rewrite(new URL('/_listing-not-found', request.url));
    const headers = new Headers(request.headers);
    headers.delete(LISTING_DATA_HEADER);
    // next start applies this override in-process. A network hop to the renderer
    // would subject the full listing snapshot to HTTP header size limits.
    if (listingData !== undefined) headers.set(LISTING_DATA_HEADER, listingData);
    return NextResponse.next({request: {headers}});
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/support/mailbox-account',
    '/api/v1/support/mailbox-confirm/:path*',
    '/api/v1/support/email-visit/:path*',
    '/api/keystatic/:path*',
    '/',
    '/listings/:path*',
    '/requests/:path*',
    '/llms.txt',
    '/llms-full.txt',
    '/sitemap.xml',
    '/sitemap-:path(.*)',
  ],
};
