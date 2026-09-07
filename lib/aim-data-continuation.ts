import { AIM_DATA_CONTINUATION, validateRedirect } from '@/lib/redirect';

export const CONTINUATION_KEY = 'aim_data_authorization_request';
const TTL = 600_000;
export const aimDataEnabled = () => process.env.NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED === 'true';
export const requestPath = (request: string) => `/oauth/authorize?request=${request}`;

export function clearContinuation() {
  try { sessionStorage.removeItem(CONTINUATION_KEY); } catch { /* Storage unavailable. */ }
}

export function readContinuation(): { request: string; deadline: number } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(CONTINUATION_KEY) || 'null');
    if (value && Object.keys(value).sort().join(',') === 'deadline,request'
      && typeof value.request === 'string' && AIM_DATA_CONTINUATION.test(requestPath(value.request))
      && Number.isFinite(value.deadline) && value.deadline > Date.now()
      && value.deadline <= Date.now() + TTL) return value;
  } catch { /* Invalid or unavailable storage fails closed. */ }
  clearContinuation();
  return null;
}

export function saveContinuation(path: string): boolean {
  const request = AIM_DATA_CONTINUATION.exec(path)?.[1];
  if (!aimDataEnabled() || !request) return false;
  const existing = readContinuation();
  try {
    sessionStorage.setItem(CONTINUATION_KEY, JSON.stringify({
      request, deadline: existing?.request === request ? existing.deadline : Date.now() + TTL,
    }));
    return true;
  } catch { return false; }
}

export function resumeContinuation(redirect?: string | null, fallback = '/listings'): string {
  const saved = readContinuation();
  if (!aimDataEnabled()) {
    clearContinuation();
    return AIM_DATA_CONTINUATION.test(redirect || '') ? fallback : validateRedirect(redirect, fallback);
  }
  if (saved && (!redirect || redirect === requestPath(saved.request))) return requestPath(saved.request);
  return AIM_DATA_CONTINUATION.test(redirect || '') ? fallback : validateRedirect(redirect, fallback);
}
