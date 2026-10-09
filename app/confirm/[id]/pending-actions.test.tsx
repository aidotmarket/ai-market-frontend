// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  reauth: vi.fn(), get: vi.fn(), decide: vi.fn(), push: vi.fn(), replace: vi.fn(), provider: vi.fn(), query: new URLSearchParams(), id: '11111111-1111-4111-8111-111111111111',
  auth: { hydrated: true, isLoading: false, user: { id: 'owner', totp_enabled: true }, token: 'session' } as { hydrated: boolean; isLoading: boolean; user: Pick<User, 'id'> & Partial<User> | null; token: string | null },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useParams: () => ({ id: mocks.id }), useSearchParams: () => mocks.query }));
vi.mock('@/api/auth', async original => ({ ...await original<typeof import('@/api/auth')>(), submitReauth: mocks.reauth }));
vi.mock('@/components/OAuthButtons', () => ({ startProviderOAuth: mocks.provider }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('@/api/pending-actions', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/pending-actions')>(), getPendingAction: mocks.get, decidePendingAction: mocks.decide }));
import PendingActionPage from './page';
import type { PendingAction } from '@/api/pending-actions';
import type { User } from '@/types';
// Produced by cea28992's build_review_summary and validated by its schema,
// using its registered action copy and input models with synthetic locked facts.
import backendSummaries from '@/tests/fixtures/pending-action-review-cea28992.json';
const token = 'a'.repeat(42) + 'A';
const action: PendingAction = {
  id: mocks.id, request_id: '22222222-2222-4222-8222-222222222222', status: 'pending_review',
  summary: { action: 'aim.order.confirm', client_display_name: 'Verified Assistant', requested_at: '2026-10-08T00:30:00Z', effect: 'Complete this order and start the settlement hold.', binding_terms: { Order: 'order-id', Amount: 'USD 500.01' }, license_hash: 'd'.repeat(64), license_name: 'Commercial licence', license_version: '2.0', license_url: 'https://ai.market/licences/commercial/2.0', client_id: 'https://registered-client.test', user_id: 'owner', amount_cents: 50001, currency: 'USD', licence: { text: 'Exact terms\nSecond line', hash: 'd'.repeat(64) }, targets: ['listing-id'] },
  summary_hash: 'b'.repeat(64), expires_at: '2099-01-01T00:00:00Z', result: null, error_code: null,
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.query = new URLSearchParams({ t: token });
  mocks.auth = { hydrated: true, isLoading: false, user: { id: 'owner', totp_enabled: true }, token: 'session' };
  mocks.get.mockResolvedValue(action); mocks.decide.mockResolvedValue({ ...action, status: 'confirmed' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const review = async () => { render(<PendingActionPage />); await screen.findByRole('button', { name: 'Confirm' }); };
const noDecisions = () => { expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull(); };

it('loads without decision controls or automatic writes', () => {
  mocks.get.mockReturnValue(new Promise(() => {})); render(<PendingActionPage />);
  expect(screen.getByRole('status').textContent).toContain('Loading'); noDecisions(); expect(mocks.decide).not.toHaveBeenCalled();
});
it('waits for auth hydration', () => {
  mocks.auth.hydrated = false; render(<PendingActionPage />); noDecisions(); expect(mocks.get).not.toHaveBeenCalled();
});
it('shows all exact backend fields including nested terms, amount, currency and expiry', async () => {
  await review();
  expect(screen.getByText('50001')).toBeTruthy(); expect(screen.getByText('USD')).toBeTruthy();
  expect(screen.getByText('Exact terms Second line')).toBeTruthy(); expect(screen.getAllByText('d'.repeat(64)).length).toBeGreaterThan(0);
  expect(screen.getByText('listing-id')).toBeTruthy(); expect(screen.getByText(action.expires_at)).toBeTruthy();
  expect(screen.getByText('Only confirm if you asked for this.')).toBeTruthy(); expect(mocks.decide).not.toHaveBeenCalled();
});
it('shows verified identity, request time, effect, readable terms and licence link before Confirm without another form', async () => {
  await review();
  const confirm = screen.getByRole('button', { name: 'Confirm' });
  for (const element of [screen.getByText('Verified Assistant'), screen.getByText(String(action.summary.effect)),
    screen.getByText('order-id'), screen.getByText('USD 500.01'),
    screen.getByRole('link', { name: /Commercial licence \(version 2.0\)/ }),
    document.querySelector(`time[datetime="${action.summary.requested_at}"]`)!]) {
    expect(element.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  expect(screen.getByRole('link', { name: /Read licence terms/ }).getAttribute('href')).toBe(action.summary.license_url);
  expect(document.querySelector('form')).toBeNull();
  expect(mocks.decide).not.toHaveBeenCalled();
});
it.each(backendSummaries)('renders the pinned backend snapshot for $action', async summary => {
  mocks.get.mockResolvedValue({ ...action, summary }); await review();
  expect(screen.getByText(summary.client_display_name)).toBeTruthy();
  expect(screen.getByText(summary.effect)).toBeTruthy();
  expect(screen.getByText(summary.binding_terms.Amount)).toBeTruthy();
  const link = screen.getByRole('link', { name: /Read licence terms/ });
  expect(link.getAttribute('href')).toBe(summary.license_url);
  expect(link.textContent).toContain(summary.license_name); expect(link.textContent).toContain(summary.license_version);
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
  expect(mocks.decide).not.toHaveBeenCalled();
});
it('renders server-authored copy as escaped text', async () => {
  mocks.get.mockResolvedValue({ ...action, summary: { ...action.summary, client_display_name: '<script>app</script>',
    effect: '<img src=x onerror=alert(1)>', binding_terms: { Message: '<script>term</script>' } } });
  await review(); expect(screen.getByText('<script>app</script>')).toBeTruthy();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  expect(document.querySelector('script, img')).toBeNull();
});
it('renders a local licence URL as a link', async () => {
  mocks.get.mockResolvedValue({ ...action, summary: { ...action.summary, license_url: '/licenses/standard/1.0' } });
  await review(); expect(screen.getByRole('link', { name: /Read licence terms/ }).getAttribute('href')).toBe('/licenses/standard/1.0');
});
it.each(['client_display_name', 'requested_at', 'effect', 'binding_terms', 'license_name', 'license_version', 'license_url', 'license_hash'])('disables Confirm when %s is missing', async field => {
  const summary = { ...action.summary }; delete summary[field];
  mocks.get.mockResolvedValue({ ...action, summary }); await review();
  expect(screen.getByRole('alert').textContent).toContain('Required request details are missing');
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); expect(mocks.decide).not.toHaveBeenCalled();
});
it.each([
  { client_display_name: ' ' }, { requested_at: 'not-a-time' }, { requested_at: '2026-10-08T00:30:00' },
  { effect: '' }, { effect: 'UNVERIFIED: effect' }, { binding_terms: {} }, { binding_terms: { Order: '' } },
  { license_name: ' ' }, { license_version: '' }, { license_url: 'javascript:alert(1)' }, { license_url: '//evil.test' },
  { license_url: '/\\evil.test' }, { license_url: 'https://user:pass@ai.market/license' },
])('blocks malformed display content %j', async invalid => {
  mocks.get.mockResolvedValue({ ...action, summary: { ...action.summary, ...invalid } }); await review();
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); expect(mocks.decide).not.toHaveBeenCalled();
});
it('does not require a licence for actions whose contract has no licence', async () => {
  mocks.get.mockResolvedValue({ ...action, summary: { action: 'aim.inquiry.create', client_display_name: 'Verified Assistant',
    requested_at: action.summary.requested_at, effect: 'Send this inquiry to the seller.', binding_terms: { Message: 'Hello' } } });
  await review(); expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
});
it.each(['read', 'confirm'] as const)('blocks backend SUMMARY_CONTENT_UNAVAILABLE on %s', async phase => {
  const refusal = { response: { status: 503, data: { detail: 'SUMMARY_CONTENT_UNAVAILABLE' } } };
  if (phase === 'read') { mocks.get.mockRejectedValue(refusal); render(<PendingActionPage />); }
  else { mocks.decide.mockRejectedValue(refusal); await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); }
  await screen.findByText(/Required request details are missing/);
  const confirm = screen.queryByRole('button', { name: 'Confirm' }) as HTMLButtonElement | null;
  expect(confirm === null || confirm.disabled).toBe(true);
  expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
it.each([['confirm', 'Confirm', 'confirmed', 'Confirmed.'], ['decline', 'Decline', 'denied', 'Declined.']] as const)('shows saved %s and sends the displayed hash', async (decision, button, status, message) => {
  mocks.decide.mockResolvedValue({ ...action, status }); await review(); fireEvent.click(screen.getByRole('button', { name: button }));
  await screen.findByText(new RegExp(message)); noDecisions();
  expect(mocks.decide).toHaveBeenCalledExactlyOnceWith(action.id, token, decision, action.summary_hash);
});
it('allows only one in-flight decision', async () => {
  let finish!: (value: PendingAction) => void; mocks.decide.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  expect(mocks.decide).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button', { name: 'Decline' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish({ ...action, status: 'confirmed' })); noDecisions();
});
it.each(['confirmed', 'denied', 'expired', 'failed'] as const)('renders replayed %s as read-only', async (status) => {
  mocks.get.mockResolvedValue({ ...action, status }); render(<PendingActionPage />);
  await screen.findByRole('region', { name: 'Requested action and exact terms' }); noDecisions(); expect(mocks.decide).not.toHaveBeenCalled();
});
it.each(['EXPIRED', 'CHANGED'])('shows %s expiry and requires a new request', async (error_code) => {
  mocks.decide.mockResolvedValue({ ...action, status: 'expired', error_code }); await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText(/expired or its terms changed/); noDecisions();
});
it('stops confirmation on summary-hash conflict', async () => {
  mocks.decide.mockRejectedValue({ response: { status: 409, data: { detail: 'SUMMARY_CHANGED' } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByText(/expired or its terms changed/); noDecisions();
});
it('expires an open review without a write', async () => {
  mocks.get.mockResolvedValue({ ...action, expires_at: new Date(Date.now() + 1000).toISOString() }); await review();
  await waitFor(() => expect(screen.getByText(/expired or its terms changed/)).toBeTruthy(), { timeout: 2000 });
  noDecisions(); expect(mocks.decide).not.toHaveBeenCalled();
});
it.each(['UNAVAILABLE', 'Not Found'])('shows the same inert 404 for flag-off or wrong user/token: %s', async (detail) => {
  mocks.auth.user = null; mocks.auth.token = null;
  mocks.get.mockRejectedValue({ response: { status: 404, data: { detail } } }); render(<PendingActionPage />);
  await screen.findByText('Confirmation not found'); noDecisions(); expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull(); expect(screen.queryByRole('region')).toBeNull();
  expect(mocks.provider).not.toHaveBeenCalled();
});
it('removes previously actionable terms when a decision returns 404', async () => {
  mocks.decide.mockRejectedValue({ response: { status: 404 } }); await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText('Confirmation not found'); noDecisions(); expect(screen.queryByText('50001')).toBeNull();
});
it('rejects extra URL parameters before querying', async () => {
  mocks.query.set('next', 'https://evil.test'); render(<PendingActionPage />);
  expect(screen.getByText('Confirmation not found')).toBeTruthy(); noDecisions(); expect(mocks.get).not.toHaveBeenCalled();
});
it.each([401, 403])('requires login on %s and preserves the safe continuation without auto-confirm', async (status) => {
  mocks.decide.mockRejectedValue({ response: { status, data: { detail: status === 403 ? 'RECENT_LOGIN_REQUIRED' : 'FIRST_PARTY_SESSION_REQUIRED' } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByRole('button', { name: 'Sign in again' });
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/login?reauth=pending-action&redirect=${encodeURIComponent(`/confirm/${action.id}?t=${token}`)}`);
  expect(mocks.decide).toHaveBeenCalledTimes(1);
});
it('offers login for a sessionless read after API admission', async () => {
  mocks.get.mockRejectedValue({ response: { status: 401 } }); render(<PendingActionPage />);
  await screen.findByRole('button', { name: 'Sign in again' }); noDecisions();
});
it('requires a login and 2FA round trip, then reviews the new session without auto-confirm', async () => {
  mocks.decide.mockRejectedValue({ response: { status: 403, data: { detail: 'SECOND_FACTOR_REQUIRED' } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in and verify second factor' }));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/login?reauth=pending-action&redirect=${encodeURIComponent(`/confirm/${action.id}?t=${token}`)}`);
  cleanup(); mocks.auth = { ...mocks.auth, token: 'fresh-mfa-session' };
  render(<PendingActionPage />); await screen.findByRole('button', { name: 'Confirm' });
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
  expect(mocks.get).toHaveBeenCalledTimes(2); expect(mocks.decide).toHaveBeenCalledTimes(1);
  mocks.decide.mockResolvedValue({ ...action, status: 'confirmed' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByText(/Confirmed\./);
  expect(mocks.decide).toHaveBeenCalledTimes(2);
});
it.each(['SECOND_FACTOR_ENROLLMENT_REQUIRED', 'SECOND_FACTOR_REQUIRED'])('routes an unenrolled password user to Settings for %s without a plain-login loop', async detail => {
  mocks.auth.user = { id: 'owner', totp_enabled: false, auth_methods: ['password', 'google'], primary_auth: 'google', two_factor_provider: null };
  mocks.decide.mockRejectedValue({ response: { status: 403, data: { detail } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Set up two-factor authentication' }));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${action.id}?t=${token}`)}#security`);
  expect(mocks.provider).not.toHaveBeenCalled();
  cleanup(); mocks.auth = { ...mocks.auth, token: 'enrolled-session', user: { id: 'owner', totp_enabled: true } };
  render(<PendingActionPage />); await screen.findByRole('button', { name: 'Confirm' });
  expect(mocks.decide).toHaveBeenCalledTimes(1);
  mocks.decide.mockResolvedValue({ ...action, status: 'confirmed' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByText(/Confirmed\./);
  expect(mocks.decide).toHaveBeenCalledTimes(2);
});
it.each(['google', 'github'] as const)('re-authenticates the current %s session with its provider, then requires a fresh explicit Confirm', async provider => {
  mocks.auth.user = { id: 'owner', totp_enabled: false, two_factor_provider: provider, primary_auth: 'password', auth_methods: ['password', provider] };
  mocks.decide.mockRejectedValue({ response: { status: 403, data: { detail: 'SECOND_FACTOR_REQUIRED' } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  const button = await screen.findByRole('button', { name: `Sign in again with ${provider === 'google' ? 'Google' : 'GitHub'}` });
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(mocks.provider).toHaveBeenCalledExactlyOnceWith(provider, `/confirm/${action.id}?t=${token}`);
  expect(mocks.push).not.toHaveBeenCalled();
  cleanup(); mocks.auth = { ...mocks.auth, token: 'fresh-provider-session' };
  render(<PendingActionPage />); await screen.findByRole('button', { name: 'Confirm' });
  expect(mocks.decide).toHaveBeenCalledTimes(1);
  mocks.decide.mockResolvedValue({ ...action, status: 'confirmed' });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByText(/Confirmed\./);
  expect(mocks.decide).toHaveBeenCalledTimes(2);
});
it('shows a retry message when provider sign-in fails without falling back to login', async () => {
  mocks.auth.user = { id: 'owner', two_factor_provider: 'google' };
  mocks.provider.mockRejectedValue(new Error('network'));
  mocks.decide.mockRejectedValue({ response: { status: 403, data: { detail: 'SECOND_FACTOR_REQUIRED' } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in again with Google' }));
  await screen.findByText('Could not start provider sign-in. Please try again.');
  expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.decide).toHaveBeenCalledTimes(1);
});
it('still permits declining when fresh login is required', async () => {
  mocks.decide.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'RECENT_LOGIN_REQUIRED' } } }).mockResolvedValueOnce({ ...action, status: 'denied' });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByRole('button', { name: 'Sign in again' });
  fireEvent.click(screen.getByRole('button', { name: 'Decline' })); await screen.findByText(/Declined/); noDecisions();
});
it('hides a previous session review immediately and ignores late responses after account change', async () => {
  const view = render(<PendingActionPage />); await screen.findByRole('button', { name: 'Confirm' });
  mocks.get.mockReturnValue(new Promise(() => {})); mocks.auth = { ...mocks.auth, user: { id: 'different-owner' }, token: 'different-session' };
  view.rerender(<PendingActionPage />); noDecisions(); expect(screen.queryByText('50001')).toBeNull();
});
it('shows service failure without decision controls', async () => {
  mocks.get.mockRejectedValue({ response: { status: 503 } }); render(<PendingActionPage />);
  await screen.findByText(/temporarily unavailable/); noDecisions();
});
it('renders backend text literally without executing markup or linking arbitrary destinations', async () => {
  mocks.get.mockResolvedValue({ ...action, summary: { effect: '<script>alert(1)</script>', destination: 'https://evil.test' } });
  await review(); expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull(); expect(screen.queryByRole('link')).toBeNull();
});


it('requires an authenticator code for enrolled company users and sends the native proof with the exact hash', async () => {
  mocks.auth.user = { id: 'owner', totp_enabled: true, sso_enforced: true };
  mocks.reauth.mockResolvedValue({ token: 'native-totp-proof' });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(mocks.decide).not.toHaveBeenCalled();
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Verification code'), { target: { value: '123456' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(mocks.decide).toHaveBeenCalledExactlyOnceWith(mocks.id, token, 'confirm', action.summary_hash, 'native-totp-proof'));
  expect(mocks.reauth).toHaveBeenCalledWith('123456');
});
it('does not confirm with an invalid company authenticator code', async () => {
  mocks.auth.user = { id: 'owner', totp_enabled: true, sso_enforced: true };
  mocks.reauth.mockRejectedValue(new Error('invalid'));
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Verification code'), { target: { value: '123456' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
  await screen.findByRole('alert'); expect(mocks.decide).not.toHaveBeenCalled();
});
it('company enrollment-required errors use the fixed settings continuation', async () => {
  mocks.auth.user = { id: 'owner', totp_enabled: false, sso_enforced: true };
  mocks.get.mockRejectedValue({ response: { status: 403, data: { detail: 'SECOND_FACTOR_ENROLLMENT_REQUIRED' } } });
  render(<PendingActionPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set up two-factor authentication' }));
  expect(mocks.push).toHaveBeenCalledWith(`/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${mocks.id}?t=${token}`)}#security`);
  expect(mocks.reauth).not.toHaveBeenCalled(); expect(mocks.decide).not.toHaveBeenCalled();
});
const checkoutAction: PendingAction = { ...action, summary: { ...action.summary, action: 'aim.checkout.handoff.create' },
  result: { handoff_id: 'handoff', expires_at: '2099-01-01T00:00:00Z', checkout_url: `https://ai.market/checkout/h/${token}` } };
it('continues straight from confirmed handoff to browser checkout without another chat call', async () => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
  mocks.get.mockResolvedValue({ ...checkoutAction, result: null });
  mocks.decide.mockResolvedValue({ ...checkoutAction, status: 'confirmed' });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/checkout/h/${token}`));
  expect(mocks.get).toHaveBeenCalledOnce(); expect(mocks.decide).toHaveBeenCalledOnce();
  expect(screen.getByRole('link', { name: 'Continue to checkout' }).getAttribute('href')).toBe(`/checkout/h/${token}`);
  expect(document.querySelector('input')).toBeNull();
});
it('offers the same checkout continuation on a confirmed owner read without repeating the decision', async () => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
  mocks.get.mockResolvedValue({ ...checkoutAction, status: 'confirmed' }); render(<PendingActionPage />);
  await screen.findByRole('link', { name: 'Continue to checkout' });
  expect(mocks.decide).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});
it.each(['https://evil.test/checkout/h/' + token, 'https://ai.market/checkout/h/' + token + '?extra=1', null])('blocks unsafe or missing confirmed continuation %s', async checkout_url => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
  mocks.get.mockResolvedValue({ ...checkoutAction, result: null });
  mocks.decide.mockResolvedValue({ ...checkoutAction, status: 'confirmed', result: { checkout_url } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByText(/Confirmed\./);
  expect(mocks.push).not.toHaveBeenCalled(); expect(screen.queryByRole('link', { name: 'Continue to checkout' })).toBeNull();
});
it.each(['denied', 'expired', 'failed'] as const)('does not continue a %s handoff', async status => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
  mocks.get.mockResolvedValue({ ...checkoutAction, status }); render(<PendingActionPage />);
  await screen.findByRole('region');
  expect(mocks.push).not.toHaveBeenCalled(); expect(screen.queryByRole('link', { name: 'Continue to checkout' })).toBeNull();
});
it('preserves flag-off confirmation behaviour even if a checkout link is present', async () => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'false');
  mocks.decide.mockResolvedValue({ ...checkoutAction, status: 'confirmed' });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByText(/Confirmed\./);
  expect(mocks.push).not.toHaveBeenCalled(); expect(screen.queryByRole('link', { name: 'Continue to checkout' })).toBeNull();
});


it.each(['SELLER_PAYOUT_READINESS_UNKNOWN', 'SELLER_PAYOUT_NOT_READY', 'REFERENCE_DELIVERY_UNREADY'])('blocks confirmation checkout failure %s with its web path and no continuation', async code => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
  mocks.decide.mockResolvedValue({ ...checkoutAction, status: 'failed', error_code: code, result: { web_path: '/listings/listing' } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByRole('link', { name: 'Review listing' });
  expect(screen.getByRole('alert').textContent).toContain('Checkout is blocked');
  expect(mocks.push).not.toHaveBeenCalled(); expect(screen.queryByRole('link', { name: 'Continue to checkout' })).toBeNull(); noDecisions();
});
it('renders a readiness refusal returned by confirmation POST as a block', async () => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
  mocks.decide.mockRejectedValue({ response: { status: 409, data: { detail: { code: 'REFERENCE_DELIVERY_UNREADY', web_path: '/listings/listing' } } } });
  await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByRole('link', { name: 'Review listing' }); noDecisions(); expect(mocks.push).not.toHaveBeenCalled();
});
