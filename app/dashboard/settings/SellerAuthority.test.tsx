// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SellerAuthority from './SellerAuthority';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import { readAuthority, reviewAuthority, setAuthority, reviewStopAuthority, stopAuthority } from '@/api/connector-seller-settings';
import { authority, hash, id } from '@/tests/fixtures/seller-authority';
import { checkCompanySignIn } from '@/lib/company-sign-in';
import type { User } from '@/types';
vi.mock('@/hooks/useSellerSwitches', async original => ({ ...await original<typeof import('@/hooks/useSellerSwitches')>(), useSellerSwitches: vi.fn() }));
vi.mock('@/api/connector-seller-settings', async original => ({ ...await original<typeof import('@/api/connector-seller-settings')>(), readAuthority: vi.fn(), reviewAuthority: vi.fn(), setAuthority: vi.fn(), reviewStopAuthority: vi.fn(), stopAuthority: vi.fn() }));
vi.mock('@/lib/company-sign-in', async original => ({ ...await original<typeof import('@/lib/company-sign-in')>(), checkCompanySignIn: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99), totp_enabled: true } as User, token: 'retained-session' });
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: true, bulk: true });
  vi.mocked(readAuthority).mockResolvedValue(structuredClone(authority));
  vi.mocked(reviewAuthority).mockImplementation(async body => { const { csrf: _csrf, reauth_token: _token, ...decision } = body; return { action: 'aim.seller.connector_limits.set', decision, review_hash: hash }; });
  vi.mocked(setAuthority).mockResolvedValue({ decision_id: id(90), version: 5, enabled: true });
  vi.mocked(reviewStopAuthority).mockImplementation(async body => { const { csrf: _csrf, reauth_token: _token, review_hash: _hash, ...decision } = body; return { action: 'aim.seller.connector_limits.revoke', decision, review_hash: hash }; });
  vi.mocked(stopAuthority).mockResolvedValue({ decision_id: id(90), version: 5, enabled: false });
});
afterEach(() => {
  expect(screen.queryByRole('dialog', { name: 'Re-authenticate' })).toBeNull();
  expect(screen.queryByPlaceholderText('Enter code')).toBeNull();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it.each([null, { seller: false, effects: true, bulk: true }, { seller: true, effects: false, bulk: true }])('keeps authenticated status and reviewed Stop visible while edits are hidden: %j', async report => {
  vi.mocked(useSellerSwitches).mockReturnValue(report); render(<SellerAuthority />);
  await screen.findByText(/Authority version 4/);
  expect(screen.queryByRole('button', { name: 'Review exact standing limits' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Stop automatic seller actions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Stop automatic seller actions' }));
  await waitFor(() => expect(stopAuthority).toHaveBeenCalledWith({ ...vi.mocked(reviewStopAuthority).mock.calls[0][0], review_hash: hash }));
  expect(setAuthority).not.toHaveBeenCalled();
});
it('shows selected identities, expiry and shared budget after reservations and successes', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  expect(screen.getByText('30')).toBeTruthy(); expect(screen.getByText(/Single and bulk actions share/)).toBeTruthy();
  expect(screen.getByDisplayValue('https://verified.test')).toBeTruthy(); expect(screen.getByDisplayValue('2099-01-01T00:00:00Z')).toBeTruthy();
});
it.each(['full', 'fallback', 'off'] as const)('keeps standing-limit edits and Stop independent of ChatGPT %s mode', async seller_mode => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects: true, profiles: { openai: { floors: false, seller_mode } } });
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save reviewed standing authority' }));
  await waitFor(() => expect(setAuthority).toHaveBeenCalledTimes(1));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Stop automatic seller actions' }).disabled).toBe(false);
});
it('reviews a typed native action before submitting the retained exact hash', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' }));
  const save = await screen.findByRole('button', { name: 'Save reviewed standing authority' });
  expect(setAuthority).not.toHaveBeenCalled(); expect(screen.getByRole('region', { name: 'Exact server authority review' }).textContent).toContain(hash);
  fireEvent.click(save); await waitFor(() => expect(setAuthority).toHaveBeenCalledTimes(1));
  const body = vi.mocked(reviewAuthority).mock.calls[0][0];
  expect(setAuthority).toHaveBeenCalledWith({ ...body, review_hash: hash }); expect(body.expected_version).toBe(4); expect(body.csrf).toHaveLength(64);
  expect(body.limits.max_batch).toBe(50); expect(body.idempotency_key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
});
it('invalidates review on editing and refuses 51 without auto splitting', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' })); await screen.findByRole('button', { name: 'Save reviewed standing authority' });
  fireEvent.change(screen.getByLabelText('max batch'), { target: { value: '51' } });
  expect(screen.queryByRole('button', { name: 'Save reviewed standing authority' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Review exact standing limits' }) as HTMLButtonElement).disabled).toBe(true);
  expect(setAuthority).not.toHaveBeenCalled();
});

it('clears old-owner review and limits when the retained credential changes', async () => {
  const view = render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' })); await screen.findByRole('button', { name: 'Save reviewed standing authority' });
  vi.mocked(readAuthority).mockResolvedValue({ version: 0, enabled: false, limits: null, utc_day: '2026-10-10', usage: [] });
  useAuthStore.setState({ token: 'different-session' }); view.rerender(<SellerAuthority />); await screen.findByText(/Authority version 0/);
  expect(screen.queryByRole('button', { name: 'Save reviewed standing authority' })).toBeNull();
});







it.each(['RECENT_LOGIN_REQUIRED', 'SECOND_FACTOR_REQUIRED', 'SECOND_FACTOR_ENROLLMENT_REQUIRED'])('shows refresh only for legacy %s', async detail => {
  vi.mocked(reviewAuthority).mockRejectedValueOnce({ response: { status: 403, data: { detail } } });
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' }));
  await screen.findByText('Please refresh the page and try again.');
  expect(screen.queryByRole('dialog')).toBeNull(); expect(checkCompanySignIn).not.toHaveBeenCalled();
});
