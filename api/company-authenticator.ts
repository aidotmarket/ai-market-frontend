import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import { pendingActionCsrf } from './pending-actions';
import type { TOTPSetupResponse, TOTPVerifySetupResponse } from '@/types';

// Do not automatically refresh/replay a mutation with a different CSRF token.
const client = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`,
  withCredentials: true,
});

async function post<T>(path: string, body: object): Promise<T> {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  const { data } = await client.post<T>(path, body, { headers: {
    Authorization: `Bearer ${token}`, 'X-CSRF-Token': pendingActionCsrf(token),
  } });
  return data;
}

export const setupCompanyAuthenticator = () => post<TOTPSetupResponse>('/auth/2fa/setup', { reauth_token: '' });
export const verifyCompanyAuthenticator = (code: string) => post<TOTPVerifySetupResponse>('/auth/2fa/verify-setup', { reauth_token: '', code });
export const recoverCompanyAuthenticator = (code: string) => post<{ message: string }>('/auth/2fa/disable', { reauth_token: '', code });

export function companyAuthenticatorError(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: string }; status?: number } })?.response?.data?.detail;
  if (detail === 'Invalid verification code') return 'That code did not work. Try again.';
  if (detail === 'two_factor_managed_by_sso') return 'Authenticator setup is unavailable. Contact your company administrator.';
  if ((error as { response?: { status?: number } })?.response?.status === 429) return 'Too many attempts. Wait before trying again.';
  return 'Sign in again through your company, then restart setup.';
}
