import { expect, test, type BrowserContext } from '@playwright/test';

const id = 'a'.repeat(43);
const path = `/oauth/connect?request=${id}`;
const user = { id: 'test-user', email: 'user@example.com', first_name: 'Test', last_name: 'User', role: 'buyer', is_email_verified: true };

async function mockBackend(context: BrowserContext, expired = false) {
  await context.route('**/api/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:4187', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) });
    if (pathname === '/api/v1/connector-oauth/status') return json({ enabled: true });
    if (pathname === `/api/v1/connector-oauth/requests/${id}`) return expired
      ? json({ code: 'request_expired' }, 410)
      : json({ request: id, client: { client_id: 'client', name: 'Claude', host: 'claude.ai', verified: true },
        accounts: [{ organization_id: null, label: 'Personal', kind: 'personal' }],
        scopes: [{ scope: 'marketplace.search', description: 'Search the marketplace' }],
        expires_at: new Date(Date.now() + 600_000).toISOString(), csrf_nonce: 'nonce' });
    if (pathname === '/api/v1/auth/refresh') return json({ detail: 'no session' }, 401);
    if (pathname === '/api/v1/auth/login' && method === 'POST') return json({ access_token: 'test-token', token_type: 'bearer' });
    if (pathname === '/api/v1/auth/register' && method === 'POST') return json(user);
    if (pathname === '/api/v1/auth/verify-email' && method === 'POST') return json({ message: 'Your email is verified.' });
    if (pathname === '/api/v1/auth/me') return json(user);
    return json({ detail: 'unexpected route' }, 404);
  });
}

test('same-device continuation resumes after password login', async ({ page, context }) => {
  await mockBackend(context);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/oauth/connect\\?request=${id}`));
  await expect(page.getByRole('heading', { name: 'Connect Claude to ai.market' })).toBeVisible();
});

test('same-device continuation survives register and email verify', async ({ page, context }) => {
  await mockBackend(context);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Account created. We sent a verification link/)).toBeVisible();
  await page.goto('/auth/verify-email?token=mail-token');
  await expect(page.getByText("You're verified")).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect Claude to ai.market' })).toBeVisible();
});

test('verification in another browser asks for a fresh connection', async ({ browser }) => {
  const context = await browser.newContext();
  await mockBackend(context);
  const page = await context.newPage();
  await page.goto('/auth/verify-email?token=mail-token');
  await expect(page.getByText('Return to the app you were connecting and start again.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  await context.close();
});

test('replayed or expired request has no decision controls', async ({ page, context }) => {
  await mockBackend(context, true);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('This connection request expired. Go back to the app and connect again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});
