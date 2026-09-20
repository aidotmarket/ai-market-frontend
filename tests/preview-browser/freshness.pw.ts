import {expect, test, type Page} from '@playwright/test';
import {makeFreshnessTransitionPreview} from '../previewFixture';

type TransitionFixture = Awaited<ReturnType<typeof makeFreshnessTransitionPreview>>['stale'];

async function openFixture(page: Page, served: TransitionFixture) {
  const cors = {'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*'};
  await page.addInitScript(now => {const realNow = Date.now, offset = now - realNow(); Date.now = () => realNow() + offset;}, served.now);
  await page.route('https://api.preview.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/signed-payload')) {
      await route.fulfill({status: 404, headers: cors});
      return;
    }
    const body = path.endsWith('/keys')
      ? {profile: 'aim-preview-platform-keys-v1', keys: Object.entries(served.keys).map(([key_id, public_key]) => ({key_id, public_key, algorithm: 'ed25519'}))}
      : served.manifest;
    await route.fulfill({status: 200, headers: cors, body: JSON.stringify(body)});
  });
  await page.route(served.manifest.package.url, async route => {
    await route.fulfill({
      status: 200,
      headers: {'content-type': 'application/vnd.aim.preview+json', 'cache-control': 'no-store', 'access-control-allow-origin': '*'},
      body: Buffer.from(served.raw),
    });
  });
  await page.goto('/tests/preview-browser/index.html');
  await page.getByRole('button', {name: 'View sample'}).click();
}

test('renders a stale preview at the freshness threshold', async ({page}) => {
  const {stale} = await makeFreshnessTransitionPreview();

  await openFixture(page, stale);
  await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toBeVisible();
  await expect(page.getByText('This sample row matches the dataset commitment recorded by the seller.', {exact: true}).first()).toBeVisible();
  await expect(page.getByText(`Last attested by seller: ${stale.manifest.last_attested_by_seller_at}`, {exact: false})).toBeVisible();
  await expect(page.getByText('Stale', {exact: true})).toBeVisible();
  expect(stale.manifest.commitment.leaf_count).toBeGreaterThan(stale.manifest.proofs.length);
  await expect(page.getByRole('row')).toHaveCount(stale.manifest.proofs.length + 1);
});

test('renders a current preview after unchanged-root re-attestation', async ({page}) => {
  const {stale, reattested} = await makeFreshnessTransitionPreview();

  expect(reattested.manifest.commitment.dataset_merkle_root)
    .toBe(stale.manifest.commitment.dataset_merkle_root);
  expect(reattested.manifest.commitment.leaf_count)
    .toBe(stale.manifest.commitment.leaf_count);
  expect(reattested.manifest.proofs).toEqual(stale.manifest.proofs);
  expect(Date.parse(reattested.manifest.last_attested_by_seller_at))
    .toBeGreaterThan(Date.parse(stale.manifest.last_attested_by_seller_at));
  expect(Date.parse(reattested.manifest.generated_at)).toBeGreaterThan(Date.parse(stale.manifest.generated_at));
  expect(Date.parse(reattested.manifest.valid_until)).toBeGreaterThan(Date.parse(stale.manifest.valid_until));
  expect(reattested.manifest.generated_at).toBe(reattested.manifest.last_attested_by_seller_at);
  expect(Date.parse(reattested.manifest.valid_until) - Date.parse(reattested.manifest.generated_at)).toBe(30_000);

  await openFixture(page, reattested);
  await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toBeVisible();
  await expect(page.getByText(`Last attested by seller: ${reattested.manifest.last_attested_by_seller_at}`, {exact: true})).toBeVisible();
  await expect(page.getByText('Stale', {exact: true})).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(reattested.manifest.proofs.length + 1);
});

test('fails closed when the manifest claims to be current past its own freshness deadline', async ({page}) => {
  const {stale, claimsCurrentPastFreshnessDeadline} = await makeFreshnessTransitionPreview();

  expect(claimsCurrentPastFreshnessDeadline.manifest).toEqual({...stale.manifest, stale: false});
  expect(claimsCurrentPastFreshnessDeadline.now)
    .toBeGreaterThan(Date.parse(claimsCurrentPastFreshnessDeadline.manifest.freshness_stale_at));
  await openFixture(page, claimsCurrentPastFreshnessDeadline);
  await expect(page.getByRole('status')).toHaveText('Sample unavailable');
  await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(0);
  await expect(page.getByText('Stale', {exact: true})).toHaveCount(0);
});

test('fails closed when regenerated timestamps leave no validity window', async ({page}) => {
  const {regeneratedWithoutValidityWindow} = await makeFreshnessTransitionPreview();

  expect(regeneratedWithoutValidityWindow.manifest.valid_until)
    .toBe(regeneratedWithoutValidityWindow.manifest.generated_at);
  await openFixture(page, regeneratedWithoutValidityWindow);
  await expect(page.getByRole('status')).toHaveText('Sample unavailable');
  await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(0);
  await expect(page.getByText('Stale', {exact: true})).toHaveCount(0);
});
