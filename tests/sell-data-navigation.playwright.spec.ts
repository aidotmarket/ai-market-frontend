import { expect, test } from '@playwright/test';

test('signed-out desktop visitors can open Pricing from Sell Data after scrolling', async ({ page }) => {
  await page.goto('/sell-data');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();

  await page.getByRole('heading', { name: 'Three reasons to list.' }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await header.getByRole('navigation').getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  console.log(`Pricing click landed on ${new URL(page.url()).pathname}`);
});

test('the assistant cannot cover Pricing on Sell Data', async ({ page }) => {
  await page.goto('/sell-data');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Three reasons to list.' }).scrollIntoViewIfNeeded();

  const pricing = header.getByRole('navigation').getByRole('link', { name: 'Pricing', exact: true });
  await page.getByRole('button', { name: 'Open allAI assistant' }).click();
  const assistant = page.getByRole('dialog', { name: 'allAI' });
  await expect(assistant).toBeVisible();
  const title = await assistant.getByRole('heading', { name: 'allAI', exact: true }).boundingBox();
  const link = await pricing.boundingBox();
  if (!title || !link) throw new Error('The assistant title and Pricing link must be visible');

  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(link.x + link.width / 2, link.y + link.height / 2, { steps: 10 });
  await page.mouse.up();

  await pricing.click({ timeout: 8_000 });
  await expect(page).toHaveURL(/\/pricing$/);
  console.log(`Pricing click with the assistant open landed on ${new URL(page.url()).pathname}`);
});
