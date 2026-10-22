'use client';

import { create } from 'zustand';
import { authSessionOwner, advanceAuthSessionOwner, assertAuthSessionOwner, isAuthSessionOwner } from '@/lib/auth-session-owner';
import type { LoginResult, TokenResponse, User } from '@/types';
import * as authApi from '@/api/auth';
import { clearConnectorContinuation, setConnectorStatus } from '@/lib/aim-data-continuation';

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

function isEmailVerificationRequiredError(error: unknown): boolean {
  const response = typeof error === 'object' && error !== null && 'response' in error
    ? (error as { response?: { status?: number; data?: unknown } }).response
    : undefined;

  if (response?.status !== 403) {
    return false;
  }

  const data = response.data;
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown; email_verification_required?: unknown }).detail;

    return (data as { email_verification_required?: unknown }).email_verification_required === true
      || detail === 'email_verification_required'
      || (detail !== null
        && typeof detail === 'object'
        && (detail as { email_verification_required?: unknown }).email_verification_required === true);
  }

  return false;
}

// Credential rotation keeps the same action owner; logout and account changes do not.
export const authSessionIdentity = (state: Pick<AuthState, 'user' | 'token'>): string | null =>
  state.token ? state.user?.id ?? null : null;

export const useAuthStore = create<AuthState>((set, get) => {
  // An admitted login takes precedence over background session restoration.
  // Keep its owner so an older completion cannot release a replacement login.
  let pendingLogin: { owner: number } | null = null;
  const hasPendingLogin = () => pendingLogin !== null && isAuthSessionOwner(pendingLogin.owner);

  async function completeOwnedSession(tokenRes: TokenResponse, owner: number) {
    assertAuthSessionOwner(owner);
    const session = advanceAuthSessionOwner();
    if (pendingLogin?.owner === owner) pendingLogin.owner = session;
    set({ token: tokenRes.access_token, user: null, isAuthenticated: true,
      pendingTwoFactor: null, isLoading: false, hydrated: true });
    const user = await authApi.getMe();
    assertAuthSessionOwner(session);
    set({ user });
  }

  async function acceptLogin(res: LoginResult, owner: number): Promise<AuthFlowResult> {
    assertAuthSessionOwner(owner);
    if (authApi.isTwoFactorChallenge(res)) {
      advanceAuthSessionOwner();
      set({
        isLoading: false, hydrated: true,
        pendingTwoFactor: {
          preAuthToken: res.pre_auth_token,
          expiresAt: Date.now() + res.expires_in * 1000,
        },
        token: null, user: null, isAuthenticated: false,
      });
      return { requiresTwoFactor: true };
    }
    await completeOwnedSession(res, owner);
    return { requiresTwoFactor: false };
  }

  function beginLogin(): number {
    const owner = advanceAuthSessionOwner();
    pendingLogin = { owner };
    set({ pendingTwoFactor: null, isLoading: false, hydrated: true });
    return owner;
  }

  async function runLogin(request: () => Promise<LoginResult>): Promise<AuthFlowResult> {
    const owner = beginLogin();
    const admitted = pendingLogin;
    try {
      return await acceptLogin(await request(), owner);
    } finally {
      if (pendingLogin === admitted) pendingLogin = null;
    }
  }

  return {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    hydrated: false,
    pendingTwoFactor: null,

    completeSession: async (tokenRes) => {
      await completeOwnedSession(tokenRes, authSessionOwner());
    },

    login: async (email, password) => {
      return runLogin(() => authApi.login({ email, password }));
    },

    register: async (email, password, firstName, lastName, role = "buyer" as "buyer" | "seller" | "model_provider" | "admin", companyName) => {
      try {
        await authApi.register({
          email,
          password,
          first_name: firstName,
          last_name: lastName,
          role,
          company_name: companyName,
        });
      } catch (error) {
        if (isEmailVerificationRequiredError(error)) {
          return;
        }

        throw error;
      }
    },

    oauthLogin: async (provider, code, state, nonce) => {
      return runLogin(() => authApi.oauthCallback(provider, code, state, nonce));
    },

    magicLinkVerify: async (token) => {
      return runLogin(() => authApi.magicLinkVerify(token));
    },

    verifyTwoFactor: async (code) => {
      const pending = get().pendingTwoFactor;
      if (!pending) {
        return { ok: false, reason: 'missing_challenge' };
      }

      const owner = advanceAuthSessionOwner();
      let tokenRes: TokenResponse;
      try {
        tokenRes = await authApi.verify2FALogin(pending.preAuthToken, code);
      } catch (error) {
        assertAuthSessionOwner(owner);
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
      await completeOwnedSession(tokenRes, owner);
      return { ok: true };
    },

    clearPendingTwoFactor: () => {
      if (get().pendingTwoFactor) {
        advanceAuthSessionOwner();
        set({ pendingTwoFactor: null });
      }
    },

    logout: async () => {
      const owner = advanceAuthSessionOwner();
      const clear = () => {
        clearConnectorContinuation();
        setConnectorStatus(false);
        set({ user: null, token: null, isAuthenticated: false, pendingTwoFactor: null,
          isLoading: false, hydrated: true });
      };
      try {
        // Dispatch with the existing bearer for best-effort server revocation,
        // then clear locally without waiting for the response.
        const request = authApi.logout();
        clear();
        await request;
      } finally {
        if (isAuthSessionOwner(owner)) clear();
      }
    },

    refreshAuth: async () => {
      const owner = authSessionOwner();
      if (hasPendingLogin() || get().pendingTwoFactor) return;
      const { refreshAccessToken } = await import('@/api/client');
      assertAuthSessionOwner(owner);
      await refreshAccessToken();
      assertAuthSessionOwner(owner);

      try {
        const user = await authApi.getMe();
        assertAuthSessionOwner(owner);
        set({ user, isAuthenticated: true, pendingTwoFactor: null });
      } catch {
        // Keep the current authenticated state if reloading the user fails transiently.
      }
    },

    hydrate: async () => {
      const owner = authSessionOwner();
      // Restoration must not compete with an admitted login or 2FA challenge.
      if (hasPendingLogin() || get().pendingTwoFactor) return;
      set({ isLoading: true, pendingTwoFactor: null });

      try {
        const { refreshAccessToken } = await import('@/api/client');
        assertAuthSessionOwner(owner);
        await refreshAccessToken();
        assertAuthSessionOwner(owner);
        const user = await authApi.getMe();
        assertAuthSessionOwner(owner);
        set({ user, isAuthenticated: true, isLoading: false, hydrated: true, pendingTwoFactor: null });
      } catch {
        // refreshAccessToken owns terminal 401/403 clearing. Hydration must not
        // erase an existing session for a transient 429, network error, or 5xx.
        if (isAuthSessionOwner(owner)) set({ isLoading: false, hydrated: true });
      }
    },
  };
});
