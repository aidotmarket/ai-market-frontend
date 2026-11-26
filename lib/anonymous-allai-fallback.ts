import type { AnonymousChatEvent } from '@/api/anonymousChat';

export type GatewayFallbackDestination = '/aim-data#gateway-setup' | '/aim-data#network-requirements';

export interface FallbackDestinations {
  gateway?: GatewayFallbackDestination;
  support?: '/support';
  search?: string;
  request?: '/requests/new';
}

export function isGatewayHelpPage(page: string) {
  return page === '/aim-data' || page === '/support';
}

export function gatewayHelpFallback(page: string, question: string): { gateway: GatewayFallbackDestination } | undefined {
  if (!isGatewayHelpPage(page)) return;
  const mentionsAimData = /\b(?:aim[\s-]+data|docker)\b/i.test(question);
  const mentionsGateway = /\bgateways?\b|网关|閘道/i.test(question);
  const asksAboutSetup = /\b(?:setup|set up|instal\w*|configur\w*)\b|安装|设置|配置/i.test(question);
  const asksAboutNetwork = /\b(?:network(?:ing)?|ports?|firewalls?|egress|red|puertos?)\b|网络|端口|防火墙/i.test(question);
  if (page === '/support' && !mentionsAimData) {
    if (/\bpayment[\s-]+gateways?\b|支付网关/i.test(question)) return;
    if (!mentionsGateway || !(asksAboutSetup || asksAboutNetwork)) return;
  }

  if (asksAboutNetwork) return { gateway: '/aim-data#network-requirements' };
  if (!mentionsAimData && !mentionsGateway && !asksAboutSetup) return;
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
