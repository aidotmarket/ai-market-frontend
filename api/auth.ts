'use client';

import { api } from './client';
import type { TokenResponse, User, LoginRequest, RegisterRequest } from '@/types';

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

export async function resetPassword(token: string, new_password: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>('/auth/reset-password', { token, new_password });
  return res.data;
}

export async function oauthAuthorize(provider: string): Promise<{ authorization_url: string }> {
  const res = await api.get<{ authorization_url: string }>(`/auth/oauth/${provider}/authorize`);
  return res.data;
}

export async function oauthCallback(provider: string, code: string, state: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>(`/auth/oauth/${provider}/callback`, { code, state });
  return res.data;
}
