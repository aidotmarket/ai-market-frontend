import { postSessionMutation as post } from './session-mutation';
import type { TokenResponse, TOTPSetupResponse, TOTPVerifySetupResponse } from '@/types';

export const setupCompanyAuthenticator = () => post<TOTPSetupResponse>('/auth/2fa/setup', {});
export const verifyCompanyAuthenticator = (code: string) => post<TOTPVerifySetupResponse>('/auth/2fa/verify-setup', { code });
export const recoverCompanyAuthenticator = () => post<TokenResponse & { message: string }>('/auth/2fa/disable', {});

export function companyAuthenticatorError(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: string }; status?: number } })?.response?.data?.detail;
  if (detail === 'Invalid verification code') return 'That code did not work. Try again.';
  if (detail === 'two_factor_managed_by_sso') return 'Authenticator setup is unavailable. Contact your company administrator.';
  if ((error as { response?: { status?: number } })?.response?.status === 429) return 'Too many attempts. Wait before trying again.';
  return 'Please refresh the page and try again.';
}
