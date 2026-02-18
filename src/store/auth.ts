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
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refresh_token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,

  login: async (email, password) => {
    const tokenRes = await authApi.login({ email, password });
    localStorage.setItem('token', tokenRes.access_token);
    localStorage.setItem('refresh_token', tokenRes.refresh_token);

    const user = await authApi.getMe();
    localStorage.setItem('user', JSON.stringify(user));

    set({
      user,
      token: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      isAuthenticated: true,
    });
  },

  register: async (email, password, firstName, lastName) => {
    await authApi.register({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role: 'buyer',
    });

    // Auto-login after registration
    await get().login(email, password);
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
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

    localStorage.setItem('token', access_token);
    if (newRefreshToken) {
      localStorage.setItem('refresh_token', newRefreshToken);
    }

    set({
      token: access_token,
      refreshToken: newRefreshToken || refreshToken,
    });
  },

  hydrate: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    set({ isLoading: true });
    try {
      const user = await authApi.getMe();
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      // Token invalid — try cached user
      const cached = localStorage.getItem('user');
      if (cached) {
        try {
          set({ user: JSON.parse(cached), isAuthenticated: true, isLoading: false });
        } catch {
          get().logout();
          set({ isLoading: false });
        }
      } else {
        get().logout();
        set({ isLoading: false });
      }
    }
  },
}));
