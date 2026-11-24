import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL });

for (const width of [640, 1024]) {
  test(`support instructions reflow beside allAI at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.goto('/support');

    const instructions = page.getByRole('list').filter({ hasText: 'Click the chat icon' });
    const dialog = page.getByRole('dialog');
    const closedInstructions = (await instructions.boundingBox())!;
    await page.getByTestId('allai-launcher').click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'false');
    await expect.poll(async () => {
      const content = (await instructions.boundingBox())!;
      const panel = (await dialog.boundingBox())!;
      return panel.x - (content.x + content.width);
    }).toBeGreaterThan(0);
    expect((await instructions.boundingBox())!.width).toBeLessThan(closedInstructions.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);

    await dialog.getByRole('button', { name: 'Close allAI · AI assistant' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => instructions.boundingBox()).toEqual(closedInstructions);
  });
}

test('pricing fee cards reflow beside allAI at 1024px and return to two columns', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/pricing');

  const sellers = page.locator('section').filter({ has: page.getByText('Sellers', { exact: true }) });
  const buyers = page.locator('section').filter({ has: page.getByText('Buyers', { exact: true }) });
  const dialog = page.getByRole('dialog');
  await expect(sellers).toBeVisible();
  await expect(buyers).toBeVisible();

  const closedSellers = (await sellers.boundingBox())!;
  const closedBuyers = (await buyers.boundingBox())!;
  expect(closedSellers.y).toBe(closedBuyers.y);
  expect(closedSellers.x + closedSellers.width).toBeLessThan(closedBuyers.x);

  await page.getByTestId('allai-launcher').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'false');
  await expect.poll(async () => {
    const sellerCard = (await sellers.boundingBox())!;
    const buyerCard = (await buyers.boundingBox())!;
    const panel = (await dialog.boundingBox())!;
    return {
      cardsFit: [sellerCard, buyerCard].every(card => card.x >= 0 && card.x + card.width < panel.x),
      cardsStack: sellerCard.y + sellerCard.height < buyerCard.y,
    };
  }).toEqual({ cardsFit: true, cardsStack: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);

  await dialog.getByRole('button', { name: 'Close allAI · AI assistant' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => Promise.all([sellers.boundingBox(), buyers.boundingBox()])).toEqual([closedSellers, closedBuyers]);
});

test('allAI keeps the full-screen mobile layout on support', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/support');
  const content = page.getByRole('main');
  const closedContent = await content.boundingBox();

  await page.getByTestId('allai-launcher').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  expect(await content.boundingBox()).toEqual(closedContent);
});

test('allAI still floats over other desktop pages', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/legal/privacy');
  const content = page.getByRole('main');
  const closedWidth = (await content.boundingBox())!.width;

  await page.getByTestId('allai-launcher').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'false');
  expect((await dialog.boundingBox())!.width).toBe(480);
  expect((await content.boundingBox())!.width).toBe(closedWidth);
  await expect(content).toHaveCSS('padding-right', '0px');
});
