import type { AxiosRequestConfig } from 'axios';

export const privateReadOptions = {
  adapter: 'fetch',
  fetchOptions: { cache: 'no-store' },
} satisfies AxiosRequestConfig;
