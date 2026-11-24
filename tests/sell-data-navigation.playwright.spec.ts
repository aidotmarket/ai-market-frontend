import { expect, test } from '@playwright/test';

test('signed-out desktop visitors can open Pricing from Sell Data after scrolling', async ({ page }) => {
  await page.goto('/sell-data');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Open allAI assistant' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'allAI' })).toHaveCount(0);
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
  const titleHeading = assistant.getByRole('heading', { name: 'allAI', exact: true });
  await titleHeading.click({ trial: true });
  const title = await titleHeading.boundingBox();
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

test('Sell Data pricing stacks at 1024px with allAI open', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/sell-data');
  await page.getByRole('button', { name: 'Open allAI assistant' }).click();
  const assistant = page.getByRole('dialog', { name: 'allAI' });
  await expect(assistant).toBeVisible();

  const pricing = page.getByRole('region', { name: 'List free. Pay 5% when a sale clears.' });
  const heading = pricing.getByRole('heading', { level: 2, name: 'List free. Pay 5% when a sale clears.' });
  const fees = pricing.getByText(/Sellers list free/);
  const signup = pricing.getByRole('link', { name: 'Create Your Account' });
  const sidebar = pricing.getByRole('complementary', { name: 'Built for AI search' });

  await pricing.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect(fees).toBeInViewport({ ratio: 1 });
  await expect(signup).toBeInViewport({ ratio: 1 });
  await expect(signup).toHaveAttribute('href', '/register');
  await signup.click({ trial: true });

  const headingBox = await heading.boundingBox();
  const signupBox = await signup.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  const assistantBox = await assistant.boundingBox();
  if (!headingBox || !signupBox || !sidebarBox || !assistantBox) {
    throw new Error('Expected pricing, signup, sidebar and assistant to have layout boxes');
  }
  expect(headingBox.width).toBeGreaterThan(300);
  expect(headingBox.x + headingBox.width).toBeLessThan(assistantBox.x);
  expect(sidebarBox.y).toBeGreaterThan(signupBox.y + signupBox.height);
});
