// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SellerAuthority from './SellerAuthority';
import { nativeClient, readAuthority, type AuthorityStatus } from '@/api/connector-seller-settings';
import { useAuthStore } from '@/store/auth';
import { authority, id, limits } from '@/tests/fixtures/seller-authority';

// Keep the real read adapter, validation and native session guard. Only GET transport is supplied.
vi.mock('@/hooks/useSellerSwitches', () => ({ useSellerSwitches: () => ({ seller: true, effects: true, bulk: true }) }));
function deferred() {
  let resolve!: (value: { data: AuthorityStatus }) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<{ data: AuthorityStatus }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const latest: AuthorityStatus = { ...authority, version: 9, utc_day: '2026-10-16',
  limits: { ...limits, max_batch: 7, daily_items: { publish: 70 } },
  usage: [{ action: 'aim.listing.publish', reserved: 3, success: 4 }] };
const refresh = () => fireEvent.click(screen.getByRole('button', { name: 'Refresh authority and budget' }));
function expectLatest() {
  expect(screen.getByText(/Authority version 9.*UTC day 2026-10-16/)).toBeTruthy();
  const row = within(screen.getByRole('table')).getByText('publish', { selector: 'th' }).closest('tr')!;
  expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['70', '3', '4', '63']);
  expect((screen.getByLabelText('max batch') as HTMLInputElement).value).toBe('7');
  expect((screen.getByLabelText('Daily publish items') as HTMLInputElement).value).toBe('70');
}
beforeEach(() => {
  useAuthStore.setState({ user: { id: id(99) } as never, token: 'owned-fixture-session-1' });
  vi.spyOn(nativeClient, 'post').mockRejectedValue(new Error('No mutations permitted in this read fixture'));
});
afterEach(() => {
  cleanup();
  expect(nativeClient.post).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

// Reuses both ROOT causal cases, with additional assertions for shared budget and editable limits.
it('keeps the newest authority, budget and limits after an older manual refresh finishes', async () => {
  const old = deferred(), current = deferred();
  const get = vi.spyOn(nativeClient, 'get').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  render(<SellerAuthority />); refresh();
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => current.resolve({ data: latest })); expectLatest();
  await act(async () => old.resolve({ data: authority })); expectLatest();
});

it('suppresses an obsolete same-session failure after a later successful refresh', async () => {
  const old = deferred(), current = deferred();
  vi.spyOn(nativeClient, 'get').mockResolvedValueOnce({ data: authority }).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  refresh(); refresh();
  await act(async () => current.resolve({ data: latest }));
  await act(async () => old.reject(new Error('old GET failed')));
  expectLatest(); expect(screen.queryByRole('alert')).toBeNull();
});

it('does not display an obsolete SESSION_CHANGED error after the new session read succeeds', async () => {
  const old = deferred(), current = deferred();
  const get = vi.spyOn(nativeClient, 'get').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  render(<SellerAuthority />);
  await act(async () => useAuthStore.setState({ token: 'owned-fixture-session-2' }));
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => current.resolve({ data: latest })); expectLatest();
  // The unchanged native helper converts this old-session response into SESSION_CHANGED.
  await act(async () => old.resolve({ data: authority }));
  expectLatest(); expect(screen.queryByRole('alert')).toBeNull();
});

it('retains the native helper rejection of old-session data', async () => {
  const old = deferred(); vi.spyOn(nativeClient, 'get').mockReturnValueOnce(old.promise);
  const result = readAuthority();
  useAuthStore.setState({ token: 'owned-fixture-session-2' });
  old.resolve({ data: authority });
  await expect(result).rejects.toThrow('SESSION_CHANGED');
});

it.each([false, true])('keeps a current failure visible and recovers with normal Refresh (prior data: %s)', async priorData => {
  const current = deferred();
  const get = vi.spyOn(nativeClient, 'get');
  if (priorData) get.mockResolvedValueOnce({ data: authority });
  get.mockReturnValueOnce(current.promise).mockResolvedValueOnce({ data: latest });
  render(<SellerAuthority />);
  if (priorData) { await screen.findByText(/Authority version 4/); refresh(); }
  await act(async () => current.reject(new Error('current GET failed')));
  expect(screen.getByRole('alert')).toBeTruthy();
  if (priorData) {
    expect(screen.getByText(/Authority version 4/)).toBeTruthy();
    expect((screen.getByLabelText('max batch') as HTMLInputElement).value).toBe('50');
  } else expect(screen.queryByText(/Authority version/)).toBeNull();
  refresh(); await screen.findByText(/Authority version 9/);
  expectLatest(); expect(screen.queryByRole('alert')).toBeNull();
});

it('does not let an obsolete success replace last data or clear the current failure', async () => {
  const old = deferred(), current = deferred();
  vi.spyOn(nativeClient, 'get').mockResolvedValueOnce({ data: authority }).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  render(<SellerAuthority />); await screen.findByText(/Authority version 4/);
  refresh(); refresh();
  await act(async () => current.reject(new Error('current GET failed')));
  await act(async () => old.resolve({ data: latest }));
  expect(screen.getByText(/Authority version 4/)).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
});

it.each(['success', 'failure'])('invalidates reads across effect cleanup even when mounted again (%s)', async outcome => {
  const old = deferred(), current = deferred();
  const get = vi.spyOn(nativeClient, 'get').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  render(<StrictMode><SellerAuthority /></StrictMode>);
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => {
    if (outcome === 'success') old.resolve({ data: authority }); else old.reject(new Error('obsolete effect'));
  });
  expect(screen.queryByText(/Authority version/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => current.resolve({ data: latest })); expectLatest();
});

it.each(['success', 'failure'])('settles an outstanding read safely after unmount (%s)', async outcome => {
  const old = deferred(); vi.spyOn(nativeClient, 'get').mockReturnValueOnce(old.promise);
  const view = render(<SellerAuthority />); view.unmount();
  await act(async () => {
    if (outcome === 'success') old.resolve({ data: authority }); else old.reject(new Error('unmounted GET'));
  });
  expect(screen.queryByRole('region', { name: 'Seller standing authority' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
