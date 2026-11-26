import type { AnonymousChatEvent } from '@/api/anonymousChat';

export interface FallbackDestinations {
  gateway?: '/aim-data#gateway-setup';
  support?: '/support';
  search?: string;
  request?: '/requests/new';
}

export function gatewaySetupFallback(page: string, question: string): FallbackDestinations | undefined {
  if (page !== '/aim-data' && page !== '/support') return;
  const mentionsGateway = /\b(?:aim[\s-]+data|docker|gateways?)\b|网关|閘道/i.test(question);
  const asksAboutSetup = /\b(?:setup|set up|install\w*|network(?:ing)?|configur\w*|instal\w*|red)\b|安装|设置|配置|网络/i.test(question);
  if (!mentionsGateway && !(page === '/aim-data' && asksAboutSetup)) return;
  return { gateway: '/aim-data#gateway-setup' };
}

function marketplaceUrl(raw: string) {
  if (!/^\/(?!\/)|^https:\/\//i.test(raw) || /[\\\s]/.test(raw)) return;
  let url: URL;
  try {
    url = new URL(raw, 'https://ai.market');
  } catch {
    return;
  }
  if (url.origin !== 'https://ai.market' || url.username || url.password) return;
  return url;
}

export function anonymousFallbackDestinations(
  event: AnonymousChatEvent,
  surface: 'listing' | 'homepage'
): FallbackDestinations | undefined {
  if (event.type !== 'safe_failure') return;
  if (event.outcome !== 'answer_unverified' && (surface !== 'listing' ||
    (event.outcome !== 'retrieval_unavailable' && event.outcome !== 'no_matches'))) return;
  const copy = typeof event.text === 'string' && event.text.trim() ? event.text : event.message;
  if (typeof copy !== 'string') return;

  const destinations: FallbackDestinations = {};
  for (const [, href] of copy.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const url = marketplaceUrl(href);
    if (!url) continue;

    if (surface === 'listing') {
      if (url.pathname === '/support') return { support: '/support' };
      continue;
    }
    if (url.pathname === '/requests/new') destinations.request = '/requests/new';
    if (!destinations.search && (url.pathname === '/listings' || url.pathname === '/search')) {
      const query = url.searchParams.get('q')?.trim();
      destinations.search = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
    }
  }
  if (destinations.search || destinations.request) return destinations;
}
