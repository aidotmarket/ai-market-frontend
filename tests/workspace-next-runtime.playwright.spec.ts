import { expect, test } from '@playwright/test';
import { savedTitle, mockSession, workspaceReads } from './workspaceRuntimeFixture';

const legalRefreshPath = '/api/v1/seller-workspace/legal-identity/refresh';

test('a saved Seller Workspace draft renders across all sections on the production Next runtime', async ({ page, baseURL }, testInfo) => {
  const apiOrigin = String(testInfo.config.metadata.apiOrigin);
  const issues: string[] = [];
  page.on('pageerror', error => issues.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const { url } = message.location();
    // Chromium logs the mocked HTTP refusal. App console errors still fail the test.
    if (url === `${apiOrigin}${legalRefreshPath}` &&
        message.text().startsWith('Failed to load resource: the server responded with a status of 403')) return;
    issues.push(`console.error: ${message.text()} (${url})`);
  });

  let awaitingSession = true;
  await page.route(url => url.origin === apiOrigin, async route => {
    const { pathname, search } = new URL(route.request().url());
    const method = route.request().method();
    const headers = {
      'access-control-allow-origin': new URL(baseURL!).origin,
      'access-control-allow-credentials': 'true',
    };
    // The access token lives in memory. The root provider restores it exactly
    // once via /auth/refresh before it reads /auth/me and admits the dashboard.
    if (awaitingSession && method === 'POST' && pathname === '/api/v1/auth/refresh') {
      awaitingSession = false;
      return route.fulfill({ headers, json: { access_token: mockSession } });
    }
    if (method === 'POST' && pathname === legalRefreshPath) {
      return route.fulfill({ headers, status: 403, json: { detail: 'Forbidden' } });
    }
    if (method === 'GET' && workspaceReads.has(pathname)) {
      return route.fulfill({ headers, json: workspaceReads.get(pathname) });
    }
    const detail = `Unexpected Workspace API request: ${method} ${pathname}${search}`;
    issues.push(detail);
    return route.fulfill({ headers, status: 404, json: { detail } });
  });

  const main = page.getByRole('main');
  const sections = main.getByRole('navigation', { name: 'Workspace sections' });
  const crashText = page.getByText(/something went wrong|could not be loaded|application error: a client-side exception|reload the page to continue from your last saved changes/i);
  const views = [
    ['Connect your storage', 'Connect your storage'],
    ['Choose your files', 'Choose your files'],
    ['Choose a licence', 'Choose a licence'],
    ['Describe and price', 'Describe and price'],
    ['Review', 'Review your saved listing'],
    ['Publish', 'Publish your listing'],
    ['Your listings', 'Your Workspace listings'],
  ];

  try {
    await page.goto('/dashboard/seller-workspace');
    await expect(main.getByRole('heading', { name: 'Seller Workspace', exact: true })).toBeVisible();
    await expect(sections.getByRole('button')).toHaveText(views.map(([button]) => button));

    for (const [button, heading] of views) {
      await test.step(button, async () => {
        await sections.getByRole('button', { name: button, exact: true }).click();
        await expect(main.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        if (button === 'Choose your files') await expect(main.getByRole('checkbox', { name: 'Select weekly/sales.csv' })).toBeChecked();
        if (button === 'Choose a licence') {
          await expect(main.getByText('Legal name on the licence: Synthetic Seller (ES)')).toBeVisible();
        }
        if (button === 'Describe and price') {
          await expect(main.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(savedTitle);
          await expect(main.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
        }
        if (button === 'Review') await expect(main.getByRole('heading', { name: savedTitle, exact: true })).toBeVisible();
        if (button === 'Publish') await expect(main.getByRole('button', { name: 'Publish this listing' })).toBeEnabled();
        if (button === 'Your listings') await expect(main.getByText(/No Workspace listings on this page/)).toBeVisible();
        await expect(crashText).toHaveCount(0);
      });
    }
  } finally {
    await expect.soft(crashText, 'Workspace crash or error fallback').toHaveCount(0, { timeout: 500 });
    expect.soft(issues, 'Browser errors and unexpected API traffic').toEqual([]);
  }
});
