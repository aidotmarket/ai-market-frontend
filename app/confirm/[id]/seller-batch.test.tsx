// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '@/types';
import type { PendingAction, SellerBatchSummary } from '@/api/pending-actions';

const mocks = vi.hoisted(() => ({
  capability: vi.fn(), activity: vi.fn(), retry: vi.fn(), signIn: vi.fn(), checkSignIn: vi.fn(), get: vi.fn(), decide: vi.fn(), push: vi.fn(), replace: vi.fn(), reauth: vi.fn(), provider: vi.fn(),
  id: '11111111-1111-4111-8111-111111111111', query: new URLSearchParams(),
  auth: { hydrated: true, isLoading: false, user: { id: 'owner', totp_enabled: true }, token: 'session' } as { hydrated: boolean; isLoading: boolean; user: Partial<User> | null; token: string | null },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useParams: () => ({ id: mocks.id }), usePathname: () => window.location.pathname, useSearchParams: () => window.location.pathname === '/dashboard/settings' ? new URLSearchParams(window.location.search) : mocks.query }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('@/api/pending-actions', async original => ({ ...await original<typeof import('@/api/pending-actions')>(), getPendingAction: mocks.get, decidePendingAction: mocks.decide, getSellerCapability: mocks.capability, getSellerActivity: mocks.activity, retrySellerFailures: mocks.retry }));
vi.mock('@/api/auth', async original => ({ ...await original<typeof import('@/api/auth')>(), submitReauth: mocks.reauth }));
vi.mock('@/components/OAuthButtons', () => ({ startProviderOAuth: mocks.provider }));
vi.mock('@/lib/company-sign-in', async original => ({ ...await original<typeof import('@/lib/company-sign-in')>(), startCompanySignIn: mocks.signIn, checkCompanySignIn: mocks.checkSignIn }));
import PendingActionPage from './page';
import SellerOperationContinuation from '@/app/dashboard/settings/SellerOperationContinuation';
import { isSellerBatchSummary } from '@/lib/seller-batch';

const token = 'a'.repeat(42) + 'A';
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
// Synthetic locked facts using the exact 8374a4e6 schema and reference keys.
function batch(): SellerBatchSummary {
  return {
    summary_type: 'seller_batch_v1', format_version: '1', action: 'aim.listing.bulk_publish', action_version: '1',
    user_id: uuid(99), org_id: null, client_id: 'https://verified.test', client_display_name: 'Verified Claude',
    grant_id: uuid(98), profile: 'claude', tool_set: 'seller', verb: 'publish',
    requested_at: '2026-10-10T01:00:00Z', execution_deadline: '2099-01-02T00:00:00Z',
    requested_count: 50, eligible_count: 25, blocked_count: 25, limit_version: 0, proposed_usage: 25,
    execution_semantics: 'best_effort_partial',
    items: Array.from({ length: 50 }, (_, i) => ({
      item_id: uuid(i + 101), target_id: uuid(i + 1), result_index: 49 - i,
      action: 'aim.listing.publish', action_version: '1', status: i % 2 ? 'blocked' : 'eligible',
      reason: i % 2 ? 'LEGAL_REQUIRED' : 'REVIEW_REQUIRED',
      args_hash: 'a'.repeat(64), facts_hash: 'b'.repeat(64), binding_hash: 'c'.repeat(64),
      before: { title: `Before ${i}`, description: '<script>unsafe</script>', price: '123.45' }, after: { status: 'published' },
      references: { listing_id: uuid(i + 201), listing_version_id: uuid(i + 301), approval_id: uuid(i + 401),
        acceptance_id: uuid(i + 501), price_cents: 12345, currency: 'USD', sample_set_hash: 'd'.repeat(64),
        legal_document_hash: 'e'.repeat(64), coverage_hash: 'f'.repeat(64), render_hash: '0'.repeat(64),
        source_hash: '1'.repeat(64), enrichment_hash: '2'.repeat(64), legal_identity_version: 3 },
      policy_reasons: ['SELLER_FLOOR', 'REVIEW_REQUIRED'],
    })),
  };
}
function admission() {
  return { effective: true, reason: null, checked_at: new Date().toISOString(), switch_snapshot: { connector_enabled: true, action_path_enabled: true, seller_enabled: true, seller_bulk_enabled: true, global_enabled: true, profile_enabled: true, tool_enabled: true } };
}
function pending(): PendingAction {
  return { admission: admission(), id: mocks.id, request_id: uuid(97), status: 'pending_review', summary: batch(),
    summary_hash: '9'.repeat(64), expires_at: '2099-01-01T00:00:00Z', error_code: null,
    result: { operation_id: uuid(96), execution_status: 'queued', requested_count: 50, eligible_count: 25, blocked_count: 25,
      succeeded_count: 0, no_change_count: 0, failed_count: 0, cancelled_count: 0 } };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.capability.mockImplementation(async () => admission()); mocks.activity.mockResolvedValue({ operation: pending().result, items: [], offset: 0, limit: 20, has_more: false }); mocks.query = new URLSearchParams({ t: token });
  mocks.auth = { hydrated: true, isLoading: false, user: { id: 'owner', totp_enabled: true }, token: 'session' };
  mocks.get.mockResolvedValue(pending()); mocks.decide.mockResolvedValue({ ...pending(), status: 'confirmed' });
  window.history.replaceState({}, '', '/');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });
async function review() { render(<PendingActionPage />); await screen.findByRole('button', { name: 'Confirm' }); }

it('pages the full 50-member manifest in canonical target order with caller indices and blocked members', async () => {
  await review();
  expect(screen.getByText('50 requested · 25 eligible · 25 blocked')).toBeTruthy();
  for (let page = 0; page < 5; page++) {
    const targets = screen.getAllByRole('heading', { level: 3 }).filter(el => el.textContent?.startsWith('Target '));
    expect(targets.map(el => el.textContent)).toEqual(Array.from({ length: 10 }, (_, i) => `Target ${uuid(page * 10 + i + 1)}`));
    expect(screen.getByText(`Caller index ${49 - page * 10} · eligible · REVIEW_REQUIRED`)).toBeTruthy();
    if (page < 4) fireEvent.click(screen.getByRole('button', { name: 'Next members' }));
  }
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('renders escaped diffs, exact reference values, deadline and separate legal signing before confirmation', async () => {
  await review();
  expect(screen.getAllByText('<script>unsafe</script>')).toHaveLength(10);
  expect(document.querySelector('script')).toBeNull();
  for (const value of ['12345', 'USD', uuid(301), uuid(501), 'd'.repeat(64), 'e'.repeat(64), 'f'.repeat(64)]) expect(screen.getAllByText(value).length).toBeGreaterThan(0);
  expect(screen.getByText('Best-effort partial execution:', { exact: false })).toBeTruthy();
  expect(screen.getByText('2099-01-02T00:00:00Z')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open Workspace for legal signing' }).getAttribute('href')).toBe('/dashboard/seller-workspace');
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('sends one complete saved summary_hash even from the fifth display page and never a selection or page hash', async () => {
  await review();
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next members' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText(/Authorized\. Execution is queued separately/);
  expect(mocks.decide).toHaveBeenCalledExactlyOnceWith(mocks.id, token, 'confirm', pending().summary_hash);
  expect(screen.queryByText('Confirmed. This request has been completed.')).toBeNull();
});
it('declines the whole batch without signing or executing children', async () => {
  mocks.decide.mockResolvedValue({ ...pending(), status: 'denied' }); await review();
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  await screen.findByText(/Declined/);
  expect(mocks.decide).toHaveBeenCalledExactlyOnceWith(mocks.id, token, 'decline', pending().summary_hash);
});
it.each(['oversize', 'page-only', 'duplicate', 'reordered', 'indices', 'counts', 'unsafe-map', 'missing-refs', 'semantics', 'hash', 'date', 'unknown-term'] as const)('disables confirmation for malformed %s manifest without auto splitting', async invalid => {
  const data = pending(); const summary = data.summary as SellerBatchSummary;
  if (invalid === 'oversize') { summary.requested_count = 51; summary.items.push({ ...summary.items[0], target_id: uuid(51), result_index: 50 }); }
  if (invalid === 'page-only') summary.items = summary.items.slice(0, 10);
  if (invalid === 'duplicate') summary.items[1].target_id = summary.items[0].target_id;
  if (invalid === 'reordered') summary.items.reverse();
  if (invalid === 'indices') summary.items[1].result_index = summary.items[0].result_index;
  if (invalid === 'counts') summary.eligible_count = 26;
  if (invalid === 'unsafe-map') Object.assign(summary.items[0].after, { nested: { private: 'hidden' } });
  if (invalid === 'missing-refs') Reflect.deleteProperty(summary.items[0], 'references');
  if (invalid === 'semantics') Reflect.set(summary, 'execution_semantics', 'atomic');
  if (invalid === 'hash') summary.items[0].binding_hash = 'partial';
  if (invalid === 'date') summary.execution_deadline = 'invalid';
  if (invalid === 'unknown-term') summary.undisplayed_effect = 'Do something extra';
  expect(isSellerBatchSummary(summary)).toBe(false);
  mocks.get.mockResolvedValue(data); await review();
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('navigation', { name: 'Batch display pages' })).toBeNull();
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('keeps switch-off 404 inert and does not expose seller controls', async () => {
  mocks.get.mockRejectedValue({ response: { status: 404 } }); render(<PendingActionPage />);
  await screen.findByText('Confirmation not found');
  expect(screen.queryByText(/Seller batch/)).toBeNull(); expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
});
it('shows live native pending receipt counts after queued authorization', async () => {
  await review(); vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); });
  mocks.get.mockResolvedValue({ ...pending(), status: 'confirmed', result: { ...pending().result, execution_status: 'partial', succeeded_count: 20, failed_count: 5 } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Execution: partial')).toBeTruthy();
  const receipt = screen.getByRole('region', { name: 'Live seller operation receipt' });
  expect(receipt.textContent).toContain('succeeded count20'); expect(receipt.textContent).toContain('failed count5');
});
it.each(['oidc', 'saml'])('routes enforced-org %s without TOTP to Chunk 0 settings continuation', async method => {
  mocks.auth.user = { id: 'owner', sso_enforced: true, totp_enabled: false, auth_methods: [method] };
  mocks.decide.mockRejectedValue({ response: { status: 403, data: { detail: 'SECOND_FACTOR_ENROLLMENT_REQUIRED' } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Set up two-factor authentication' }));
  expect(mocks.push).toHaveBeenCalledWith(`/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${mocks.id}?t=${token}`)}#security`);
});
it('requires native code for company confirmation and binds its proof to the complete batch', async () => {
  mocks.auth.user = { id: 'owner', sso_enforced: true, totp_enabled: true };
  mocks.reauth.mockResolvedValue({ token: 'native-proof' });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(mocks.decide).not.toHaveBeenCalled();
  const input = await screen.findByPlaceholderText('Enter code');
  fireEvent.change(input, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(mocks.id, token, 'confirm', pending().summary_hash, 'native-proof'));
});
it('keeps settings operation UI and reads absent for ordinary settings and security continuation', () => {
  render(<SellerOperationContinuation />); expect(mocks.get).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Seller operation in settings' })).toBeNull();
});
it('loads a known owner-only pending receipt on the settings operation continuation', async () => {
  window.history.replaceState({}, '', `/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${mocks.id}?t=${token}`)}#seller-operation`);
  render(<SellerOperationContinuation />);
  await screen.findByRole('region', { name: 'Seller operation in settings' });
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(mocks.id, token);
  expect(screen.getByRole('link', { name: 'Return to complete batch review' }).getAttribute('href')).toBe(`/confirm/${mocks.id}?t=${token}`);
});

it('renders Chunk 4 typed single summary and confirms its exact saved hash without claiming queued batch completion', async () => {
  const data = pending(); const manifest = batch();
  data.summary = { ...manifest, summary_type: 'seller_single_v1', execution_semantics: 'single', requested_count: 1, eligible_count: 1, blocked_count: 0, proposed_usage: 1, items: [{ ...manifest.items[0], result_index: 0 }] };
  mocks.get.mockResolvedValue(data); mocks.decide.mockResolvedValue({ ...data, status: 'confirmed' });
  await review(); expect(screen.getByRole('region', { name: 'Seller item review' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText('Confirmed. This request has been completed.');
  expect(mocks.decide).toHaveBeenCalledExactlyOnceWith(mocks.id, token, 'confirm', data.summary_hash);
});
it.each(['false', 'absent', 'stale', 'malformed', 'unavailable'] as const)('fails closed for %s capability but keeps receipt and decline', async status => {
  const data = pending();
  if (status === 'false') data.admission = { ...admission(), effective: false, reason: 'SELLER_DISABLED' };
  if (status === 'absent') delete data.admission;
  if (status === 'stale') data.admission = { ...admission(), checked_at: '2020-01-01T00:00:00Z' };
  if (status === 'malformed') data.admission = { ...admission(), switch_snapshot: { ...admission().switch_snapshot, tool_enabled: false } };
  if (status === 'unavailable') data.admission = { ...admission(), effective: false, reason: 'STATUS_UNAVAILABLE' };
  mocks.get.mockResolvedValue(data); await review();
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('link', { name: 'Open Workspace for legal signing' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Live seller operation receipt' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(mocks.id, token, 'decline', data.summary_hash));
});
it('rechecks switches before submission and refuses a switched-off capability', async () => {
  await review(); mocks.capability.mockResolvedValue({ ...admission(), effective: false, reason: 'BULK_DISABLED' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText(/Seller confirmation is disabled/);
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('fails closed when capability refresh fails or stalls past its freshness lease', async () => {
  vi.useFakeTimers(); await act(async () => { render(<PendingActionPage />); });
  mocks.capability.mockReturnValue(new Promise(() => {}));
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  mocks.capability.mockRejectedValue(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
});
it.each([2, 5])('preserves page %s through delayed polling and focus capability refreshes', async page => {
  vi.useFakeTimers(); await act(async () => { render(<PendingActionPage />); });
  for (let i = 1; i < page; i++) fireEvent.click(screen.getByRole('button', { name: 'Next members' }));
  const review = screen.getByRole('region', { name: 'Seller batch review' });
  const assertPosition = () => {
    expect(screen.getByRole('region', { name: 'Seller batch review' })).toBe(review);
    expect(screen.getByText(`Page ${page} of 5`)).toBeTruthy();
    expect(screen.getByRole('heading', { name: `Target ${uuid((page - 1) * 10 + 1)}` })).toBeTruthy();
  };
  for (const trigger of ['poll', 'focus']) {
    let resolve!: (value: ReturnType<typeof admission>) => void;
    mocks.capability.mockImplementationOnce(() => new Promise<ReturnType<typeof admission>>(done => { resolve = done; }));
    await act(async () => {
      if (trigger === 'poll') await vi.advanceTimersByTimeAsync(5000);
      else window.dispatchEvent(new Event('focus'));
    });
    expect(mocks.capability).toHaveBeenCalledTimes(trigger === 'poll' ? 1 : 2);
    assertPosition();
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(mocks.decide).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    assertPosition();
    await act(async () => { resolve(admission()); });
    assertPosition();
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
  }
});
it('retains completed receipts with all effect switches off', async () => {
  mocks.get.mockResolvedValue({ ...pending(), status: 'confirmed', admission: { ...admission(), effective: false }, result: { ...pending().result, execution_status: 'completed' } });
  render(<PendingActionPage />); await screen.findByText('Execution: completed');
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
});
it.each(['oidc', 'saml'].flatMap(authMethod => ['GET', 'POST'].map(method => ({ authMethod, method }))))('recovers $method $authMethod SSO_REQUIRED through company sign-in then refetches without auto consent', async ({ method, authMethod }) => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  mocks.auth.user = { id: 'owner', sso_enforced: true, totp_enabled: true, auth_methods: [authMethod] };
  const refusal = { response: { status: 403, data: { detail: 'SSO_REQUIRED', continuation: { path: '/dashboard/settings', refetch_required: true, automatic_confirmation: false } } } };
  if (method === 'GET') { mocks.get.mockRejectedValueOnce(refusal); render(<PendingActionPage />); }
  else {
    mocks.decide.mockRejectedValueOnce(refusal); mocks.reauth.mockResolvedValue({ token: 'first-proof' }); await review();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.change(await screen.findByPlaceholderText('Enter code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }
  if (authMethod === 'oidc') {
    fireEvent.change(await screen.findByRole('textbox', { name: 'Company sign-in ID' }), { target: { value: 'company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in through your company' }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith('company', '/dashboard/settings'));
  } else {
    fireEvent.click(await screen.findByRole('button', { name: 'Check company sign-in' }));
    await waitFor(() => expect(mocks.checkSignIn).toHaveBeenCalledTimes(1));
  }
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  expect(mocks.decide).toHaveBeenCalledTimes(method === 'POST' ? 1 : 0);
  mocks.reauth.mockResolvedValue({ token: 'fresh-native-proof' });
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
  fireEvent.change(await screen.findByPlaceholderText('Enter code'), { target: { value: '654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(mocks.decide).toHaveBeenLastCalledWith(mocks.id, token, 'confirm', pending().summary_hash, 'fresh-native-proof'));
});
it('clears settings receipts on hash navigation and retries after a transient read failure', async () => {
  window.history.replaceState({}, '', `/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${mocks.id}?t=${token}`)}#seller-operation`);
  mocks.get.mockRejectedValueOnce(new Error('offline'));
  vi.useFakeTimers(); await act(async () => { render(<SellerOperationContinuation />); });
  expect(screen.getByText('Unable to refresh this receipt. Retrying…')).toBeTruthy(); await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole('region', { name: 'Seller operation in settings' })).toBeTruthy();
  await act(async () => { window.history.replaceState({}, '', '/dashboard/settings#security'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(screen.queryByRole('region', { name: 'Seller operation in settings' })).toBeNull();
});

it('disables pending review when live polling reports shutdown after load', async () => {
  vi.useFakeTimers(); await act(async () => { render(<PendingActionPage />); });
  fireEvent.click(screen.getByRole('button', { name: 'Next members' }));
  mocks.capability.mockResolvedValue({ ...admission(), effective: false, reason: 'TOOL_DISABLED' });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Decline' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText('Page 2 of 5')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open Workspace for legal signing' })).toBeTruthy();
});
