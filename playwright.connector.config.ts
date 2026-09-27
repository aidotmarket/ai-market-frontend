import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'connector-oauth-continuation.spec.ts',
  workers: 1,
  outputDir: '/var/tmp/s1757-connector-playwright-results',
  use: { baseURL: 'http://127.0.0.1:4187', browserName: 'chromium', headless: true },
  webServer: { command: 'rtk proxy npx next dev -p 4187', url: 'http://127.0.0.1:4187/login', reuseExistingServer: false, timeout: 120_000 },
});
