import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import { pendingActionCsrf } from './pending-actions';

// Do not automatically refresh/replay a mutation with a different CSRF token.
const client = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`,
  withCredentials: true,
});

function sessionHeaders() {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  return { Authorization: `Bearer ${token}`, 'X-CSRF-Token': pendingActionCsrf(token) };
}

export async function postSessionMutation<T>(path: string, body: object): Promise<T> {
  const { data } = await client.post<T>(path, body, { headers: sessionHeaders() });
  return data;
}

export async function deleteSessionMutation<T>(path: string, body: object): Promise<T> {
  const { data } = await client.delete<T>(path, { data: body, headers: sessionHeaders() });
  return data;
}
