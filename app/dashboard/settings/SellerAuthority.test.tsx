// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SellerAuthority from './SellerAuthority';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import { readAuthority, reviewAuthority, setAuthority, reviewStopAuthority, stopAuthority } from '@/api/connector-seller-settings';
import { authority, hash, id, limits } from '@/tests/fixtures/seller-authority';
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
  const expiry = new Date(limits.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const headline = screen.getByText(`Your AI assistant can publish some of your listings, within the limits below, until ${expiry}.`);
  expect(headline.hasAttribute('role')).toBe(false);
  expect(screen.queryByText("Your AI assistant can't change your listings right now.")).toBeNull();
  expect(screen.getByText(/Authority version 4 · Active/)).toBeTruthy();
  expect(screen.getByText('Editing permissions is unavailable on this page right now. You can still check status and stop the assistant here.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Review permissions' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review stopping assistant changes' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop all automatic assistant changes' }));
  await waitFor(() => expect(stopAuthority).toHaveBeenCalledWith({ ...vi.mocked(reviewStopAuthority).mock.calls[0][0], review_hash: hash }));
  expect(setAuthority).not.toHaveBeenCalled();
});
it('uses filled shared styles for Stop and Refresh buttons', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  expect(screen.getByRole('button', { name: 'Review stopping assistant changes' }).classList.contains('bg-red-700')).toBe(true);
  expect(screen.getByRole('button', { name: 'Refresh permissions' }).classList.contains('bg-white')).toBe(true);
});
it('shows selected identities, expiry and shared budget after reservations and successes', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  expect(screen.getByText('30')).toBeTruthy(); expect(screen.getByText(/Each request can change up to 50 listings/)).toBeTruthy();
  expect(screen.getByDisplayValue('https://verified.test')).toBeTruthy(); expect(screen.getByDisplayValue('2099-01-01T00:00:00Z')).toBeTruthy();
});
it.each(['full', 'fallback', 'off'] as const)('keeps standing-limit edits and Stop independent of ChatGPT %s mode', async seller_mode => {
  vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, bulk: true, effects: true, profiles: { openai: { floors: false, seller_mode } } });
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review permissions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Allow changes' }));
  await waitFor(() => expect(setAuthority).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status').textContent).toBe('AI assistant permissions saved.');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review stopping assistant changes' }).disabled).toBe(false);
});
it('reviews a typed native action before submitting the retained exact hash', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review permissions' }));
  const save = await screen.findByRole('button', { name: 'Allow changes' });
  expect(setAuthority).not.toHaveBeenCalled(); expect(screen.getByRole('region', { name: 'Exact server authority review' }).textContent).toContain(hash);
  fireEvent.click(save); await waitFor(() => expect(setAuthority).toHaveBeenCalledTimes(1));
  const body = vi.mocked(reviewAuthority).mock.calls[0][0];
  expect(setAuthority).toHaveBeenCalledWith({ ...body, review_hash: hash }); expect(body.expected_version).toBe(4); expect(body.csrf).toHaveLength(64);
  expect(body.limits.max_batch).toBe(50); expect(body.idempotency_key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
});
it('invalidates review on editing and refuses 51 without auto splitting', async () => {
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review permissions' })); await screen.findByRole('button', { name: 'Allow changes' });
  fireEvent.change(screen.getByLabelText('max batch'), { target: { value: '51' } });
  expect(screen.queryByRole('button', { name: 'Allow changes' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Review permissions' }) as HTMLButtonElement).disabled).toBe(true);
  expect(setAuthority).not.toHaveBeenCalled();
});

it('clears the old credential review and reads current limits on explicit refresh', async () => {
  const view = render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review permissions' })); await screen.findByRole('button', { name: 'Allow changes' });
  vi.mocked(readAuthority).mockResolvedValue({ version: 0, enabled: false, limits: null, utc_day: '2026-10-10', usage: [] });
  useAuthStore.setState({ token: 'different-session' }); view.rerender(<SellerAuthority />);
  expect(screen.queryByRole('button', { name: 'Allow changes' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh permissions' }));
  await screen.findByText(/Authority version 0/);
  expect(screen.queryByRole('button', { name: 'Allow changes' })).toBeNull();
});







it.each(['RECENT_LOGIN_REQUIRED', 'SECOND_FACTOR_REQUIRED', 'SECOND_FACTOR_ENROLLMENT_REQUIRED'])('shows refresh only for legacy %s', async detail => {
  vi.mocked(reviewAuthority).mockRejectedValueOnce({ response: { status: 403, data: { detail } } });
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review permissions' }));
  await screen.findByText('Please refresh the page and try again.');
  expect(screen.queryByRole('dialog')).toBeNull(); expect(checkCompanySignIn).not.toHaveBeenCalled();
});

it('keeps every budget row and value inside a closed native Details disclosure', async () => {
  render(<SellerAuthority />);
  await screen.findByText(/Authority version 4/);
  const summary = screen.getByText('Limits and usage details', { selector: 'summary' });
  const details = summary.closest('details')!;
  expect(details.hasAttribute('open')).toBe(false);
  expect(summary.parentElement).toBe(details);
  fireEvent.click(summary);
  expect(details.hasAttribute('open')).toBe(true);
  const table = within(details).getByRole('table', { name: 'Shared daily limits (UTC)' });
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Operation', 'Limit', 'Reserved', 'Succeeded', 'Remaining']);
  expect(within(table).getAllByRole('row').slice(1).map(row => row.textContent)).toEqual(['Edit0000', 'Publish5081230', 'Unpublish0000']);
  fireEvent.click(summary);
  expect(details.hasAttribute('open')).toBe(false);
});

it('keeps review, allow and stop buttons connected to their original requests', async () => {
  render(<SellerAuthority />);
  await screen.findByText(/Authority version 4/);
  fireEvent.click(screen.getByRole('button', { name: 'Review permissions' }));
  const allow = await screen.findByRole('button', { name: 'Allow changes' });
  expect(reviewAuthority).toHaveBeenCalledTimes(1);
  expect(setAuthority).not.toHaveBeenCalled();
  expect(reviewStopAuthority).not.toHaveBeenCalled();
  fireEvent.click(allow);
  await waitFor(() => expect(setAuthority).toHaveBeenCalledWith({ ...vi.mocked(reviewAuthority).mock.calls[0][0], review_hash: hash }));
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review stopping assistant changes' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Review stopping assistant changes' }));
  const stop = await screen.findByRole('button', { name: 'Stop all automatic assistant changes' });
  expect(reviewStopAuthority).toHaveBeenCalledTimes(1);
  expect(stopAuthority).not.toHaveBeenCalled();
  fireEvent.click(stop);
  await waitFor(() => expect(stopAuthority).toHaveBeenCalledWith({ ...vi.mocked(reviewStopAuthority).mock.calls[0][0], review_hash: hash }));
  expect(setAuthority).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toBe('Automatic assistant changes stopped. Changes already completed will stay in place.');
});

it('describes only currently allowed operations with a local expiry date', async () => {
  render(<SellerAuthority />);
  const expiry = new Date(limits.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  await screen.findByText(`Your AI assistant can publish some of your listings, within the limits below, until ${expiry}.`);
});

it.each([false, true])('shows the off status for disabled or expired permissions (expired: %s)', async expired => {
  vi.mocked(readAuthority).mockResolvedValue({ ...authority, enabled: expired, limits: { ...limits, expires_at: expired ? '2020-01-01T00:00:00Z' : limits.expires_at } });
  render(<SellerAuthority />);
  await screen.findByText("Your AI assistant can't change your listings right now.");
  expect(screen.getByText(/Authority version 4 · Off or expired/)).toBeTruthy();
  expect(screen.queryByText(/Authority version 4 · Active/)).toBeNull();
});

it.each([
  { operations: ['update', 'publish'], words: 'edit and publish' },
  { operations: ['update', 'publish', 'unpublish'], words: 'edit, publish and unpublish' },
] as const)('joins allowed operations with and: $words', async ({ operations, words }) => {
  vi.mocked(readAuthority).mockResolvedValue({ ...authority, limits: { ...limits, operations: [...operations], daily_items: { update: 50, publish: 50, unpublish: 50 } } });
  render(<SellerAuthority />);
  const expiry = new Date(limits.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  await screen.findByText(`Your AI assistant can ${words} some of your listings, within the limits below, until ${expiry}.`);
});

it.each([42, 50])('explains when an allowed operation has zero remaining, including reservations (succeeded: %s)', async success => {
  vi.mocked(readAuthority).mockResolvedValue({ ...authority, usage: [{ action: 'aim.listing.publish', reserved: 8, success }] });
  render(<SellerAuthority />);
  await screen.findByText('Today’s publish limit has been reached.');
  expect(screen.queryByText('Today’s edit limit has been reached.')).toBeNull();
  expect(screen.queryByText('Today’s unpublish limit has been reached.')).toBeNull();
  expect(screen.getByText(/Authority version 4 · Active/)).toBeTruthy();
  fireEvent.click(screen.getByText('Limits and usage details', { selector: 'summary' }));
  const row = screen.getByText('Publish', { selector: 'th' }).closest('tr')!;
  expect(within(row).getAllByRole('cell').at(-1)?.textContent).toBe('0');
});
