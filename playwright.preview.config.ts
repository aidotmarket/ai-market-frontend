import {defineConfig} from '@playwright/test';
export default defineConfig({testDir: './tests/preview-browser', testMatch: '**/*.pw.ts', workers: 1,
  outputDir: '/var/tmp/s1716-preview-browser-results',
  use: {browserName: 'chromium', headless: true, launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {}, baseURL: 'http://127.0.0.1:4178', trace: 'off', screenshot: 'off'},
  webServer: {command: 'rtk proxy node tests/preview-browser/server.mjs', url: 'http://127.0.0.1:4178/tests/preview-browser/index.html', reuseExistingServer: false},
});
