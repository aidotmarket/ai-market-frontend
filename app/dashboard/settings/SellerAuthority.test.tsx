// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SellerAuthority from './SellerAuthority';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import { readAuthority, reviewAuthority, setAuthority, stopAuthority } from '@/api/connector-seller-settings';
import { authority, hash, id } from '@/tests/fixtures/seller-authority';
import { submitReauth } from '@/api/auth';
import type { User } from '@/types';
vi.mock('@/hooks/useSellerSwitches', () => ({ useSellerSwitches: vi.fn() }));
vi.mock('@/api/connector-seller-settings', async original => ({ ...await original<typeof import('@/api/connector-seller-settings')>(), readAuthority: vi.fn(), reviewAuthority: vi.fn(), setAuthority: vi.fn(), stopAuthority: vi.fn() }));
vi.mock('@/api/auth', async original => ({ ...await original<typeof import('@/api/auth')>(), submitReauth: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99), totp_enabled: true } as User, token: 'retained-session' });
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: true, bulk: true });
  vi.mocked(readAuthority).mockResolvedValue(structuredClone(authority));
  vi.mocked(reviewAuthority).mockImplementation(async body => { const { csrf: _csrf, reauth_token: _token, ...decision } = body; return { action: 'aim.seller.connector_limits.set', decision, review_hash: hash }; });
  vi.mocked(setAuthority).mockResolvedValue({ decision_id: id(90), version: 5, enabled: true });
  vi.mocked(stopAuthority).mockResolvedValue({ decision_id: id(90), version: 5, enabled: false });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it.each([null, { seller: false, effects: true, bulk: true }])('hides settings and performs no reads without positive seller reporting: %j', async report => {
  vi.mocked(useSellerSwitches).mockReturnValue(report); render(<SellerAuthority />);
  expect(screen.queryByRole('region')).toBeNull(); expect(readAuthority).not.toHaveBeenCalled();
});
it('shows selected identities, expiry and shared budget after reservations and successes', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  expect(screen.getByText('30')).toBeTruthy(); expect(screen.getByText(/Single and bulk actions share/)).toBeTruthy();
  expect(screen.getByDisplayValue('https://verified.test')).toBeTruthy(); expect(screen.getByDisplayValue('2099-01-01T00:00:00Z')).toBeTruthy();
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
it('keeps Stop and status available with effects off, without factor/review', async () => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: false, bulk: false });
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Stop automatic seller actions' }));
  await waitFor(() => expect(stopAuthority).toHaveBeenCalledTimes(1)); expect(reviewAuthority).not.toHaveBeenCalled();
  expect(vi.mocked(stopAuthority).mock.calls[0][0]).toMatchObject({ expected_version: 4, csrf: expect.any(String) });
  expect((screen.getByRole('button', { name: 'Review exact standing limits' }) as HTMLButtonElement).disabled).toBe(true);
});
it('offers Chunk 0 enrollment and company sign-in on exact native refusals', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  useAuthStore.setState({ user: { id: id(99), sso_enforced: true, totp_enabled: false, auth_methods: ['oidc'] } as User });
  vi.mocked(reviewAuthority).mockRejectedValue({ response: { status: 403, data: { detail: 'SECOND_FACTOR_ENROLLMENT_REQUIRED' } } });
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/); fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' }));
  expect((await screen.findByRole('link', { name: 'Settings' })).getAttribute('href')).toBe('/dashboard/settings'); expect(setAuthority).not.toHaveBeenCalled();
  vi.mocked(reviewAuthority).mockRejectedValue({ response: { status: 403, data: { detail: 'RECENT_LOGIN_REQUIRED' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' }));
  await screen.findByRole('button', { name: 'Sign in through your company' }); expect(setAuthority).not.toHaveBeenCalled();
});
it('clears old-owner review and limits when the retained credential changes', async () => {
  const view = render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' })); await screen.findByRole('button', { name: 'Save reviewed standing authority' });
  vi.mocked(readAuthority).mockResolvedValue({ version: 0, enabled: false, limits: null, utc_day: '2026-10-10', usage: [] });
  useAuthStore.setState({ token: 'different-session' }); view.rerender(<SellerAuthority />); await screen.findByText(/Authority version 0/);
  expect(screen.queryByRole('button', { name: 'Save reviewed standing authority' })).toBeNull();
});

it('retains the exact typed decision while retrying review with native TOTP proof', async () => {
  useAuthStore.setState({ user: { id: id(99), sso_enforced: true, totp_enabled: true } as User });
  vi.mocked(submitReauth).mockResolvedValue({ token: 'native-totp-proof' } as never);
  vi.mocked(reviewAuthority).mockRejectedValueOnce({ response: { status: 403, data: { detail: 'SECOND_FACTOR_REQUIRED' } } });
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/); fireEvent.click(screen.getByRole('button', { name: 'Review exact standing limits' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Verify authenticator code' }));
  fireEvent.change(screen.getByPlaceholderText('Enter code'), { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Save reviewed standing authority' });
  expect(reviewAuthority).toHaveBeenCalledTimes(2);
  const calls = vi.mocked(reviewAuthority).mock.calls;
  expect(calls[1][0].idempotency_key).toBe(calls[0][0].idempotency_key); expect(calls[1][0].reauth_token).toBe('native-totp-proof');
  expect(setAuthority).not.toHaveBeenCalled();
});
