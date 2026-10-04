import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'render.pw.ts',workers:1,timeout:45000,
 outputDir:'../../docs/reports/t932/browser-results',reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:4189',browserName:'chromium',headless:true,trace:'off'},
 webServer:{cwd:fileURLToPath(new URL('../../',import.meta.url)),command:`rtk proxy env API_URL=http://127.0.0.1:4201 rtk proxy ${process.execPath} node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4189`,
 url:'http://127.0.0.1:4189',reuseExistingServer:false},
});
