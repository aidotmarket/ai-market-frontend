// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(), decide: vi.fn(), push: vi.fn(), query: new URLSearchParams(), id: '11111111-1111-4111-8111-111111111111',
  auth: { hydrated: true, isLoading: false, user: { id: 'owner' }, token: 'session' } as { hydrated: boolean; isLoading: boolean; user: { id: string } | null; token: string | null },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useParams: () => ({ id: mocks.id }), useSearchParams: () => mocks.query }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('@/api/pending-actions', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/pending-actions')>(), getPendingAction: mocks.get, decidePendingAction: mocks.decide }));
import PendingActionPage from './page';
import type { PendingAction } from '@/api/pending-actions';
const token = 'a'.repeat(42) + 'A';
const action: PendingAction = {
  id: mocks.id, request_id: '22222222-2222-4222-8222-222222222222', status: 'pending_review',
  summary: { action: 'confirm_receipt', client_id: 'https://registered-client.test', user_id: 'owner', amount_cents: 50001, currency: 'USD', licence: { text: 'Exact terms\nSecond line', hash: 'd'.repeat(64) }, targets: ['listing-id'] },
  summary_hash: 'b'.repeat(64), expires_at: '2099-01-01T00:00:00Z', result: null, error_code: null,
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.query = new URLSearchParams({ t: token });
  mocks.auth = { hydrated: true, isLoading: false, user: { id: 'owner' }, token: 'session' };
  mocks.get.mockResolvedValue(action); mocks.decide.mockResolvedValue({ ...action, status: 'confirmed' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
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
  expect(screen.getByText('Exact terms Second line')).toBeTruthy(); expect(screen.getByText('d'.repeat(64))).toBeTruthy();
  expect(screen.getByText('listing-id')).toBeTruthy(); expect(screen.getByText(action.expires_at)).toBeTruthy();
  expect(screen.getByText('Only confirm if you asked for this.')).toBeTruthy(); expect(mocks.decide).not.toHaveBeenCalled();
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
