import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Run with `node scripts/og/render-home.mjs` after `npx playwright install chromium`.
const font = await readFile(new URL('../../app/fonts/PlusJakartaSans[wght].woff2', import.meta.url), 'base64');
const output = fileURLToPath(new URL('../../public/og/home.png', import.meta.url));
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`
    <!doctype html>
    <html lang="en">
    <meta charset="utf-8">
    <style>
      @font-face {
        font-family: 'Plus Jakarta Sans';
        src: url(data:font/woff2;base64,${font}) format('woff2');
        font-weight: 200 800;
      }
      body {
        margin: 0;
        background: #fff;
        color: #1a1a1a;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      h1, p { margin: 0; }
      main { position: absolute; top: 184px; left: 106px; }
      h1 { font-size: 112px; font-weight: 800; line-height: 1.1; letter-spacing: -0.025em; }
      h1 span { color: #3f51b5; }
      main p { margin-top: 24px; color: #4a4a4a; font-size: 42px; line-height: 1.3; }
      footer { position: absolute; left: 112px; bottom: 84px; color: #0f6e56; font-size: 32px; font-weight: 800; }
    </style>
    <main>
      <h1>SEO <span>for data.</span></h1>
      <p>Where AI search finds data.</p>
    </main>
    <footer>ai.market</footer>
  `);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output });
} finally {
  await browser.close();
}
