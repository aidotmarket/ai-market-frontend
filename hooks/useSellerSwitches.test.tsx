// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { getSellerCapability } from '@/api/pending-actions';
import { sellerSwitchReport, workspaceSellerSwitchReport, useSellerSwitches } from './useSellerSwitches';
import { nativeClient, nativeSession } from '@/api/connector-seller-settings';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { id } from '@/tests/fixtures/seller-authority';
vi.mock('@/api/pending-actions', async original => ({ ...await original<typeof import('@/api/pending-actions')>(), getSellerCapability: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
const linkToken = 'A'.repeat(43);
const admission = () => ({ effective: true, reason: null, checked_at: new Date().toISOString(), switch_snapshot: { connector_enabled: true, action_path_enabled: true, seller_enabled: true, seller_bulk_enabled: true, global_enabled: true, profile_enabled: true, tool_enabled: true } });
const switchRequest = () => ({ headers: nativeSession().headers, signal: expect.any(AbortSignal) });
beforeEach(() => { vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99) } as User, token: 'session' }); window.history.replaceState({}, '', '/dashboard/settings'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it.each(['/dashboard/settings', '/dashboard/settings?redirect=%2Fconfirm%2Finvalid'])('reads the authenticated switch report on ordinary Settings (%s)', async route => {
  window.history.replaceState({}, '', route);
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data: { seller: true, floors: true, bulk: false } });
  const { result } = renderHook(useSellerSwitches);
  await waitFor(() => expect(result.current).toEqual({ seller: true, effects: true, bulk: false, profiles: {} }));
  expect(get).toHaveBeenCalledExactlyOnceWith('/seller-workspace/connector-switches', switchRequest());
  expect(getSellerCapability).not.toHaveBeenCalled();
});
it('reads the real Chunk 3 capability for the retained settings continuation', async () => {
  window.history.replaceState({}, '', `/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${id(1)}?t=${linkToken}`)}`);
  const get = vi.spyOn(nativeClient, 'get').mockRejectedValue(new Error('Unexpected switch read'));
  vi.mocked(getSellerCapability).mockResolvedValue(admission());
  const { result } = renderHook(useSellerSwitches);
  await waitFor(() => expect(result.current).toEqual({ seller: true, effects: true, bulk: true }));
  expect(getSellerCapability).toHaveBeenCalledWith(id(1), linkToken);
  expect(get).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ token: null })); expect(result.current).toBeNull();
});
it('clears the ordinary Settings report on a qualifying continuation without falling back on failure', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data: { seller: true, floors: true, bulk: true } });
  const { result, rerender } = renderHook(useSellerSwitches);
  await waitFor(() => expect(result.current?.effects).toBe(true));

  vi.mocked(getSellerCapability).mockRejectedValue(new Error('Unavailable continuation'));
  window.history.pushState({}, '', `/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${id(1)}?t=${linkToken}`)}`);
  rerender();
  await act(async () => {});
  expect(result.current).toBeNull();
  expect(getSellerCapability).toHaveBeenCalledExactlyOnceWith(id(1), linkToken);
  expect(get).toHaveBeenCalledTimes(1);
});
it('retires the Settings report on client navigation and reads Workspace independently', async () => {
  const data = { seller: true, floors: true, bulk: false };
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data });
  const { result, rerender } = renderHook(useSellerSwitches);
  await waitFor(() => expect(result.current?.effects).toBe(true));

  window.history.pushState({}, '', '/dashboard/orders?redirect=%2Fdashboard%2Fsettings');
  rerender();
  expect(result.current).toBeNull();
  expect(get.mock.calls[0][1]?.signal?.aborted).toBe(true);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(get).toHaveBeenCalledTimes(1);
  expect(getSellerCapability).not.toHaveBeenCalled();

  get.mockResolvedValue({ status: 200, data: { ...data, floors: false } });
  window.history.pushState({}, '', '/dashboard/seller-workspace');
  rerender();
  expect(result.current).toBeNull();
  await waitFor(() => expect(result.current?.effects).toBe(false));
  expect(get).toHaveBeenCalledTimes(2);
});
it.each([{ token: 'rotated-session' }, { user: { id: id(98) } as User }])('drops old Settings data and late replies on auth changes (%j)', async auth => {
  vi.useFakeTimers();
  const data = { seller: true, floors: true, bulk: true };
  let resolveOld!: (reply: { status: number; data: typeof data }) => void;
  const old = new Promise<{ status: number; data: typeof data }>(resolve => { resolveOld = resolve; });
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValueOnce({ status: 200, data })
    .mockReturnValueOnce(old).mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(useSellerSwitches);
  await act(async () => {});
  expect(result.current?.effects).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  act(() => useAuthStore.setState(auth));
  expect(result.current).toBeNull();
  expect(get).toHaveBeenCalledTimes(3);
  expect(get).toHaveBeenLastCalledWith('/seller-workspace/connector-switches', switchRequest());
  await act(async () => resolveOld({ status: 200, data }));
  expect(result.current).toBeNull();
});
it('keeps explicit off distinct from malformed, failed or stalled Settings reads', async () => {
  vi.useFakeTimers();
  const data = { seller: true, floors: false, bulk: true };
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data });
  const { result } = renderHook(useSellerSwitches);
  const poll = () => act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  await act(async () => {});
  expect(result.current?.effects).toBe(false);
  get.mockResolvedValueOnce({ status: 200, data: { ...data, floors: 'true' } });
  await poll();
  expect(result.current).toBeNull();
  await poll();
  expect(result.current?.effects).toBe(false);
  get.mockRejectedValueOnce(new Error('offline'));
  await poll();
  expect(result.current).toBeNull();
  await poll();
  expect(result.current?.effects).toBe(false);
  get.mockReturnValue(new Promise(() => {}));
  await poll();
  await poll();
  expect(result.current).toBeNull();
});
it.each(['missing', 'stale', 'disabled', 'malformed'])('refuses %s status', reason => {
  const data = admission();
  if (reason === 'stale') data.checked_at = '2020-01-01T00:00:00Z';
  if (reason === 'disabled') data.switch_snapshot.seller_enabled = false;
  if (reason === 'malformed') data.switch_snapshot.tool_enabled = undefined as never;
  expect(sellerSwitchReport(reason === 'missing' ? null : data)).toBeNull();
});
it('closes effects when polling fails or stalls and recovers on a fresh report', async () => {
  window.history.replaceState({}, '', `/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${id(1)}?t=${linkToken}`)}`);
  vi.useFakeTimers(); vi.mocked(getSellerCapability).mockResolvedValue(admission());
  const { result } = renderHook(useSellerSwitches); await act(async () => {});
  expect(result.current?.effects).toBe(true);
  vi.mocked(getSellerCapability).mockReturnValue(new Promise(() => {}));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); expect(result.current).toBeNull();
  vi.mocked(getSellerCapability).mockRejectedValue(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(result.current).toBeNull();
  vi.mocked(getSellerCapability).mockResolvedValue(admission());
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(result.current?.effects).toBe(true);
});

it('immediately closes effects when a successful poll reports shutdown', async () => {
  window.history.replaceState({}, '', `/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${id(1)}?t=${linkToken}`)}`);
  vi.useFakeTimers(); vi.mocked(getSellerCapability).mockResolvedValue(admission());
  const { result } = renderHook(useSellerSwitches); await act(async () => {}); expect(result.current?.effects).toBe(true);
  vi.mocked(getSellerCapability).mockResolvedValue({ ...admission(), effective: false, reason: 'SELLER_DISABLED' as never });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(result.current).toBeNull();
});

const workspaceSwitches = { seller: true, bulk: true, floors: false };
const profiles = { claude: { floors: false, seller_mode: 'full' }, openai: { floors: true, seller_mode: 'fallback' } };
it.each([
  ['absent', undefined], ['empty', {}], ['null', null], ['array', []], ['string', 'full'], ['boolean', true],
  ['null entry', { openai: null }], ['array entry', { openai: [] }], ['missing mode', { openai: { floors: true } }],
  ['invalid mode', { openai: { floors: false, seller_mode: 'paused' } }],
  ['valid off with bad sibling', { openai: { floors: false, seller_mode: 'off' }, claude: null }],
  ['nonboolean floors', { openai: { floors: 'true', seller_mode: 'full' } }],
  ['partly malformed', { ...profiles, claude: { floors: false, seller_mode: false } }],
])('reads workspace booleans with an empty profile map when profiles are %s', async (_name, value) => {
  window.history.replaceState({}, '', '/dashboard/seller-workspace');
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data: { ...workspaceSwitches, floors: true, profiles: value } });
  const { result } = renderHook(useSellerSwitches);
  await waitFor(() => expect(result.current).toEqual({ seller: true, bulk: true, effects: true, profiles: {} }));
  expect(get).toHaveBeenCalledWith('/seller-workspace/connector-switches', switchRequest());
  expect(getSellerCapability).not.toHaveBeenCalled();
});
it('retains both profile modes and floors without replacing the legacy Claude floors', async () => {
  window.history.replaceState({}, '', '/dashboard/seller-workspace');
  vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data: { ...workspaceSwitches, profiles } });
  const { result } = renderHook(useSellerSwitches);
  await waitFor(() => expect(result.current).toEqual({ seller: true, bulk: true, effects: false, profiles }));
});
it.each(['full', 'fallback', 'off'])('parses the ChatGPT %s mode', seller_mode => {
  const profiles = { openai: { floors: true, seller_mode } };
  expect(workspaceSellerSwitchReport({ ...workspaceSwitches, profiles })?.profiles).toEqual(profiles);
});
it.each(['seller', 'bulk', 'floors'])('still requires a boolean workspace %s even with valid profiles', field => {
  for (const bad of [undefined, null, 1, 'true'])
    expect(workspaceSellerSwitchReport({ ...workspaceSwitches, [field]: bad, profiles })).toBeNull();
});
it.each([null, undefined, false, 'invalid', []])('ignores malformed workspace data %j', value => {
  expect(workspaceSellerSwitchReport(value)).toBeNull();
});
it('replaces profile state on polling and clears it on a failed read', async () => {
  window.history.replaceState({}, '', '/dashboard/seller-workspace');
  vi.useFakeTimers();
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data: { ...workspaceSwitches, profiles } });
  const { result } = renderHook(useSellerSwitches); await act(async () => {});
  expect(result.current?.profiles).toEqual(profiles);
  get.mockResolvedValue({ status: 200, data: { ...workspaceSwitches, profiles: { openai: { floors: true, seller_mode: 'off' } } } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current?.profiles).toEqual({ openai: { floors: true, seller_mode: 'off' } });
  get.mockRejectedValue(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current).toBeNull();
});

it.each([true, false])('keeps availability from top-level floors (%s) through valid-to-malformed profile polling', async floors => {
  window.history.replaceState({}, '', '/dashboard/seller-workspace');
  vi.useFakeTimers();
  const data = { seller: true, bulk: true, floors, profiles: { openai: { floors: false, seller_mode: 'off' } } };
  const get = vi.spyOn(nativeClient, 'get').mockResolvedValue({ status: 200, data });
  const { result } = renderHook(useSellerSwitches); await act(async () => {});
  expect(result.current).toEqual({ seller: true, bulk: true, effects: floors, profiles: data.profiles });
  get.mockResolvedValue({ status: 200, data: { ...data, profiles: { ...data.profiles, claude: null } } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current).toEqual({ seller: true, bulk: true, effects: floors, profiles: {} });
});
