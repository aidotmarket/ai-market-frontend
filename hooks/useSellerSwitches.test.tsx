// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { getSellerCapability } from '@/api/pending-actions';
import { sellerSwitchReport, useSellerSwitches } from './useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { id } from '@/tests/fixtures/seller-authority';
vi.mock('@/api/pending-actions', async original => ({ ...await original<typeof import('@/api/pending-actions')>(), getSellerCapability: vi.fn() }));
const linkToken = 'A'.repeat(43);
const admission = () => ({ effective: true, reason: null, checked_at: new Date().toISOString(), switch_snapshot: { connector_enabled: true, action_path_enabled: true, seller_enabled: true, seller_bulk_enabled: true, global_enabled: true, profile_enabled: true, tool_enabled: true } });
beforeEach(() => { vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99) } as User, token: 'session' }); window.history.replaceState({}, '', '/dashboard/settings'); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
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
