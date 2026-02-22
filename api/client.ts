'use client';

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

// M1: Single-flight refresh pattern
let refreshPromise: Promise<string> | null = null;

async function refreshAuth(): Promise<string> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
    refresh_token: refreshToken,
  });

  const { access_token, refresh_token: newRefreshToken } = response.data;

  // M2: Persist rotated refresh token
  localStorage.setItem('token', access_token);
  if (newRefreshToken) {
    localStorage.setItem('refresh_token', newRefreshToken);
  }

  return access_token;
}

// Request interceptor: attach token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
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
        // M1: Single-flight — only one refresh at a time
        if (!refreshPromise) {
          refreshPromise = refreshAuth().finally(() => {
            refreshPromise = null;
          });
        }
        const newToken = await refreshPromise;

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch {
        // Refresh failed — clear auth and redirect
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);
