'use client';

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    skipOnboardingRedirect?: boolean;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;
let onboardingRedirected = false;

const DEFAULT_REFRESH_RETRY_SECONDS = 60;
const MAX_REFRESH_RETRY_SECONDS = 60;
const IMF_FIXDATE_PATTERN =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/i;
const RFC850_DATE_PATTERN =
  /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2} \d{2}:\d{2}:\d{2} GMT$/i;
const ASCTIME_DATE_PATTERN =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?: \d|\d{2}) \d{2}:\d{2}:\d{2} \d{4}$/i;

function isHttpDate(value: string): boolean {
  return (
    IMF_FIXDATE_PATTERN.test(value) ||
    RFC850_DATE_PATTERN.test(value) ||
    ASCTIME_DATE_PATTERN.test(value)
  );
}

function getRefreshRetryDelayMs(error: AxiosError): number {
  const headers = error.response?.headers as
    | { get?: (name: string) => unknown; [name: string]: unknown }
    | undefined;
  const rawRetryAfter = headers?.get?.('retry-after') ?? headers?.['retry-after'];

  if (typeof rawRetryAfter !== 'string' && typeof rawRetryAfter !== 'number') {
    return DEFAULT_REFRESH_RETRY_SECONDS * 1000;
  }

  const retryAfter = String(rawRetryAfter).trim();
  let delaySeconds: number;

  if (/^\d+$/.test(retryAfter)) {
    delaySeconds = Number(retryAfter);
  } else {
    if (!isHttpDate(retryAfter)) {
      return DEFAULT_REFRESH_RETRY_SECONDS * 1000;
    }

    const retryAt = Date.parse(retryAfter);
    if (!Number.isFinite(retryAt)) {
      return DEFAULT_REFRESH_RETRY_SECONDS * 1000;
    }
    delaySeconds = Math.ceil((retryAt - Date.now()) / 1000);
  }

  if (!Number.isFinite(delaySeconds)) {
    return DEFAULT_REFRESH_RETRY_SECONDS * 1000;
  }

  return Math.min(MAX_REFRESH_RETRY_SECONDS, Math.max(1, delaySeconds)) * 1000;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRefreshErrorStatus(error: unknown, statuses: readonly number[]): boolean {
  return axios.isAxiosError(error) && statuses.includes(error.response?.status ?? 0);
}

function redirectToLogin(): void {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

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

async function refreshAccessTokenWithRetry(): Promise<string> {
  try {
    return await refreshAccessTokenRequest();
  } catch (error) {
    if (!isRefreshErrorStatus(error, [429])) {
      throw error;
    }

    await wait(getRefreshRetryDelayMs(error as AxiosError));
    return refreshAccessTokenRequest();
  }
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessTokenWithRetry()
      .catch(async (error) => {
        if (isRefreshErrorStatus(error, [401, 403])) {
          await clearAuthState();
          redirectToLogin();
        }
        throw error;
      })
      .finally(() => {
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
      } catch (refreshError) {
        return Promise.reject(refreshError);
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
      !originalRequest.skipOnboardingRedirect &&
      !onboardingRedirected &&
      window.location.pathname !== '/dashboard'
    ) {
      onboardingRedirected = true;
      window.location.href = '/dashboard';
    }

    return Promise.reject(error);
  }
);
