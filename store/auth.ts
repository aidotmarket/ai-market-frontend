'use client';

import { create } from 'zustand';
import type { User } from '@/types';
import * as authApi from '@/api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string, role?: "buyer" | "seller" | "model_provider" | "admin", companyName?: string) => Promise<void>;
  oauthLogin: (provider: string, code: string, state: string, nonce: string) => Promise<void>;
  magicLinkVerify: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email, password) => {
    const tokenRes = await authApi.login({ email, password });

    set({
      token: tokenRes.access_token,
      isAuthenticated: true,
    });

    const user = await authApi.getMe();
    set({ user });
  },

  register: async (email, password, firstName, lastName, role = "buyer" as "buyer" | "seller" | "model_provider" | "admin", companyName) => {
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

  oauthLogin: async (provider, code, state, nonce) => {
    const tokenRes = await authApi.oauthCallback(provider, code, state, nonce);

    set({
      token: tokenRes.access_token,
      isAuthenticated: true,
    });

    const user = await authApi.getMe();
    set({ user });
  },

  magicLinkVerify: async (token) => {
    const tokenRes = await authApi.magicLinkVerify(token);

    set({
      token: tokenRes.access_token,
      isAuthenticated: true,
    });

    const user = await authApi.getMe();
    set({ user });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
      });
    }
  },

  refreshAuth: async () => {
    const { refreshAccessToken } = await import('@/api/client');
    await refreshAccessToken();

    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true });
    } catch {
      // Keep refreshed access token even if reloading the user fails transiently.
    }
  },

  hydrate: async () => {
    set({ isLoading: true });

    try {
      const { refreshAccessToken } = await import('@/api/client');
      await refreshAccessToken();
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
