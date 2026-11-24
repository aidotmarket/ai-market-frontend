import { defineConfig } from '@playwright/test';

const port = process.env.KD_BRIDGE_PORT_BASE ?? '4187';
const baseURL = `http://127.0.0.1:${port}`;
const scratch = process.env.KD_BRIDGE_JOB_SCRATCH;

export default defineConfig({
  testDir: './tests',
  testMatch: 'sell-data-navigation.playwright.spec.ts',
  timeout: 60_000,
  workers: 1,
  outputDir: scratch ? `${scratch}/playwright-navigation` : 'test-results',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] },
  },
  webServer: {
    command: `rtk proxy npx next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/pricing`,
    timeout: 120_000,
  },
});
