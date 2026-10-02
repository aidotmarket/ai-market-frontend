import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    exclude: [...configDefaults.exclude, 'tests/*.playwright.spec.ts', 'tests/connector-oauth-continuation.spec.ts'],
    // Leave CPU headroom for React effects and jsdom on shared CI runners.
    maxWorkers: process.env.CI ? 1 : 2,
  },
  resolve: {
    alias: {
      '@': new URL('.', import.meta.url).pathname,
    },
  },
});
