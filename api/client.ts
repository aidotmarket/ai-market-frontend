'use client';

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;
let onboardingRedirected = false;

async function clearAuthState(): Promise<void> {
  const { useAuthStore } = await import('@/store/auth');
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    pendingTwoFactor: null,
  });
}

async function refreshAccessTokenRequest(): Promise<string> {
  const response = await axios.post<{ access_token: string }>(
    `${API_URL}/api/v1/auth/refresh`,
    {},
    {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    }
  );

  const { access_token } = response.data;

  const { useAuthStore } = await import('@/store/auth');
  useAuthStore.setState({
    token: access_token,
  });

  return access_token;
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessTokenRequest().catch(async (error) => {
      await clearAuthState();
      throw error;
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

// Request interceptor: attach token from Zustand store
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const { useAuthStore } = await import('@/store/auth');
  const token = useAuthStore.getState().token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with single-flight refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    if (!originalRequest || !error.response) {
      return Promise.reject(error);
    }

    // Only retry once and only for 401s (not on the refresh endpoint itself)
    if (
      error.response.status === 401 &&
      !(originalRequest as { _retry?: boolean })._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/2fa/verify')
    ) {
      (originalRequest as { _retry?: boolean })._retry = true;

      try {
        const newToken = await refreshAccessToken();

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch {
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    // Onboarding not finished: the API gate returns 403 with an onboarding_url.
    // Guide the user to complete setup (surfaced on the dashboard) instead of
    // surfacing the raw error object (which crashed the app as React #31).
    const onboardingData = error.response.data as
      | { detail?: { onboarding_url?: string } }
      | undefined;
    if (
      error.response.status === 403 &&
      onboardingData?.detail?.onboarding_url &&
      typeof window !== 'undefined' &&
      !onboardingRedirected &&
      window.location.pathname !== '/dashboard'
    ) {
      onboardingRedirected = true;
      window.location.href = '/dashboard';
    }

    return Promise.reject(error);
  }
);
