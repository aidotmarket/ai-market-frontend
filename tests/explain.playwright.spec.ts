import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import type { ExplainRequest } from '@/api/explain';
import { answerFixture, bearer, questions } from './explain-fixtures';
import { sessionCsrf } from '@/lib/session-csrf';

const port = Number(process.env.KD_BRIDGE_PORT_BASE);
const origin = `http://127.0.0.1:${port}`;
const fixtureRoute = '/dashboard/seller-workspace';
let script: string;
let css: string;

test.beforeAll(async () => {
  if (!Number.isInteger(port) || port <= 0 || Number(process.env.KD_BRIDGE_PORT_COUNT) < 1) {
    throw new Error('Set the allocated fixture port range');
  }
  const result = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { createRoot } from 'react-dom/client';
      import { AllAIProvider } from './components/allai/AllAIContext';
      import AllAIPanel from './components/allai/AllAIPanel';
      import { ExplainEntry, useExplainPage } from './components/allai/ExplainContext';
      import { useAuthStore } from './store/auth';
      import { bearer, explainUser, questions } from './tests/explain-fixtures';
      useAuthStore.setState({ token: bearer(), user: explainUser, isAuthenticated: true });
      function Page() {
        useExplainPage({ route: '/dashboard/seller-workspace', scope: 'data', targets: { where_am_i: questions.where_am_i },
          actions: ['save_files'] });
        return <main><ExplainEntry question="where_am_i" />
          <button data-explain-control="save_files" onClick={() => { document.title = 'Unexpected save'; }}>
            Save selected files
          </button>
        </main>;
      }
      createRoot(document.getElementById('app')).render(<AllAIProvider><Page /><AllAIPanel /></AllAIProvider>);
    `, loader: 'tsx' },
    bundle: true, platform: 'browser', write: false, jsx: 'automatic',
    define: { 'process.env': JSON.stringify({
      NODE_ENV: 'production',
      NEXT_PUBLIC_STAGE_A_EXPLAIN_ENABLED: 'true',
      NEXT_PUBLIC_API_URL: origin,
    }) },
    plugins: [{
      name: 'fixture-navigation',
      setup(plugin) {
        plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
          export const usePathname = () => window.location.pathname;
          export const useSearchParams = () => new URLSearchParams(window.location.search);
          export const useRouter = () => ({ push: path => window.history.pushState(null, '', path) });
        ` }));
      },
    }],
  });
  script = result.outputFiles[0].text;
  const sheet = resolve('app/globals.css');
  css = (await postcss([tailwind()]).process(await readFile(sheet, 'utf8'), { from: sheet })).css;
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === fixtureRoute) return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Explain fixture</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="app"></div><script src="/fixture.js"></script>',
    });
    if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: script });
    const headers = request.headers();
    if (headers.authorization !== `Bearer ${bearer()}` || headers['x-csrf-token'] !== sessionCsrf(bearer())) return route.abort();
    if (url.pathname === '/api/v1/allai/explain/history') {
      return route.fulfill({ json: { conversation_id: null, expires_at: null, before: null, turns: [] } });
    }
    if (url.pathname === '/api/v1/allai/explain') {
      const body = request.postDataJSON() as ExplainRequest;
      expect(body).toEqual({ intent: 'explain', locale: 'en', question: 'where_am_i', target: questions.where_am_i });
      return route.fulfill({ json: answerFixture(body) });
    }
    return route.abort();
  });
});

test('keyboard opens Explain, traps focus and returns it on Escape', async ({ page }) => {
  await page.goto(origin + fixtureRoute);
  const entry = page.getByRole('button', { name: 'Where am I?' });
  await entry.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog');
  const textbox = panel.getByRole('textbox', { name: 'Ask about this page' });
  await expect(textbox).toBeFocused();
  await expect(panel.getByText(/Your last saved step was Review/)).toBeVisible();
  const first = panel.getByRole('button', { name: 'Close allAI · AI assistant' });
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(textbox).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(entry).toBeFocused();
  await expect(panel).toHaveCount(0);
});

test('mobile fills the viewport and focuses the existing save button without using it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(origin + fixtureRoute);
  await page.getByRole('button', { name: 'Where am I?' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await expect(panel.getByText(/Your file and licence changes are unsaved/)).toBeVisible();
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 700 });
  expect(await panel.evaluate(node => node.scrollWidth)).toBe(390);
  await panel.getByRole('button', { name: 'Go to Save selected files' }).click();
  await expect(page.getByRole('button', { name: 'Save selected files' })).toBeFocused();
  await expect(page).toHaveTitle('Explain fixture');
});
