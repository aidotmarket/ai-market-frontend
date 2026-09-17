import {test, expect} from '@playwright/test';
import {makePreview} from '../previewFixture';
import type {Descriptor} from '../../lib/listing-preview/types';

for (const width of [360, 375, 390]) test(`${width}px native keyboard table and zero ingress`, async ({page}) => {
  const schema: Descriptor[] = [['amount', 'decimal', false, {precision: 38, scale: 12}], ['id', 'signed_integer', false, {}], ['note', 'string', false, {}]];
  const marker = 'ROW_MARKER_' + 'x'.repeat(220), filterMarker = 'FILTER_MARKER';
  const f = await makePreview([{amount: '12345678901234567890.123456789012', id: '9007199254740993', note: marker}, {amount: '-0.123456789012', id: '2', note: 'oats'}], schema);
  const requests: {url: string; body: string | null}[] = [], logs: string[] = [], errors: string[] = [];
  page.on('request', r => {if (r.url().startsWith('https://api.preview.test')) requests.push({url: r.url(), body: r.postData()});});
  page.on('console', m => logs.push(m.text())); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({width, height: 844});
  await page.addInitScript(now => {const realNow = Date.now, offset = now - realNow(); Date.now = () => realNow() + offset;}, f.now);
  await page.route('https://api.preview.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/keys') ? {profile: 'aim-preview-platform-keys-v1', keys: Object.entries(f.keys).map(([key_id, public_key]) => ({key_id, public_key, algorithm: 'ed25519'}))} : f.manifest;
    await route.fulfill({status: 200, headers: {'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*'}, body: JSON.stringify(body)});
  });
  let sellerReads = 0;
  await page.route(f.manifest.package.url, async route => {sellerReads++; await route.fulfill({status: 200, headers: {'content-type': 'application/vnd.aim.preview+json', 'cache-control': 'no-store', 'access-control-allow-origin': '*'}, body: Buffer.from(f.raw)});});
  const modules: string[] = []; page.on('request', r => {if (r.url().includes('SampleTable') || r.url().includes('verifier.ts')) modules.push(r.url());});
  await page.goto('/tests/preview-browser/index.html');
  const view = page.getByRole('button', {name: 'View sample'}); await expect(view).toBeVisible(); expect(sellerReads).toBe(0); expect(modules).toEqual([]);
  await view.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toBeVisible();
  expect(sellerReads).toBe(1); expect(requests.filter(r => r.url.endsWith('/preview-manifest'))).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const search = page.getByLabel('Search sample', {exact: true}); await search.focus(); await page.keyboard.press('Tab'); await expect(page.getByLabel('Search column', {exact: true})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', {name: 'Clear filter'})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('region', {name: 'Seller-selected sample table'})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', {name: 'Sort amount: ascending'})).toBeFocused();
  await page.keyboard.press('Space'); await expect(page.getByRole('columnheader').first()).toHaveAttribute('aria-sort', 'ascending');
  const expand = page.getByRole('button', {name: 'Expand note'}); await expand.focus(); await page.keyboard.press('Space'); await expect(page.getByText(marker, {exact: true})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(expand).toBeFocused(); await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await search.fill(filterMarker); await expect(page.getByRole('status')).toHaveText('Showing 0 of 2 seller-selected sample rows.');
  const storage = await page.evaluate(async () => ({local: {...localStorage}, session: {...sessionStorage}, databases: await indexedDB.databases(), caches: await caches.keys()}));
  expect(JSON.stringify(requests)).not.toContain('ROW_MARKER'); expect(JSON.stringify(requests)).not.toContain(filterMarker);
  expect(JSON.stringify(storage)).not.toContain('ROW_MARKER'); expect(JSON.stringify(storage)).not.toContain(filterMarker);
  expect(logs.join('\n')).not.toContain('ROW_MARKER'); expect(logs.join('\n')).not.toContain(filterMarker); expect(errors).toEqual([]);
});
