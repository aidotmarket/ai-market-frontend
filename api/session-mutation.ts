import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import { pendingActionCsrf } from './pending-actions';
import { refreshAccessToken, reserveRecoveryRefresh } from './client';
import { authSessionOwner, assertAuthSessionOwner } from '@/lib/auth-session-owner';

// Refresh before admission; never replay a mutation after a refusal.
const client = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`,
  withCredentials: true,
});

function needsRefresh(token: string): boolean {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp !== 'number' || exp * 1000 <= Date.now() + 60_000;
  } catch {
    return true;
  }
}

export interface SessionRefreshAdapter {
  prepareRefresh(): void;
  acceptRefresh(token: string): Promise<void>;
  finish(): void;
}

type SessionHeaders = Readonly<{ Authorization: string; 'X-CSRF-Token': string }>;
const headersFor = (token: string): SessionHeaders => ({ Authorization: `Bearer ${token}`, 'X-CSRF-Token': pendingActionCsrf(token) });

async function sessionHeaders(allowRefresh = true, assertAdmission?: (headers: SessionHeaders) => void, refresh?: SessionRefreshAdapter) {
  const owner = authSessionOwner();
  let token = useAuthStore.getState().token;
  if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  if (allowRefresh && needsRefresh(token)) {
    if (refresh) {
      // Reuse the existing exclusive refresh lease and owning view's verifier.
      // No other refresh/retry may rotate the association during this handshake.
      const admit = () => {
        const currentToken = useAuthStore.getState().token;
        if (!currentToken) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
        assertAdmission?.(headersFor(currentToken));
      };
      const lease = reserveRecoveryRefresh(admit);
      let prepared = false;
      try {
        refresh.prepareRefresh(); prepared = true;
        const token = await lease.refresh();
        await refresh.acceptRefresh(token);
        admit();
      } finally {
        try { if (prepared) refresh.finish(); }
        finally { lease.release(); }
      }
    } else await refreshAccessToken();
    assertAuthSessionOwner(owner);
    token = useAuthStore.getState().token;
    if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  }
  return headersFor(token);
}

export function sessionMutationError(error: unknown): string | null {
  const value = error as { message?: string; response?: { data?: { detail?: string } } } | null;
  const detail = value?.response?.data?.detail ?? value?.message;
  return ['FIRST_PARTY_SESSION_REQUIRED', 'CSRF_REQUIRED', 'BAD_ORIGIN'].includes(detail ?? '')
    ? 'Please refresh the page and try again.' : null;
}

export async function postSessionMutation<T>(path: string, body: object, assertAdmission?: (headers: SessionHeaders) => void, refresh?: SessionRefreshAdapter): Promise<T> {
  const owner = authSessionOwner();
  // Recovery admission and evidence must never rotate implicitly or replay.
  const headers = await sessionHeaders(!path.includes('/recovery/'), assertAdmission, refresh);
  assertAuthSessionOwner(owner);
  assertAdmission?.(headers);
  const { data } = await client.post<T>(path, body, { headers, ...(path.includes('/recovery/') ? { timeout: 15000 } : {}) });
  assertAuthSessionOwner(owner);
  return data;
}

// Same admission/refresh rules as POST; never retry a refused draft mutation.
export async function patchSessionMutation<T>(path: string, body: object, assertAdmission?: () => void): Promise<T> {
  const owner = authSessionOwner();
  const headers = await sessionHeaders();
  assertAuthSessionOwner(owner);
  assertAdmission?.();
  const { data } = await client.patch<T>(path, body, { headers });
  assertAuthSessionOwner(owner);
  return data;
}
