// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ activity: vi.fn(), capability: vi.fn(), retry: vi.fn() }));
vi.mock('@/api/pending-actions', async original => ({ ...await original<typeof import('@/api/pending-actions')>(), getSellerActivity: mocks.activity, getSellerCapability: mocks.capability, retrySellerFailures: mocks.retry }));
import SellerOperationActivity from './SellerOperationActivity';
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const token = 'a'.repeat(42) + 'A';
const admission = () => ({ effective: true, reason: null, checked_at: new Date().toISOString(), switch_snapshot: { connector_enabled: true, action_path_enabled: true, seller_enabled: true, seller_bulk_enabled: true, global_enabled: true, profile_enabled: true, tool_enabled: true } });
const page = () => ({ operation: { operation_id: uuid(99), execution_status: 'partial', failed_count: 1 }, items: ['failed', 'succeeded', 'no_change', 'blocked', 'cancelled'].map((status, i) => ({ id: uuid(i + 10), target_id: uuid(i + 1), result_index: i, status, summary: `Seller item ${status}.` })), offset: 0, limit: 20, has_more: true, next_cursor: 'opaque_trimmed_cursor' });
beforeEach(() => { vi.resetAllMocks(); mocks.activity.mockResolvedValue(page()); mocks.capability.mockImplementation(async () => admission()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const view = () => render(<SellerOperationActivity operationId={uuid(99)} pendingId={uuid(98)} token={token} />);
it('consumes opaque paging unchanged and stops at has_more=false after a trimmed prefix', async () => {
  view(); await screen.findByRole('button', { name: 'Next activity page' });
  mocks.activity.mockResolvedValue({ ...page(), items: [], has_more: false });
  fireEvent.click(screen.getByRole('button', { name: 'Next activity page' }));
  await waitFor(() => expect(mocks.activity).toHaveBeenCalledWith(uuid(99), 'opaque_trimmed_cursor'));
  // Refresh the same cursor page; do not synthesize an offset or skip children.
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Next activity page' })).toBeNull());
});
it('selects only failed targets and prepares one fresh review without confirming it', async () => {
  const path = `/confirm/${uuid(97)}?t=${token}`;
  mocks.retry.mockResolvedValue({ outcome: { confirmation_url: path }, pending: { id: uuid(97) } });
  view(); const checkbox = await screen.findByRole('checkbox');
  await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole('button', { name: 'Prepare failed-only retry' }));
  const link = await screen.findByRole('link', { name: 'Review new retry batch' });
  expect(link.getAttribute('href')).toBe(path);
  expect(mocks.retry).toHaveBeenCalledExactlyOnceWith(uuid(98), token, [uuid(1)], expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/));
  expect((screen.getByRole('button', { name: 'Prepare failed-only retry' }) as HTMLButtonElement).disabled).toBe(true);
});
it('keeps receipts readable with capability off, missing or failed', async () => {
  mocks.capability.mockRejectedValue(new Error('offline')); view(); await screen.findByText('Seller item failed.');
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Prepare failed-only retry' }) as HTMLButtonElement).disabled).toBe(true);
});
it('refuses retry if effects switch off after selection', async () => {
  view(); const checkbox = await screen.findByRole('checkbox'); await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(checkbox); mocks.capability.mockResolvedValue({ ...admission(), effective: false });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare failed-only retry' }));
  await waitFor(() => expect(mocks.capability).toHaveBeenCalledTimes(2)); expect(mocks.retry).not.toHaveBeenCalled();
});
it('clears a selection when refreshing finds the member no longer failed', async () => {
  vi.useFakeTimers(); await act(async () => { view(); });
  fireEvent.click(screen.getByRole('checkbox'));
  mocks.activity.mockResolvedValue({ ...page(), items: page().items.map(item => ({ ...item, status: 'succeeded' })) });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.queryByRole('checkbox')).toBeNull(); expect(mocks.retry).not.toHaveBeenCalled();
});
it('does not issue another key after an ambiguous retry failure', async () => {
  mocks.retry.mockRejectedValue(new Error('lost response')); view(); const checkbox = await screen.findByRole('checkbox'); await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole('button', { name: 'Prepare failed-only retry' }));
  await screen.findByText(/Check pending requests/); fireEvent.click(screen.getByRole('button', { name: 'Prepare failed-only retry' }));
  expect(mocks.retry).toHaveBeenCalledTimes(1);
});
it('recovers activity after a transient failure', async () => {
  mocks.activity.mockRejectedValueOnce(new Error('offline')); vi.useFakeTimers(); await act(async () => { view(); });
  expect(screen.getByText('Activity is unavailable. Retrying…')).toBeTruthy(); await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText('Seller item failed.')).toBeTruthy();
});

it('retains explicit failed selection across pages and submits the combined set once', async () => {
  view(); const checkbox = await screen.findByRole('checkbox'); await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false)); fireEvent.click(checkbox);
  mocks.activity.mockResolvedValue({ ...page(), items: [{ ...page().items[0], id: uuid(20), target_id: uuid(6), result_index: 5 }], has_more: false });
  fireEvent.click(screen.getByRole('button', { name: 'Next activity page' }));
  const next = await screen.findByRole('checkbox', { name: `Select failed target ${uuid(6)}` }); fireEvent.click(next);
  mocks.retry.mockResolvedValue({ outcome: { status: 'denied' }, pending: null });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare failed-only retry' }));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith(uuid(98), token, [uuid(1), uuid(6)], expect.any(String)));
});
