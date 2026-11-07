import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import { pendingActionCsrf } from './pending-actions';
import { refreshAccessToken } from './client';
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

async function sessionHeaders(allowRefresh = true) {
  const owner = authSessionOwner();
  let token = useAuthStore.getState().token;
  if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  if (allowRefresh && needsRefresh(token)) {
    await refreshAccessToken();
    assertAuthSessionOwner(owner);
    token = useAuthStore.getState().token;
    if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  }
  return { Authorization: `Bearer ${token}`, 'X-CSRF-Token': pendingActionCsrf(token) };
}

export function sessionMutationError(error: unknown): string | null {
  const value = error as { message?: string; response?: { data?: { detail?: string } } } | null;
  const detail = value?.response?.data?.detail ?? value?.message;
  return ['FIRST_PARTY_SESSION_REQUIRED', 'CSRF_REQUIRED', 'BAD_ORIGIN'].includes(detail ?? '')
    ? 'Please refresh the page and try again.' : null;
}

export async function postSessionMutation<T>(path: string, body: object, assertAdmission?: (headers: Readonly<{ Authorization: string; 'X-CSRF-Token': string }>) => void): Promise<T> {
  const owner = authSessionOwner();
  // Recovery admission and evidence must never rotate implicitly or replay.
  const headers = await sessionHeaders(!path.includes('/recovery/'));
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
