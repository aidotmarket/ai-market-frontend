import axios from 'axios';
import { sessionCsrf as pendingActionCsrf } from '@/lib/session-csrf';
import { useAuthStore } from '@/store/auth';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';

export { pendingActionCsrf };

export type { SellerBatchSummary, SellerBatchItemSummary } from '@/lib/seller-batch';
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
  return { csrf: pendingActionCsrf(token || ''), headers: token ? { Authorization: `Bearer ${token}` } : {} };
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

export function pendingActionError(error: unknown): 'not_found' | 'login' | 'second_factor' | 'enrollment' | 'summary_unavailable' | 'changed' | 'unavailable' {
  const reply = (error as { response?: { status?: number; data?: { detail?: string } } })?.response;
  if (reply?.status === 404) return 'not_found';
  if (reply?.data?.detail === 'SUMMARY_CONTENT_UNAVAILABLE') return 'summary_unavailable';
  if (reply?.data?.detail === 'SECOND_FACTOR_ENROLLMENT_REQUIRED') return 'enrollment';
  if (reply?.data?.detail === 'SECOND_FACTOR_REQUIRED') return 'second_factor';
  if (reply?.status === 401 || reply?.data?.detail === 'RECENT_LOGIN_REQUIRED' || reply?.data?.detail === 'REAUTH_REQUIRED') return 'login';
  if (reply?.status === 409 && reply.data?.detail === 'SUMMARY_CHANGED') return 'changed';
  return 'unavailable';
}
