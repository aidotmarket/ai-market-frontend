import {test, expect} from '@playwright/test';
import {makePreview} from '../previewFixture';
import type {Descriptor} from '../../lib/listing-preview/types';
import {preview as summaryPreview} from '../summaryFixture';

for (const width of [360, 375, 390]) test(`${width}px native keyboard table and zero ingress`, async ({page}) => {
  const schema: Descriptor[] = [['amount', 'decimal', false, {precision: 38, scale: 12}], ['id', 'signed_integer', false, {}], ['note', 'string', false, {}]];
  const marker = 'ROW_MARKER_' + 'x'.repeat(220), filterMarker = 'FILTER_MARKER';
  const f = await makePreview([{amount: '12.5', id: '123', note: marker}, {amount: '-0.125', id: '2', note: 'oats'}], schema);
  const requests: {url: string; body: string | null}[] = [], logs: string[] = [], errors: string[] = [];
  page.on('request', r => {if (r.url().startsWith('https://api.preview.test')) requests.push({url: r.url(), body: r.postData()});});
  page.on('console', m => logs.push(m.text())); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({width, height: 844});
  await page.addInitScript(now => {const realNow = Date.now, offset = now - realNow(); Date.now = () => realNow() + offset;}, f.now);
  await page.route('https://api.preview.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/signed-payload')) {await route.fulfill({status: 404}); return;}
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

test('seller preview and buyer output render the same verified sample in Chrome', async ({page}) => {
  const schema: Descriptor[] = [['amount', 'decimal', false, {precision: 12, scale: 2}], ['id', 'signed_integer', false, {}]];
  const f = await makePreview([{amount: '12.50', id: '7'}], schema);
  const cors = {'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': 'http://127.0.0.1:4178', 'access-control-allow-credentials': 'true'};
  await page.addInitScript(now => {const realNow = Date.now, offset = now - realNow(); Date.now = () => realNow() + offset;}, f.now);
  await page.route('https://api.preview.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/signed-payload')) {await route.fulfill({status: 404, headers: cors}); return;}
    if (path.endsWith('/at-a-glance/preview')) {
      await route.fulfill({status: 200, headers: cors, body: JSON.stringify({...summaryPreview, state: 'approved', status: 'approved'})}); return;
    }
    if (path.endsWith('/enrichment')) {
      await route.fulfill({status: 200, headers: cors, body: JSON.stringify({
        profile: 'aim-listing-enrichment-profile-v2', source_revision: summaryPreview.source_revision,
        summary_id: summaryPreview.summary_id, state: 'approved', values: {}, schema_info: null,
        aggregate_statistics: null, drafts: [],
      })}); return;
    }
    const body = path.endsWith('/keys')
      ? {profile: 'aim-preview-platform-keys-v1', keys: Object.entries(f.keys).map(([key_id, public_key]) => ({key_id, public_key, algorithm: 'ed25519'}))}
      : f.manifest;
    await route.fulfill({status: 200, headers: cors, body: JSON.stringify(body)});
  });
  await page.route(f.manifest.package.url, async route => {
    await route.fulfill({status: 200, headers: {'content-type': 'application/vnd.aim.preview+json', 'cache-control': 'no-store', 'access-control-allow-origin': '*'}, body: Buffer.from(f.raw)});
  });

  await page.goto('/tests/preview-browser/index.html?parity=1');
  const seller = page.getByRole('region', {name: 'Seller preview'});
  const buyer = page.getByRole('region', {name: 'Buyer output'});
  await expect(seller.getByText('Approved. This summary is shown to buyers.')).toBeVisible();
  const sellerChrome = seller.getByRole('complementary', {name: 'Seller-only preview information'});
  await expect(sellerChrome.getByText('amount', {exact: true})).toBeVisible();
  await expect(sellerChrome.getByText('id', {exact: true})).toBeVisible();

  await seller.getByRole('button', {name: 'View sample'}).click();
  await buyer.getByRole('button', {name: 'View sample'}).click();
  const sellerSample = seller.locator('[data-listing-sample]');
  const buyerSample = buyer.locator('[data-listing-sample]');
  await expect(sellerSample.getByRole('table', {name: 'Seller-selected sample'})).toBeVisible();
  await expect(buyerSample.getByRole('table', {name: 'Seller-selected sample'})).toBeVisible();
  await expect(sellerSample.getByText('This sample row matches the dataset commitment recorded by the seller.', {exact: true}).first()).toBeVisible();
  await expect(sellerSample.getByText('This proof does not establish quality, representativeness, legality, compliance, seller identity, or completeness against an external source.', {exact: true})).toBeVisible();
  expect(await sellerSample.innerText()).toBe(await buyerSample.innerText());
});
