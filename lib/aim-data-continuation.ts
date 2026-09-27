import { AIM_DATA_CONTINUATION, CONNECTOR_CONTINUATION, validateRedirect } from '@/lib/redirect';

export const CONTINUATION_KEY = 'aim_data_authorization_request';
const TTL = 600_000;
const OFF = new Set(['false', '0', 'off']);
export const aimDataEnabled = () => !OFF.has((process.env.NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED ?? '').trim().toLowerCase());
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

const CONNECTOR_KEY = 'connector_authorization_request';
const CONNECTOR_STATUS_KEY = 'connector_oauth_enabled';
const CONNECTOR_TTL = 1_800_000;
export const connectorRequestPath = (request: string) => `/oauth/connect?request=${request}`;

export function setConnectorStatus(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(CONNECTOR_STATUS_KEY, JSON.stringify({ enabled: true, deadline: Date.now() + CONNECTOR_TTL }));
    else {
      localStorage.removeItem(CONNECTOR_STATUS_KEY);
      clearConnectorContinuation();
    }
  } catch { /* Storage unavailable. */ }
}

export function connectorEnabled() {
  try {
    const value = JSON.parse(localStorage.getItem(CONNECTOR_STATUS_KEY) || 'null');
    if (value && Object.keys(value).sort().join(',') === 'deadline,enabled'
      && value.enabled === true && Number.isFinite(value.deadline)
      && value.deadline > Date.now() && value.deadline <= Date.now() + CONNECTOR_TTL) return true;
    localStorage.removeItem(CONNECTOR_STATUS_KEY);
  } catch { /* Invalid or unavailable storage fails closed. */ }
  return false;
}

export function clearConnectorContinuation() {
  try { localStorage.removeItem(CONNECTOR_KEY); } catch { /* Storage unavailable. */ }
}

type ConnectorContinuation = { request: string; deadline: number; initiated?: true };

export function readConnectorContinuation(): ConnectorContinuation | null {
  if (!connectorEnabled()) return null;
  try {
    const value = JSON.parse(localStorage.getItem(CONNECTOR_KEY) || 'null');
    const keys = value && Object.keys(value).sort().join(',');
    if (value && (keys === 'deadline,request' || keys === 'deadline,initiated,request' && value.initiated === true)
      && typeof value.request === 'string' && CONNECTOR_CONTINUATION.test(connectorRequestPath(value.request))
      && Number.isFinite(value.deadline) && value.deadline > Date.now()
      && value.deadline <= Date.now() + CONNECTOR_TTL) return value;
  } catch { /* Invalid or unavailable storage fails closed. */ }
  clearConnectorContinuation();
  return null;
}

export function saveConnectorContinuation(path: string): boolean {
  const request = CONNECTOR_CONTINUATION.exec(path)?.[1];
  if (!connectorEnabled() || !request) return false;
  const existing = readConnectorContinuation();
  try {
    localStorage.setItem(CONNECTOR_KEY, JSON.stringify({
      request, deadline: existing?.request === request ? existing.deadline : Date.now() + CONNECTOR_TTL,
      ...(existing?.request === request && existing.initiated ? { initiated: true } : {}),
    }));
    return true;
  } catch { return false; }
}

export function initiateConnectorContinuation(redirect?: string | null): boolean {
  const saved = readConnectorContinuation();
  if (!saved || redirect !== connectorRequestPath(saved.request)) return false;
  try {
    localStorage.setItem(CONNECTOR_KEY, JSON.stringify({ ...saved, initiated: true }));
    return true;
  } catch { return false; }
}

export function resumeAuthContinuation(redirect?: string | null, fallback = '/listings'): string {
  const connector = readConnectorContinuation();
  if (connector && (redirect === connectorRequestPath(connector.request) || redirect == null && connector.initiated === true)) {
    return connectorRequestPath(connector.request);
  }
  if (CONNECTOR_CONTINUATION.test(redirect || '')) return fallback;
  return resumeContinuation(redirect, fallback);
}
