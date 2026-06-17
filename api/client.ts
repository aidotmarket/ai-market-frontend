'use client';

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;

async function clearAuthState(): Promise<void> {
  const { useAuthStore } = await import('@/store/auth');
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
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
      !originalRequest.url?.includes('/auth/refresh')
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

    return Promise.reject(error);
  }
);
