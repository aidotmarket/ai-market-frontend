import axios from 'axios';
import { refreshAccessToken } from './client';
import { authSessionIdentity, useAuthStore } from '@/store/auth';
import { sessionCsrf } from '@/lib/session-csrf';

export type Verb = 'update' | 'publish' | 'unpublish';
export const verbs: Verb[] = ['update', 'publish', 'unpublish'];
export const fields = ['title', 'description', 'category', 'price', 'tags', 'data_format', 'update_cadence_days'] as const;
export interface StandingLimits {
  grant_ids: string[]; client_ids: string[]; operations: Verb[]; categories: string[];
  source_kinds: ('aws' | 'r2' | 'gateway' | 'none')[]; connection_ids: string[];
  mutable_fields: (typeof fields[number])[]; max_batch: number; daily_items: Partial<Record<Verb, number>>;
  concurrent_operations: number; price_min_cents: number | null; price_max_cents: number | null;
  currency: 'USD'; max_price_delta_cents: number | null; sample_rule: 'none_or_unchanged_approved'; expires_at: string;
}
export interface AuthorityStatus {
  version: number; enabled: boolean; limits: StandingLimits | Record<string, never> | null; utc_day: string;
  usage: { action: string; reserved: number; success: number }[];
}
export interface PreviewStatus {
  listing_id: string; publication_version_id: string; version: number; enabled: boolean;
  sample_set_hash: string | null; sample_available: boolean;
  consent_publication_version_id: string | null; consent_sample_set_hash: string | null;
  grant_ids: string[]; profiles: ('claude')[];
}
export interface WebDecision { expected_version: number; idempotency_key: string; csrf: string; reauth_token?: string; review_hash?: string }
export interface AuthoritySet extends WebDecision { limits: StandingLimits }
export interface PreviewSet extends WebDecision {
  listing_id: string; publication_version_id: string; sample_set_hash: string; grant_ids: string[]; profiles: ['claude'];
}
export interface PreviewRevoke extends WebDecision { listing_id: string; publication_version_id: string; sample_set_hash: string }
export interface DecisionReview<T> { action: string; decision: Omit<T, 'csrf' | 'reauth_token' | 'review_hash'>; review_hash: string }
export interface DecisionReceipt { decision_id: string; version: number; enabled: boolean }
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
export const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
export function validLimits(value: unknown): value is StandingLimits {
  const l = value as StandingLimits;
  if (!l || l.currency !== 'USD' || l.sample_rule !== 'none_or_unchanged_approved' || !integer(l.max_batch, 1, 50)
    || !integer(l.concurrent_operations, 1, 50) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(l.expires_at) || !Number.isFinite(Date.parse(l.expires_at))) return false;
  const lists: [unknown, number, number, (v: unknown) => boolean][] = [
    [l.grant_ids, 1, 50, uuid], [l.client_ids, 1, 50, v => typeof v === 'string' && v.length >= 1 && v.length <= 512],
    [l.operations, 1, 3, v => verbs.includes(v as Verb)], [l.categories, 1, 50, v => typeof v === 'string' && v.length >= 1 && v.length <= 80],
    [l.source_kinds, 1, 4, v => ['aws', 'r2', 'gateway', 'none'].includes(String(v))], [l.connection_ids, 0, 50, uuid],
    [l.mutable_fields, 0, 7, v => fields.includes(v as typeof fields[number])],
  ];
  if (lists.some(([v, min, max, valid]) => !Array.isArray(v) || v.length < min || v.length > max || new Set(v).size !== v.length || !v.every(valid))) return false;
  if (!l.daily_items || Object.keys(l.daily_items).length !== l.operations.length || !Object.keys(l.daily_items).every(v => l.operations.includes(v as Verb))
    || !l.operations.every(v => integer(l.daily_items[v], 1, 1000000))) return false;
  return [l.price_min_cents, l.price_max_cents, l.max_price_delta_cents].every(v => v === null || integer(v))
    && (l.price_min_cents === null || l.price_max_cents === null || l.price_min_cents <= l.price_max_cents);
}

// Native requests bind headers and body to one credential pair per attempt.
export const nativeClient = axios.create({ baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`, withCredentials: true, headers: { 'Content-Type': 'application/json' } });
export function nativeSession() {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  const csrf = sessionCsrf(token);
  return { token, csrf, headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrf } };
}
// Pure reads may refresh once, but must never cross a session identity change.
export async function nativeRead<T>(path: string, options: { signal?: AbortSignal; params?: Record<string, unknown> } = {}): Promise<T> {
  const owner = authSessionIdentity(useAuthStore.getState());
  for (let attempt = 0; ; attempt++) {
    if (authSessionIdentity(useAuthStore.getState()) !== owner) throw new Error('SESSION_CHANGED');
    options.signal?.throwIfAborted();
    const session = nativeSession();
    try {
      const { data } = await nativeClient.get<T>(path, { ...options, headers: session.headers });
      if (authSessionIdentity(useAuthStore.getState()) !== owner) throw new Error('SESSION_CHANGED');
      if (useAuthStore.getState().token !== session.token) throw new Error('SESSION_CHANGED');
      options.signal?.throwIfAborted();
      return data;
    } catch (error) {
      if (authSessionIdentity(useAuthStore.getState()) !== owner) throw new Error('SESSION_CHANGED');
      options.signal?.throwIfAborted();
      const retryable = attempt === 0 && axios.isAxiosError(error) && error.response?.status === 401;
      if (useAuthStore.getState().token !== session.token) {
        if (retryable && useAuthStore.getState().token) continue;
        throw new Error('SESSION_CHANGED');
      }
      if (!retryable) throw error;
      await refreshAccessToken();
    }
  }
}
// Only use for idempotent seller writes: retries retain the original action identity.
export async function nativeWrite<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const owner = authSessionIdentity(useAuthStore.getState());
  for (let attempt = 0; ; attempt++) {
    if (authSessionIdentity(useAuthStore.getState()) !== owner) throw new Error('SESSION_CHANGED');
    signal?.throwIfAborted();
    const session = nativeSession();
    try {
      const { data } = await nativeClient.post<T>(path, { ...body, csrf: session.csrf }, {
        ...(signal ? { signal } : {}), headers: session.headers,
      });
      if (authSessionIdentity(useAuthStore.getState()) !== owner) throw new Error('SESSION_CHANGED');
      signal?.throwIfAborted();
      return data;
    } catch (error) {
      if (authSessionIdentity(useAuthStore.getState()) !== owner) throw new Error('SESSION_CHANGED');
      signal?.throwIfAborted();
      const retryable = attempt === 0 && axios.isAxiosError(error) && error.response?.status === 401;
      if (useAuthStore.getState().token !== session.token) {
        if (retryable && useAuthStore.getState().token) continue;
        throw new Error('SESSION_CHANGED');
      }
      if (!retryable) throw error;
      await refreshAccessToken();
    }
  }
}
// Normalize session failures for the shared native sign-in and verification affordances.
export function nativeAuthError(error: unknown): unknown | null {
  const response = axios.isAxiosError(error) ? error.response : undefined;
  const detail = response?.data?.detail;
  const code = typeof detail === 'string' ? detail : detail?.code ?? (error instanceof Error ? error.message : undefined);
  if (['SSO_REQUIRED', 'SECOND_FACTOR_REQUIRED', 'SECOND_FACTOR_ENROLLMENT_REQUIRED', 'RECENT_LOGIN_REQUIRED', 'REAUTH_REQUIRED'].includes(code))
    return { response: { status: response?.status, data: { detail: code } } };
  if (response?.status === 401 || ['FIRST_PARTY_SESSION_REQUIRED', 'SESSION_CHANGED', 'BAD_ORIGIN', 'CSRF_REQUIRED'].includes(code))
    return { response: { status: 401 } };
  return null;
}
export function newDecision(version: number): WebDecision {
  return { expected_version: version, idempotency_key: crypto.randomUUID(), csrf: nativeSession().csrf };
}
const base = '/connector-seller-settings';
export async function readAuthority(): Promise<AuthorityStatus> {
  const data = await nativeRead<AuthorityStatus>(base);
  if (!data || !integer(data.version) || typeof data.enabled !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(data.utc_day)
    || !(data.limits === null || Object.keys(data.limits).length === 0 || validLimits(data.limits)) || !Array.isArray(data.usage)
    || !data.usage.every(u => verbs.some(v => u.action === `aim.listing.${v}`) && integer(u.reserved) && integer(u.success))) throw new Error('INVALID_RESPONSE');
  return data;
}
export async function readPreview(listing: string): Promise<PreviewStatus> {
  if (!uuid(listing)) throw new Error('INVALID_REQUEST');
  const data = await nativeRead<PreviewStatus>(`${base}/preview-consent/${listing}`);
  if (!data || data.listing_id !== listing || !uuid(data.publication_version_id) || !integer(data.version)
    || typeof data.enabled !== 'boolean' || typeof data.sample_available !== 'boolean'
    || !(data.sample_set_hash === null || digest(data.sample_set_hash))
    || !(data.consent_sample_set_hash === null || digest(data.consent_sample_set_hash))
    || !(data.consent_publication_version_id === null || uuid(data.consent_publication_version_id))
    || !Array.isArray(data.grant_ids) || !data.grant_ids.every(uuid) || !Array.isArray(data.profiles) || !data.profiles.every(p => p === 'claude')) throw new Error('INVALID_RESPONSE');
  return data;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const session = nativeSession();
  if ((body as WebDecision).csrf !== session.csrf) throw new Error('SESSION_CHANGED');
  const { data } = await nativeClient.post<T>(base + path, body, { headers: session.headers });
  if (useAuthStore.getState().token !== session.token) throw new Error('SESSION_CHANGED');
  return data;
}
async function review<T extends WebDecision>(path: string, action: string, body: T): Promise<DecisionReview<T>> {
  const result = await post<DecisionReview<T>>(path, body);
  const { csrf: _csrf, reauth_token: _reauth, review_hash: _hash, ...material } = body;
  const canonical = (v: unknown): string => v && typeof v === 'object' && !Array.isArray(v)
    ? JSON.stringify(Object.fromEntries(Object.entries(v).sort().map(([k, x]) => [k, JSON.parse(canonical(x))])))
    : Array.isArray(v) ? JSON.stringify(v.map(x => JSON.parse(canonical(x)))) : JSON.stringify(v);
  if (!result || result.action !== action || !digest(result.review_hash) || canonical(result.decision) !== canonical(material)) throw new Error('EXACT_REVIEW_REQUIRED');
  return result;
}
async function receipt(path: string, body: WebDecision): Promise<DecisionReceipt> {
  const data = await post<DecisionReceipt>(path, body);
  if (!data || !uuid(data.decision_id) || data.version !== body.expected_version + 1 || typeof data.enabled !== 'boolean') throw new Error('INVALID_RESPONSE');
  return data;
}
export const reviewAuthority = (body: AuthoritySet) => review('/authority/review', 'aim.seller.connector_limits.set', body);
export const setAuthority = (body: AuthoritySet) => receipt('/authority', body);
export const reviewStopAuthority = (body: WebDecision) => review('/authority/stop/review', 'aim.seller.connector_limits.revoke', body);
export const stopAuthority = (body: WebDecision) => receipt('/authority/stop', body);
export const reviewPreview = (body: PreviewSet) => review('/preview-consent/review', 'aim.listing.ai_preview_consent.set', body);
export const setPreview = (body: PreviewSet) => receipt('/preview-consent', body);
export const reviewRevokePreview = (body: PreviewRevoke) => review('/preview-consent/revoke/review', 'aim.listing.ai_preview_consent.revoke', body);
export const revokePreview = (body: PreviewRevoke) => receipt('/preview-consent/revoke', body);
