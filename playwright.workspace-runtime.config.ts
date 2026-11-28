import { defineConfig } from '@playwright/test';

const port = process.env.KD_BRIDGE_PORT_BASE ?? '4188';
const baseURL = `http://127.0.0.1:${port}`;
const scratch = process.env.KD_BRIDGE_JOB_SCRATCH;
const apiOrigin = 'https://api.workspace-smoke.test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'workspace-next-runtime.playwright.spec.ts',
  timeout: 60_000,
  workers: 1,
  outputDir: scratch ? `${scratch}/playwright-workspace-runtime` : 'test-results',
  metadata: { apiOrigin },
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    env: { NEXT_PUBLIC_API_URL: apiOrigin },
    url: `${baseURL}/dashboard/seller-workspace`,
    timeout: 300_000,
  },
});
