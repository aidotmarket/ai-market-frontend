'use client';

import { api } from './client';
import type {
  LoginResult,
  PreAuthRequiredResponse,
  ReauthResponse,
  TokenResponse,
  User,
  LoginRequest,
  RegisterRequest,
  TOTPSetupResponse,
  TOTPVerifySetupResponse,
} from '@/types';
import { AxiosError } from 'axios';

export const SSO_MANAGED_2FA_MESSAGE = "Two-factor authentication for your account is managed by your organization's single sign-on.";

export function isSsoManaged2FAError(error: unknown): boolean {
  return error instanceof AxiosError && error.response?.status === 409 &&
    error.response.data?.detail === 'two_factor_managed_by_sso';
}

export function isTwoFactorChallenge(r: LoginResult): r is PreAuthRequiredResponse {
  return (r as PreAuthRequiredResponse).requires_2fa === true;
}

export async function login(data: LoginRequest): Promise<LoginResult> {
  const res = await api.post<LoginResult>('/auth/login', data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<User> {
  const res = await api.post<User>('/auth/register', { ...data, role: data.role ?? 'buyer' });
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await api.get<User>('/auth/me');
  return res.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function updateProfile(data: { first_name?: string; last_name?: string; company_name?: string }): Promise<User> {
  const res = await api.patch<User>('/auth/me', data);
  return res.data;
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/forgot-password', { email });
  return res.data;
}

export async function requestMagicLink(email: string, purpose: 'login' | 'register' = 'login'): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/magic-link/request', { email, purpose });
  return res.data;
}

export async function resetPassword(token: string, new_password: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/reset-password', { token, new_password });
  return res.data;
}

export async function oauthAuthorize(provider: string): Promise<{ authorization_url: string; nonce: string }> {
  const res = await api.get<{ authorization_url: string; nonce: string }>(`/auth/oauth/${provider}/authorize`);
  return res.data;
}

export async function oauthCallback(provider: string, code: string, state: string, nonce: string): Promise<LoginResult> {
  const res = await api.post<LoginResult>(`/auth/oauth/${provider}/callback`, { code, state, nonce });
  return res.data;
}

export async function magicLinkVerify(token: string): Promise<LoginResult> {
  const res = await api.post<LoginResult>('/auth/magic-link/verify', { token });
  return res.data;
}

export async function verifyReauthMagicLink(token: string): Promise<ReauthResponse> {
  const res = await api.post<ReauthResponse>('/auth/magic-link/verify', { token });
  return res.data;
}

export async function verify2FALogin(pre_auth_token: string, code: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>('/auth/2fa/verify', { pre_auth_token, code });
  return res.data;
}

export async function setup2FA(reauthToken: string): Promise<TOTPSetupResponse> {
  const res = await api.post<TOTPSetupResponse>('/auth/2fa/setup', { reauth_token: reauthToken });
  return res.data;
}

export async function verify2FASetup(code: string, reauthToken: string): Promise<TOTPVerifySetupResponse> {
  const res = await api.post<TOTPVerifySetupResponse>('/auth/2fa/verify-setup', {
    code,
    reauth_token: reauthToken,
  });
  return res.data;
}

export async function submitReauth(credential: string, method: 'password' | 'totp' | 'magic_link' = 'totp'): Promise<ReauthResponse> {
  const res = await api.post<ReauthResponse>('/auth/reauth', method === 'password'
    ? { method, password: credential }
    : method === 'magic_link' ? { method } : { code: credential });
  return res.data;
}

export async function disable2FA(reauth_token: string, code: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/2fa/disable', { reauth_token, code });
  return res.data;
}

export async function regenerateBackupCodes(reauth_token: string, code: string): Promise<{ backup_codes: string[] }> {
  const res = await api.post<{ backup_codes: string[] }>('/auth/2fa/regenerate-backup-codes', { reauth_token, code });
  return res.data;
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`);
  return res.data;
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/resend-verification', { email, purpose: 'login' });
  return res.data;
}
