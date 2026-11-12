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
const linkToken = 'A'.repeat(43);
const admission = () => ({ effective: true, reason: null, checked_at: new Date().toISOString(), switch_snapshot: { connector_enabled: true, action_path_enabled: true, seller_enabled: true, seller_bulk_enabled: true, global_enabled: true, profile_enabled: true, tool_enabled: true } });
beforeEach(() => { vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99) } as User, token: 'session' }); window.history.replaceState({}, '', '/dashboard/settings'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('fails closed without a link scoped native status contract', () => {
  const { result } = renderHook(useSellerSwitches); expect(result.current).toBeNull(); expect(getSellerCapability).not.toHaveBeenCalled();
});
it('reads the real Chunk 3 capability for the retained settings continuation', async () => {
  window.history.replaceState({}, '', `/dashboard/settings?redirect=${encodeURIComponent(`/confirm/${id(1)}?t=${linkToken}`)}`);
  vi.mocked(getSellerCapability).mockResolvedValue(admission());
  const { result } = renderHook(useSellerSwitches);
  await waitFor(() => expect(result.current).toEqual({ seller: true, effects: true, bulk: true }));
  expect(getSellerCapability).toHaveBeenCalledWith(id(1), linkToken);
  act(() => useAuthStore.setState({ token: null })); expect(result.current).toBeNull();
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
  expect(get).toHaveBeenCalledWith('/seller-workspace/connector-switches', { headers: nativeSession().headers });
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
