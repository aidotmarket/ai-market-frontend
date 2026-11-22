import type { AnonymousChatEvent } from '@/api/anonymousChat';
import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';

export type FallbackPart = { text: string; href?: string };

function fallbackHref(raw: string, surface: 'listing' | 'homepage') {
  if (!/^\/(?!\/)|^https:\/\//i.test(raw) || /[\\\s]/.test(raw)) return;
  let url: URL;
  try {
    url = new URL(raw, 'https://ai.market');
  } catch {
    return;
  }
  if (url.origin !== 'https://ai.market' || url.username || url.password) return;

  if (surface === 'listing') return url.pathname === '/support' ? '/support' : undefined;
  if (url.pathname === '/requests/new') return '/requests/new';
  if (url.pathname === '/listings' || url.pathname === '/search') {
    const query = url.searchParams.get('q')?.trim();
    return query ? `/search?q=${encodeURIComponent(query)}` : '/search';
  }
}

export function anonymousFallbackParts(
  event: AnonymousChatEvent,
  surface: 'listing' | 'homepage',
  locale: AnonymousAllAILocale
): FallbackPart[] | undefined {
  if (event.type !== 'safe_failure' || (event.locale !== undefined && event.locale !== locale)) return;
  if (event.outcome !== 'answer_unverified' && (surface !== 'listing' ||
    (event.outcome !== 'retrieval_unavailable' && event.outcome !== 'no_matches'))) return;
  const copy = typeof event.text === 'string' && event.text.trim() ? event.text : event.message;
  if (typeof copy !== 'string') return;

  // The backend emits plain copy with inline links. Keep the copy and labels as text.
  const parts: FallbackPart[] = [];
  let offset = 0;
  for (const match of copy.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
    if (match.index > offset) parts.push({ text: copy.slice(offset, match.index) });
    parts.push({ text: match[1], href: fallbackHref(match[2], surface) });
    offset = match.index + match[0].length;
  }
  if (!parts.some((part) => part.href)) return;
  if (offset < copy.length) parts.push({ text: copy.slice(offset) });
  return parts;
}
