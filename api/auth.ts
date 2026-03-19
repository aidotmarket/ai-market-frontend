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
