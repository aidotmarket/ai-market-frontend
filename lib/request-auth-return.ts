import { PENDING_ACTION_CONTINUATION, validateRedirect } from '@/lib/redirect';

import { CHECKOUT_HANDOFF_PATH } from '@/lib/checkout-domain';

type Method = 'oauth' | 'email';
const KEY = 'request_auth_return';
const TTL = 30 * 60_000;

function safeRequestPath(path?: string | null): string {
  if (path && (PENDING_ACTION_CONTINUATION.test(path) || CHECKOUT_HANDOFF_PATH.test(path))) return path;
  const validated = validateRedirect(path, '');
  if (!validated || !path?.startsWith('/') || /[\u0000-\u001f\u007f-\u009f]/u.test(validated)) return '';
  // Validate a decoded copy, but keep encoded query delimiters and values intact.
  const decodedUrl = new URL(validated, 'https://ai.market');
  const url = new URL(path, 'https://ai.market');
  return url.origin === 'https://ai.market' && /^\/requests(?:\/|$)/.test(url.pathname)
    && /^\/requests(?:\/|$)/.test(decodedUrl.pathname)
    ? `${url.pathname}${url.search}${url.hash}` : '';
}

// Email links may open in a new tab. Confirmation tokens still require the owner session.
const storage = (method: Method) => method === 'email' ? localStorage : sessionStorage;

export function saveRequestAuthReturn(method: Method, path?: string | null): void {
  try {
    const target = safeRequestPath(path);
    if (target) storage(method).setItem(KEY, JSON.stringify({ path: target, deadline: Date.now() + TTL }));
    else storage(method).removeItem(KEY);
  } catch { /* Unavailable browser storage must not block sign-in. */ }
}

export function consumeRequestAuthReturn(method: Method, fallback: string): string {
  try {
    const saved = JSON.parse(storage(method).getItem(KEY) || 'null');
    storage(method).removeItem(KEY);
    if (saved && Number.isFinite(saved.deadline) && saved.deadline > Date.now()
      && saved.deadline <= Date.now() + TTL) return safeRequestPath(saved.path) || fallback;
  } catch { /* Invalid or unavailable storage uses the existing continuation. */ }
  return fallback;
}
