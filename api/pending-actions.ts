import axios from 'axios';
import { sessionCsrf as pendingActionCsrf } from '@/lib/session-csrf';
import { useAuthStore } from '@/store/auth';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';

export { pendingActionCsrf };

export type { SellerBatchSummary, SellerBatchItemSummary } from '@/lib/seller-batch';
import { isSellerBatchSummary } from '@/lib/seller-batch';
import type { SellerBatchSummary } from '@/lib/seller-batch';

export type PendingActionStatus = 'pending_review' | 'confirmed' | 'denied' | 'expired' | 'failed';
export interface PendingAction {
  id: string;
  request_id: string;
  status: PendingActionStatus;
  summary: Record<string, unknown> | SellerBatchSummary;
  summary_hash: string;
  expires_at: string;
  result: Record<string, unknown> | null;
  error_code: string | null;
  admission?: SellerAdmission | null;
}

// Keep one signed credential and its CSRF digest together. The shared client's
// automatic 401 refresh would otherwise replay a decision with stale CSRF.
const client = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

function session() {
  const token = useAuthStore.getState().token;
  return { csrf: pendingActionCsrf(token || ''), headers: (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string> };
}

function requireLink(id: string, token: string) {
  if (!PENDING_ACTION_CONTINUATION.test(`/confirm/${id}?t=${token}`)) throw new Error('INVALID_LINK');
}

function response(data: PendingAction, id?: string): PendingAction {
  if (!data || typeof data.id !== 'string' || (id && data.id.toLowerCase() !== id.toLowerCase()) || typeof data.request_id !== 'string'
    || !['pending_review', 'confirmed', 'denied', 'expired', 'failed'].includes(data.status)
    || !data.summary || typeof data.summary !== 'object' || Array.isArray(data.summary)
    || !/^[a-f0-9]{64}$/.test(data.summary_hash) || !Number.isFinite(Date.parse(data.expires_at))) {
    throw new Error('INVALID_RESPONSE');
  }
  return data;
}

export async function getPendingAction(id: string, token: string): Promise<PendingAction> {
  requireLink(id, token);
  const { csrf, headers } = session();
  const { data } = await client.get<PendingAction>(`/pending-actions/${id}`, {
    params: { t: token }, headers: { ...headers, 'X-CSRF-Token': csrf },
  });
  return response(data, id);
}

export async function listPendingActions(): Promise<PendingAction[]> {
  const { csrf, headers } = session();
  const { data } = await client.get<PendingAction[]>('/pending-actions', {
    params: { status: 'pending_review' }, headers: { ...headers, 'X-CSRF-Token': csrf },
  });
  if (!Array.isArray(data)) throw new Error('INVALID_RESPONSE');
  return data.map((item) => response(item));
}

export async function decidePendingAction(id: string, token: string, decision: 'confirm' | 'decline', summaryHash: string, reauthToken?: string): Promise<PendingAction> {
  requireLink(id, token);
  const { csrf, headers } = session();
  const body = decision === 'confirm' ? { token, csrf, summary_hash: summaryHash, ...(reauthToken ? { reauth_token: reauthToken } : {}) } : { token, csrf };
  const { data } = await client.post<PendingAction>(`/pending-actions/${id}/${decision}`, body, { headers });
  return response(data, id);
}

export function pendingActionError(error: unknown): 'not_found' | 'company_login' | 'login' | 'second_factor' | 'enrollment' | 'summary_unavailable' | 'changed' | 'unavailable' {
  const reply = (error as { response?: { status?: number; data?: { detail?: string } } })?.response;
  if (reply?.status === 403 && reply.data?.detail === 'SSO_REQUIRED') return 'company_login';
  if (reply?.status === 404) return 'not_found';
  if (reply?.data?.detail === 'SUMMARY_CONTENT_UNAVAILABLE') return 'summary_unavailable';
  if (reply?.data?.detail === 'SECOND_FACTOR_ENROLLMENT_REQUIRED') return 'enrollment';
  if (reply?.data?.detail === 'SECOND_FACTOR_REQUIRED') return 'second_factor';
  if (reply?.status === 401 || reply?.data?.detail === 'RECENT_LOGIN_REQUIRED' || reply?.data?.detail === 'REAUTH_REQUIRED') return 'login';
  if (reply?.status === 409 && reply.data?.detail === 'SUMMARY_CHANGED') return 'changed';
  return 'unavailable';
}


export interface SellerAdmission {
  effective: boolean;
  reason: string | null;
  checked_at: string;
  switch_snapshot: Record<'connector_enabled' | 'action_path_enabled' | 'seller_enabled' | 'seller_bulk_enabled' | 'global_enabled' | 'profile_enabled' | 'tool_enabled', boolean>;
}
const switchKeys = ['connector_enabled', 'action_path_enabled', 'seller_enabled', 'seller_bulk_enabled', 'global_enabled', 'profile_enabled', 'tool_enabled'] as const;
// A short lease is UI freshness only; the backend independently rechecks consent.
export function sellerAdmissionEnabled(value: unknown, now = Date.now()): value is SellerAdmission {
  const admission = value as SellerAdmission | null;
  if (!admission || admission.effective !== true || admission.reason !== null || typeof admission.checked_at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(admission.checked_at)) return false;
  const age = now - Date.parse(admission.checked_at);
  return Number.isFinite(age) && age >= -5000 && age < 15000
    && !!admission.switch_snapshot && typeof admission.switch_snapshot === 'object' && !Array.isArray(admission.switch_snapshot) && switchKeys.every(key => admission.switch_snapshot[key] === true);
}
export async function getSellerCapability(id: string, token: string): Promise<SellerAdmission> {
  requireLink(id, token);
  const { csrf, headers } = session();
  const { data } = await client.get<SellerAdmission>(`/pending-actions/${id}/capability`, {
    params: { t: token }, headers: { ...headers, 'X-CSRF-Token': csrf },
  });
  return data;
}

export interface SellerActivityItem {
  id: string; kind: 'seller_operation_item'; target_id: string; summary: string;
  result_index: number; action: string;
  status: 'waiting' | 'queued' | 'succeeded' | 'no_change' | 'blocked' | 'failed' | 'cancelled';
  error_code?: string | null; revision?: number | null; listing_version_id?: string | null;
}
export interface SellerActivity {
  operation: { operation_id: string; execution_status: string; execution_deadline: string;
    requested_count: number; eligible_count: number; blocked_count: number; succeeded_count: number;
    no_change_count: number; failed_count: number; cancelled_count: number };
  items: SellerActivityItem[]; limit: number; offset: number; has_more: boolean; next_cursor?: string | null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function nativeHeaders(headers: Record<string, string>) {
  return { ...headers, ...(typeof window !== 'undefined' ? { Origin: window.location.origin } : {}) };
}
export async function getSellerActivity(operationId: string, cursor?: string): Promise<SellerActivity> {
  if (!uuid.test(operationId) || (cursor !== undefined && (!cursor || new TextEncoder().encode(cursor).length > 512))) throw new Error('INVALID_ACTIVITY_REQUEST');
  const { csrf, headers } = session();
  const { data } = await client.get<SellerActivity>(`/pending-actions/seller-operations/${operationId}/activity`, {
    params: { limit: 20, ...(cursor !== undefined ? { cursor } : {}) }, headers: nativeHeaders({ ...headers, 'X-CSRF-Token': csrf }),
  });
  if (!data || data.operation?.operation_id !== operationId || !Array.isArray(data.items)
    || !['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'].includes(data.operation.execution_status)
    || !Number.isFinite(Date.parse(data.operation.execution_deadline))
    || ['requested_count', 'eligible_count', 'blocked_count', 'succeeded_count', 'no_change_count', 'failed_count', 'cancelled_count'].some(key => {
      const value = data.operation[key as keyof SellerActivity['operation']];
      return !Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 50;
    })
    || typeof data.has_more !== 'boolean' || !Number.isInteger(data.offset) || data.offset < 0
    || !Number.isInteger(data.limit) || data.limit < 1 || data.limit > 50 || data.items.length > data.limit
    || data.items.some((item, index) => !item || !uuid.test(item.id) || !uuid.test(item.target_id) || item.kind !== 'seller_operation_item'
      || typeof item.summary !== 'string' || !Number.isInteger(item.result_index) || item.result_index < 0 || item.result_index > 49
      || (index > 0 && item.result_index <= data.items[index - 1].result_index)
      || typeof item.action !== 'string'
      || !['waiting', 'queued', 'succeeded', 'no_change', 'blocked', 'failed', 'cancelled'].includes(item.status))
    || (data.has_more && (typeof data.next_cursor !== 'string' || !data.next_cursor || new TextEncoder().encode(data.next_cursor).length > 512 || data.next_cursor === cursor))) throw new Error('INVALID_ACTIVITY_RESPONSE');
  return data;
}
export interface SellerRetry {
  idempotency_key: string;
  outcome: { confirmation_url?: string; pending_action_id?: string; status: string };
  pending: PendingAction | null;
}
export async function retrySellerFailures(id: string, token: string, targetIds: string[], idempotencyKey: string): Promise<SellerRetry> {
  requireLink(id, token);
  if (!targetIds.length || targetIds.length > 50 || new Set(targetIds).size !== targetIds.length
    || targetIds.some(target => !uuid.test(target)) || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new Error('INVALID_RETRY_SELECTION');
  const { csrf, headers } = session();
  const { data } = await client.post<SellerRetry>(`/pending-actions/${id}/retry`, {
    token, csrf, idempotency_key: idempotencyKey, target_ids: targetIds,
  }, { headers: nativeHeaders(headers) });
  if (!data || data.idempotency_key !== idempotencyKey || !data.outcome) throw new Error('INVALID_RETRY_RESPONSE');
  if (data.pending) {
    response(data.pending);
    if (!isSellerBatchSummary(data.pending.summary) || (data.outcome.pending_action_id && data.outcome.pending_action_id !== data.pending.id)) throw new Error('INVALID_RETRY_RESPONSE');
  }
  return data;
}
