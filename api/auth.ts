'use client';

import { api } from './client';
import type {
  GenerateReauthTokenResponse,
  ReauthResponse,
  TokenResponse,
  User,
  LoginRequest,
  RegisterRequest,
  TOTPSetupResponse,
  TOTPVerifySetupResponse,
} from '@/types';

export async function login(data: LoginRequest): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>('/auth/login', data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<User> {
  const res = await api.post<User>('/auth/register', data);
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await api.get<User>('/auth/me');
  return res.data;
}

export async function updateProfile(data: { first_name?: string; last_name?: string; company_name?: string }): Promise<User> {
  const res = await api.patch<User>('/auth/me', data);
  return res.data;
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/forgot-password', { email });
  return res.data;
}

export async function requestMagicLink(email: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/magic-link/request', { email });
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

export async function oauthCallback(provider: string, code: string, state: string, nonce: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>(`/auth/oauth/${provider}/callback`, { code, state, nonce });
  return res.data;
}

export async function magicLinkVerify(token: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>('/auth/magic-link/verify', { token });
  return res.data;
}

export async function setup2FA(): Promise<TOTPSetupResponse> {
  const res = await api.post<TOTPSetupResponse>('/auth/2fa/setup');
  return res.data;
}

export async function verify2FASetup(code: string): Promise<TOTPVerifySetupResponse> {
  const res = await api.post<TOTPVerifySetupResponse>('/auth/2fa/verify-setup', { code });
  return res.data;
}

export async function generateReauthToken(): Promise<GenerateReauthTokenResponse> {
  const res = await api.post<GenerateReauthTokenResponse>('/auth/generate-reauth-token');
  return res.data;
}

export async function submitReauth(code: string): Promise<ReauthResponse> {
  const res = await api.post<ReauthResponse>('/auth/reauth', { code });
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
