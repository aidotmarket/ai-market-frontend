'use client';

import { create } from 'zustand';
import type { User } from '@/types';
import * as authApi from '@/api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string, role?: "buyer" | "seller" | "admin", companyName?: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email, password) => {
    const tokenRes = await authApi.login({ email, password });

    // Store tokens in-memory only — never localStorage
    set({
      token: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      isAuthenticated: true,
    });

    const user = await authApi.getMe();
    set({ user });
  },

  register: async (email, password, firstName, lastName, role = "buyer" as "buyer" | "seller" | "admin", companyName) => {
    await authApi.register({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role, company_name: companyName,
    });

    // Auto-login after registration
    await get().login(email, password);
  },

  logout: () => {
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  refreshAuth: async () => {
    const refreshToken = get().refreshToken;
    if (!refreshToken) throw new Error('No refresh token');

    const { api } = await import('@/api/client');
    const res = await api.post('/auth/refresh', { refresh_token: refreshToken });
    const { access_token, refresh_token: newRefreshToken } = res.data;

    set({
      token: access_token,
      refreshToken: newRefreshToken || refreshToken,
    });
  },

  hydrate: async () => {
    const token = get().token;
    if (!token) return;

    set({ isLoading: true });
    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      get().logout();
      set({ isLoading: false });
    }
  },
}));
