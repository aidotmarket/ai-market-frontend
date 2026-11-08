import {test, expect} from '@playwright/test';

test('buyer description inserts validated backend formatting', async ({page}) => {
  await page.goto('/tests/preview-browser/index.html?description=valid');
  await expect(page.getByRole('heading', {name: 'Backend description'})).toBeVisible();
  await expect(page.locator('strong')).toHaveText('formatting');
  await expect(page.locator('ol')).toHaveAttribute('start', '2');
  await expect(page.locator('[dir="auto"]')).toContainText('Safe formatting & entities');
});

for (const mode of ['missing', 'invalid']) test(`buyer description uses escaped pre-wrap text for ${mode} HTML`, async ({page}) => {
  await page.goto(`/tests/preview-browser/index.html?description=${mode}`);
  const description = page.locator('[dir="auto"]');
  await expect(description).toHaveText('🫨*! sales@acme*.io\n<script>literal</script> **literal**');
  await expect(description).toHaveCSS('white-space', 'pre-wrap');
  await expect(description.locator('script, img, strong')).toHaveCount(0);
});
