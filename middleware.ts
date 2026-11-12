import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import { detectAiBot } from './lib/aiBot';
import { detectPreviewBot } from './lib/previewBot';
import { trustedClientIp } from './lib/trustedClientIp';
import { isSupportPrivatePath, supportAccountCsp, SUPPORT_ACCOUNT_PATH } from './lib/support-private-policy';

const PROMOTE_RE = /^\/l\/([A-Za-z0-9_-]{1,16})(?:\/(x|li|rd|bs|wa|tg|em))?$/;

async function resolveShare(request: NextRequest, code: string, net?: string) {
  const fallback = () => NextResponse.rewrite(new URL(`/l/${code}`, request.url));
  const apiBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  const key = process.env.AI_CRAWL_BEACON_KEY;
  if (!apiBase || !key) return fallback();
  try {
    const ua = request.headers.get('user-agent');
    const result = await fetch(`${apiBase}/api/v1/internal/share-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Crawl-Beacon-Key': key },
      body: JSON.stringify({
        code,
        net: net ?? 'other',
        crawler: detectAiBot(ua) || detectPreviewBot(ua),
        visitor_ip: trustedClientIp(request.headers),
        cookie: request.cookies.get('aim_ref')?.value ?? null,
      }),
      signal: AbortSignal.timeout(300),
    });
    if (result.status !== 200) return fallback();
    const { slug, cookie_value } = await result.json();
    const response = NextResponse.redirect(new URL(`/listings/${slug}`, request.url), 302);
    response.headers.set('Cache-Control', 'no-store');
    if (cookie_value) {
      response.cookies.set('aim_ref', cookie_value, {
        domain: '.ai.market', path: '/', httpOnly: true,
        secure: true, sameSite: 'lax', maxAge: 604800,
      });
    }
    return response;
  } catch {
    return fallback();
  }
}

export function middleware(request: NextRequest, event: NextFetchEvent) {
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
  if (path === '/l' || path.startsWith('/l/')) {
    const match = PROMOTE_RE.exec(path);
    if (!match || request.method !== 'GET') return NextResponse.next();
    return resolveShare(request, match[1], match[2]);
  }
  const isPublicRoute = path === '/' ||
    /^\/(listings|requests)(\/|$)/.test(path) ||
    ['/llms.txt', '/llms-full.txt', '/sitemap.xml'].includes(path) ||
    path.startsWith('/sitemap-');
  const userAgent = request.headers.get('user-agent');
  const apiBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
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
          status_code: 200,
        }),
        keepalive: true,
      }).catch(() => {}));
    } catch {
      // Beacon failures must never affect the visitor's response.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/support/mailbox-account',
    '/api/v1/support/mailbox-confirm/:path*',
    '/api/v1/support/email-visit/:path*',
    '/api/keystatic/:path*',
    '/',
    '/listings/:path*',
    '/l/:path*',
    '/requests/:path*',
    '/llms.txt',
    '/llms-full.txt',
    '/sitemap.xml',
    '/sitemap-:path(.*)',
  ],
};
