import {expect, test} from '@playwright/test';
import {makeFreshnessTransitionPreview} from '../previewFixture';

test('stale preview becomes current after unchanged-root re-attestation and fails closed on contradiction', async ({page}) => {
  const fixtures = await makeFreshnessTransitionPreview();
  let served = fixtures.stale;
  const cors = {'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*'};

  expect(fixtures.reattested.manifest.commitment.dataset_merkle_root)
    .toBe(fixtures.stale.manifest.commitment.dataset_merkle_root);
  expect(fixtures.reattested.manifest.commitment.leaf_count)
    .toBe(fixtures.stale.manifest.commitment.leaf_count);
  expect(fixtures.reattested.manifest.proofs).toEqual(fixtures.stale.manifest.proofs);

  await page.addInitScript(now => {
    const realNow = Date.now;
    const offset = now - realNow();
    Date.now = () => realNow() + offset;
  }, fixtures.stale.now);
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
  await page.route(fixtures.stale.manifest.package.url, async route => {
    await route.fulfill({
      status: 200,
      headers: {'content-type': 'application/vnd.aim.preview+json', 'cache-control': 'no-store', 'access-control-allow-origin': '*'},
      body: Buffer.from(served.raw),
    });
  });

  const openSample = async () => {
    await page.goto('/tests/preview-browser/index.html');
    await page.getByRole('button', {name: 'View sample'}).click();
  };

  await openSample();
  await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toBeVisible();
  await expect(page.getByText('This sample row matches the dataset commitment recorded by the seller.', {exact: true}).first()).toBeVisible();
  await expect(page.getByText(`Last attested by seller: ${fixtures.stale.manifest.last_attested_by_seller_at}`, {exact: false})).toBeVisible();
  await expect(page.getByText('Stale', {exact: true})).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(fixtures.stale.manifest.commitment.leaf_count + 1);

  served = fixtures.reattested;
  await openSample();
  await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toBeVisible();
  await expect(page.getByText(`Last attested by seller: ${fixtures.reattested.manifest.last_attested_by_seller_at}`, {exact: true})).toBeVisible();
  await expect(page.getByText('Stale', {exact: true})).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(fixtures.reattested.manifest.commitment.leaf_count + 1);

  served = fixtures.inconsistent;
  await openSample();
  await expect(page.getByRole('status')).toHaveText('Sample unavailable');
  await expect(page.getByRole('table', {name: 'Seller-selected sample'})).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(0);
  await expect(page.getByText('Stale', {exact: true})).toHaveCount(0);
});
