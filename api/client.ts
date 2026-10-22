'use client';

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth';
import { authSessionOwner, advanceAuthSessionOwner, assertAuthSessionOwner, isAuthSessionOwner } from '@/lib/auth-session-owner';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let refreshFlight: { owner: number; promise: Promise<string> } | null = null;

type OwnedRequest = InternalAxiosRequestConfig & { _authOwner?: number; _retry?: boolean };

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
    // Confirmation owns API admission: a flag-off 404 must stay inert, and an
    // enabled request offers login with its validated continuation intact.
    const path = window.location.pathname + window.location.search + window.location.hash;
    if (PENDING_ACTION_CONTINUATION.test(path)) return;
    window.location.href = '/login';
  }
}

function clearAuthState(): number {
  const owner = advanceAuthSessionOwner();
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    pendingTwoFactor: null,
    isLoading: false,
    hydrated: true,
  });
  return owner;
}

async function refreshAccessTokenRequest(owner: number): Promise<string> {
  assertAuthSessionOwner(owner);
  const response = await axios.post<{ access_token: string }>(
    `${API_URL}/api/v1/auth/refresh`,
    {},
    {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    }
  );

  const { access_token } = response.data;

  assertAuthSessionOwner(owner);
  useAuthStore.setState({
    token: access_token,
  });

  return access_token;
}

async function refreshAccessTokenWithRetry(owner: number): Promise<string> {
  try {
    return await refreshAccessTokenRequest(owner);
  } catch (error) {
    if (!isRefreshErrorStatus(error, [429])) {
      throw error;
    }

    assertAuthSessionOwner(owner);
    await wait(getRefreshRetryDelayMs(error as AxiosError));
    return refreshAccessTokenRequest(owner);
  }
}

export function refreshAccessToken(): Promise<string> {
  const owner = authSessionOwner();
  if (refreshFlight?.owner === owner) return refreshFlight.promise;

  const promise = refreshAccessTokenWithRetry(owner)
    .catch((error) => {
      if (isAuthSessionOwner(owner) && isRefreshErrorStatus(error, [401, 403])) {
        const hadSession = useAuthStore.getState().isAuthenticated;
        const clearedOwner = clearAuthState();
        if (hadSession && isAuthSessionOwner(clearedOwner)) redirectToLogin();
      }
      throw error;
    })
    .finally(() => {
      // A superseded flight must not erase a newer owner's single-flight.
      if (refreshFlight?.promise === promise) refreshFlight = null;
    });
  refreshFlight = { owner, promise };
  return promise;
}

// Synchronous admission captures ownership before Axios can yield to a login.
// Replays retain their original owner and are checked again before dispatch.
api.interceptors.request.use((config: OwnedRequest) => {
  config._authOwner ??= authSessionOwner();
  assertAuthSessionOwner(config._authOwner);
  const token = useAuthStore.getState().token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error: unknown) => { throw error; }, { synchronous: true });

// Response interceptor: handle 401 with single-flight refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as OwnedRequest | undefined;
    if (!originalRequest || !error.response) {
      return Promise.reject(error);
    }

    // Only retry once and only for 401s. Newsletter subscription is public:
    // a refusal must stay at the form rather than refresh auth or redirect.
    if (
      error.response.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      originalRequest.url !== '/auth/logout' &&
      originalRequest.url !== '/newsletter-subscribe' &&
      !originalRequest.url?.includes('/auth/2fa/verify')
    ) {
      // Never refresh or replay an action admitted by an earlier lifecycle.
      if (originalRequest._authOwner === undefined || !isAuthSessionOwner(originalRequest._authOwner)) {
        return Promise.reject(error);
      }
      originalRequest._retry = true;

      try {
        const newToken = await refreshAccessToken();
        assertAuthSessionOwner(originalRequest._authOwner);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
