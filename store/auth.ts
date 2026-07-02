'use client';

import { create } from 'zustand';
import type { TokenResponse, User } from '@/types';
import * as authApi from '@/api/auth';

export interface PendingTwoFactor {
  preAuthToken: string;
  expiresAt: number;
}

export type AuthFlowResult = { requiresTwoFactor: boolean };
export type TwoFactorVerifyResult = { ok: true } | { ok: false; reason: 'invalid_code' | 'expired' | 'missing_challenge' };

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrated: boolean;
  pendingTwoFactor: PendingTwoFactor | null;
  completeSession: (tokenRes: TokenResponse) => Promise<void>;
  login: (email: string, password: string) => Promise<AuthFlowResult>;
  register: (email: string, password: string, firstName?: string, lastName?: string, role?: "buyer" | "seller" | "model_provider" | "admin", companyName?: string) => Promise<void>;
  oauthLogin: (provider: string, code: string, state: string, nonce: string) => Promise<AuthFlowResult>;
  magicLinkVerify: (token: string) => Promise<AuthFlowResult>;
  verifyTwoFactor: (code: string) => Promise<TwoFactorVerifyResult>;
  clearPendingTwoFactor: () => void;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  hydrated: false,
  pendingTwoFactor: null,

  completeSession: async (tokenRes) => {
    set({
      token: tokenRes.access_token,
      isAuthenticated: true,
      pendingTwoFactor: null,
    });

    const user = await authApi.getMe();
    set({ user });
  },

  login: async (email, password) => {
    const res = await authApi.login({ email, password });

    if (authApi.isTwoFactorChallenge(res)) {
      set({
        pendingTwoFactor: {
          preAuthToken: res.pre_auth_token,
          expiresAt: Date.now() + res.expires_in * 1000,
        },
        token: null,
        user: null,
        isAuthenticated: false,
      });
      return { requiresTwoFactor: true };
    }

    await get().completeSession(res);
    return { requiresTwoFactor: false };
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
    const res = await authApi.oauthCallback(provider, code, state, nonce);

    if (authApi.isTwoFactorChallenge(res)) {
      set({
        pendingTwoFactor: {
          preAuthToken: res.pre_auth_token,
          expiresAt: Date.now() + res.expires_in * 1000,
        },
        token: null,
        user: null,
        isAuthenticated: false,
      });
      return { requiresTwoFactor: true };
    }

    await get().completeSession(res);
    return { requiresTwoFactor: false };
  },

  magicLinkVerify: async (token) => {
    const res = await authApi.magicLinkVerify(token);

    if (authApi.isTwoFactorChallenge(res)) {
      set({
        pendingTwoFactor: {
          preAuthToken: res.pre_auth_token,
          expiresAt: Date.now() + res.expires_in * 1000,
        },
        token: null,
        user: null,
        isAuthenticated: false,
      });
      return { requiresTwoFactor: true };
    }

    await get().completeSession(res);
    return { requiresTwoFactor: false };
  },

  verifyTwoFactor: async (code) => {
    const pending = get().pendingTwoFactor;
    if (!pending) {
      return { ok: false, reason: 'missing_challenge' };
    }

    try {
      const tokenRes = await authApi.verify2FALogin(pending.preAuthToken, code);
      await get().completeSession(tokenRes);
      return { ok: true };
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;

      if (status === 400) {
        return { ok: false, reason: 'invalid_code' };
      }

      if (status === 401) {
        get().clearPendingTwoFactor();
        return { ok: false, reason: 'expired' };
      }

      throw error;
    }
  },

  clearPendingTwoFactor: () => {
    set({ pendingTwoFactor: null });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        pendingTwoFactor: null,
      });
    }
  },

  refreshAuth: async () => {
    const { refreshAccessToken } = await import('@/api/client');
    await refreshAccessToken();

    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, pendingTwoFactor: null });
    } catch {
      // Keep refreshed access token even if reloading the user fails transiently.
    }
  },

  hydrate: async () => {
    set({ isLoading: true, pendingTwoFactor: null });

    try {
      const { refreshAccessToken } = await import('@/api/client');
      await refreshAccessToken();
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isLoading: false, hydrated: true, pendingTwoFactor: null });
    } catch {
      set({ isLoading: false, hydrated: true, pendingTwoFactor: null });
    }
  },
}));
