import { expect, test, type BrowserContext } from '@playwright/test';
import { consentMetadata, sellerPermissions } from './fixtures/connector-consent';

const id = 'a'.repeat(43);
const path = `/oauth/connect?request=${id}`;
const user = { id: 'test-user', email: 'user@example.com', first_name: 'Test', last_name: 'User', role: 'buyer', is_email_verified: true };

async function mockBackend(context: BrowserContext, expired = false, firstDecisionFailure?: string) {
  const calls = { decisions: [] as Record<string, unknown>[], metadataGets: 0 };
  await context.route('https://auth.ai.market/**', route => route.fulfill({ body: 'Connection complete' }));
  await context.route('**/api/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:4187', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) });
    if (pathname === '/api/v1/connector-oauth/status') return json({ enabled: true });
    if (pathname === `/api/v1/connector-oauth/requests/${id}`) {
      calls.metadataGets += 1;
      return expired ? json({ code: 'request_expired' }, 410)
        : json({ ...consentMetadata(), csrf_nonce: `nonce-${calls.metadataGets}` });
    }
    if (pathname === `/api/v1/connector-oauth/requests/${id}/decision` && method === 'POST') {
      calls.decisions.push(route.request().postDataJSON());
      if (firstDecisionFailure && calls.decisions.length === 1) return json({ code: firstDecisionFailure }, 403);
      return json({ continue_url: `https://auth.ai.market/oauth/authorize/complete?request=${id}` });
    }
    if (pathname === '/api/v1/auth/refresh') return json({ detail: 'no session' }, 401);
    if (pathname === '/api/v1/auth/login' && method === 'POST') return json({ access_token: 'test-token', token_type: 'bearer' });
    if (pathname === '/api/v1/auth/oauth/google/callback' && method === 'POST') return json({ access_token: 'test-token', token_type: 'bearer' });
    if (pathname === '/api/v1/auth/register' && method === 'POST') return json(user);
    if (pathname === '/api/v1/auth/verify-email' && method === 'POST') return json({ message: 'Your email is verified.' });
    if (pathname === '/api/v1/auth/me') return json(user);
    return json({ detail: 'unexpected route' }, 404);
  });
  return calls;
}

test('same-device continuation resumes after password login', async ({ page, context }) => {
  await mockBackend(context);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByRole('main').last().getByLabel('Email', { exact: true }).fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/oauth/connect\\?request=${id}`));
  await expect(page.getByRole('heading', { name: 'Connect Claude to ai.market' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Buyer' })).toBeChecked();
  await expect(page.getByRole('main').last().getByRole('listitem')).toHaveCount(3);
});

test('consent resumes after a social callback without a redirect parameter', async ({ page, context }) => {
  await mockBackend(context);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('connector_authorization_request') || 'null')?.initiated)).toBe(true);
  await page.evaluate(() => sessionStorage.setItem('oauth_nonce', 'nonce'));
  await page.goto('/auth/oauth/google/callback?code=code&state=state');
  await expect(page).toHaveURL(new RegExp(`/oauth/connect\\?request=${id}`));
  await expect(page.getByRole('heading', { name: 'Connect Claude to ai.market' })).toBeVisible();
});

test('same-device continuation survives register and email verify', async ({ page, context }) => {
  await mockBackend(context);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  const signUp = page.getByRole('main').last().getByRole('link', { name: 'Sign up' });
  await expect(signUp).toHaveAttribute('href', /\/register\?redirect=/);
  await signUp.click();
  await expect(page).toHaveURL(/\/register\?redirect=/);
  await page.waitForLoadState('networkidle');
  await page.getByRole('main').last().getByLabel('Email', { exact: true }).fill('user@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Account created. We sent a verification link/)).toBeVisible();
  const verificationPage = await context.newPage();
  await verificationPage.goto('/auth/verify-email?token=mail-token');
  await expect(verificationPage.getByText("You're verified")).toBeVisible();
  await verificationPage.getByRole('main').last().getByRole('link', { name: 'Sign in' }).click();
  await verificationPage.getByRole('main').last().getByLabel('Email', { exact: true }).fill('user@example.com');
  await verificationPage.getByLabel('Password').fill('password123');
  await verificationPage.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(verificationPage).toHaveURL(new RegExp(`/oauth/connect\\?request=${id}`));
  await expect(verificationPage.getByRole('heading', { name: 'Connect Claude to ai.market' })).toBeVisible();
});

test('continuation older than 30 minutes does not resume in a new tab', async ({ page, context }) => {
  await mockBackend(context);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.evaluate(() => {
    localStorage.setItem('connector_authorization_request', JSON.stringify({
      request: 'a'.repeat(43), deadline: Date.now() - 1,
    }));
  });
  const verificationPage = await context.newPage();
  await verificationPage.goto('/auth/verify-email?token=mail-token');
  await expect(verificationPage.getByText('Return to the app you were connecting and start again.')).toBeVisible();
  await expect(verificationPage.getByRole('main').last().getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(await verificationPage.evaluate(() => localStorage.getItem('connector_authorization_request'))).toBeNull();
});

test('verification in another browser asks for a fresh connection', async ({ browser }) => {
  const context = await browser.newContext();
  await mockBackend(context);
  const page = await context.newPage();
  await page.goto('/auth/verify-email?token=mail-token');
  await expect(page.getByText('Return to the app you were connecting and start again.')).toBeVisible();
  await expect(page.getByRole('main').last().getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  await context.close();
});

test('replayed or expired request has no decision controls', async ({ page, context }) => {
  await mockBackend(context, true);
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByRole('main').last().getByLabel('Email', { exact: true }).fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('This connection request expired. Go back to the app and connect again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('Seller approval shows all permissions and freezes account and persona selection during submission', async ({ page, context }) => {
  await mockBackend(context);
  let release!: () => void;
  let submitted: Record<string, unknown> | undefined;
  await context.route(`**/api/v1/connector-oauth/requests/${id}/decision`, async route => {
    submitted = route.request().postDataJSON();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'seller_consent_required' }) });
  });
  await page.goto(path);
  await page.getByRole('main').last().getByLabel('Email', { exact: true }).fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('radio', { name: 'Seller' }).check();
  await expect(page.getByRole('main').last().getByRole('listitem')).toHaveCount(8);
  for (const permission of sellerPermissions) await expect(page.getByText(permission.description, { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Connect account' }).selectOption('org-1');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => submitted).toEqual({
    decision: 'approve', organization_id: 'org-1', csrf_nonce: 'nonce-1', tool_set: 'seller', seller_permissions_version: 1,
  });
  await expect(page.getByRole('radio', { name: 'Buyer' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Seller' })).toBeDisabled();
  await expect(page.getByRole('combobox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deny' })).toBeDisabled();
  release();
  await expect(page.getByRole('main').last().getByRole('alert')).toHaveText('Unable to complete this connection request.');
});

for (const failure of ['seller_permissions_stale', 'recent_login_required']) {
  test(`consent reloads after ${failure} and requires explicit Seller selection and approval again`, async ({ page, context }) => {
    const calls = await mockBackend(context, false, failure);
    await page.goto(path);
    await page.getByRole('main').last().getByLabel('Email', { exact: true }).fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('radio', { name: 'Seller' }).check();
    await page.getByRole('button', { name: 'Approve' }).click();
    if (failure === 'recent_login_required') {
      await page.getByRole('button', { name: 'Sign in to continue' }).click();
      await expect(page).toHaveURL(/\/login\?reauth=connector/);
      await page.getByRole('main').last().getByLabel('Email', { exact: true }).fill('user@example.com');
      await page.getByLabel('Password').fill('password123');
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
    } else {
      await expect(page.getByRole('main').last().getByRole('status')).toHaveText('Connection permissions changed. Review them and approve again.');
    }
    await expect(page.getByRole('radio', { name: 'Buyer' })).toBeChecked();
    expect(calls.metadataGets).toBe(2);
    expect(calls.decisions).toHaveLength(1);
    await page.getByRole('radio', { name: 'Seller' }).check();
    await expect(page.getByRole('main').last().getByRole('listitem')).toHaveCount(8);
    expect(calls.decisions).toHaveLength(1);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect.poll(() => calls.decisions.length).toBe(2);
    expect(calls.decisions[1]).toMatchObject({ tool_set: 'seller', seller_permissions_version: 1, csrf_nonce: 'nonce-2' });
  });
}
