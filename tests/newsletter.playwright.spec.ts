import { expect, test } from '@playwright/test';

// Run against a local frontend only. All backend traffic is intercepted.
test.use({ baseURL: 'http://127.0.0.1:3176' });

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`newsletter keyboard submission and retry at ${viewport.width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    const payloads: unknown[] = [];
    let release!: () => void;
    const heldResponse = new Promise<void>((resolve) => { release = resolve; });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:3176') return route.continue();
      if (url.origin !== 'http://localhost:8000') return route.abort();
      const headers = {
        'access-control-allow-origin': 'http://127.0.0.1:3176',
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname !== '/api/v1/newsletter-subscribe') {
        return route.fulfill({ status: 401, headers, json: { detail: 'No session' } });
      }
      expect(route.request().method()).toBe('POST');
      payloads.push(route.request().postDataJSON());
      if (payloads.length === 1) {
        await heldResponse;
        return route.fulfill({ status: 503, headers, json: { detail: 'Persistence unavailable' } });
      }
      return route.fulfill({ status: 200, headers, json: { success: true, message: 'Preference saved' } });
    });

    await page.goto('/legal/privacy');
    const form = page.getByRole('form', { name: 'Newsletter subscription' });
    const input = form.getByRole('textbox', { name: 'Newsletter email' });
    await input.fill('invalid');
    await input.press('Enter');
    await expect(form.getByRole('alert')).toContainText('Enter a valid email address');
    await expect(input).toBeFocused();
    expect(payloads).toHaveLength(0);

    await input.fill('keyboard@example.com');
    await input.press('Enter');
    await expect(form.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    await expect(input).toHaveAttribute('readonly');
    await input.press('Enter');
    await expect.poll(() => payloads.length).toBe(1);
    expect(payloads[0]).toEqual({ email: 'keyboard@example.com' });
    release();
    await expect(form.getByRole('alert')).toContainText('Please try again');
    await expect(input).toHaveValue('keyboard@example.com');

    await input.focus();
    await page.keyboard.press('Tab');
    const subscribe = form.getByRole('button', { name: 'Subscribe', exact: true });
    await expect(subscribe).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(form.getByRole('status')).toHaveText('Your newsletter preference has been saved.');
    await expect(subscribe).toBeDisabled();
    expect(payloads).toEqual([{ email: 'keyboard@example.com' }, { email: 'keyboard@example.com' }]);
    await expect(page).toHaveURL('http://127.0.0.1:3176/legal/privacy');
    await expect(form.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute('href', '/legal/privacy');
    await expect(form).toBeInViewport();
    const box = await form.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`newsletter-${viewport.width}.png`), fullPage: true });
  });
}
