// @vitest-environment jsdom

import { StrictMode, type ReactNode } from 'react';
import type { Transaction } from '@/types';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  orderId: 'A', userId: 'buyer', txId: 'tx-A', seller: false,
  token: 'test-session-1', deferTerms: false,
}));
const calls = vi.hoisted(() => ({
  getOrder: vi.fn(), getOrderAccess: vi.fn(), getOrderEvents: vi.fn(),
  getTransaction: vi.fn(), confirmTransaction: vi.fn(), deliverTransaction: vi.fn(), toast: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: state.orderId }),
  useSearchParams: () => new URLSearchParams({ tx: state.txId }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('@/api/orders', () => ({
  getOrder: calls.getOrder, getOrderAccess: calls.getOrderAccess, getOrderEvents: calls.getOrderEvents,
}));
vi.mock('@/api/transactions', () => ({
  getTransaction: calls.getTransaction, confirmTransaction: calls.confirmTransaction, deliverTransaction: calls.deliverTransaction,
}));
vi.mock('@/lib/format', () => ({ formatPrice: (n: number) => `USD ${n}`, formatDate: (s: string) => s }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: calls.toast }) }));
vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (value: { user: { id: string }; token: string }) => unknown) =>
    selector({ user: { id: state.userId }, token: state.token }),
}));
vi.mock('@/components/legal/TermsGate', () => ({
  useTermsGate: () => ({
    ensureTermsAccepted: async (fn: () => unknown) => {
      termsCallbacks.push(fn);
      if (!state.deferTerms) return fn();
    },
    TermsGatePrompt: () => null, checkingTerms: false,
  }),
}));
// The page, downloader and stream implementation are real; only external APIs/network are fake.
const downloads = vi.hoisted(() => ({ allocate: vi.fn(), file: vi.fn() }));
vi.mock('@/api/sellerWorkspaceDownload', async (original) => ({
  ...await original<object>(), requestWorkspaceDownload: downloads.allocate, requestWorkspaceFile: downloads.file,
}));
vi.mock('@/components/orders/WorkspacePurchaseRecovery', () => ({ default: () => null }));
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({ default: () => null }));
vi.mock('@/components/orders/GatewayDeliverySection', () => ({ default: () => null }));
import OrderDetailPage from './page';

const termsCallbacks: Array<() => unknown> = [];
function tx(id: string, status: Transaction['status'] = 'delivered'): Transaction {
  return {
    id: `tx-${id}`, order_id: id, tx_number: `TX-${id}`, status, buyer_type: 'human', currency: 'usd',
    amount_cents: 2500, platform_fee_cents: 250, seller_amount_cents: 2250,
    created_at: '2026-10-19', updated_at: '2026-10-19', paid_at: null, delivered_at: null, settled_at: null, events: [],
  };
}
function deferred<T = Transaction>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { resolve, reject, promise };
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(state, { orderId: 'A', txId: 'tx-A', userId: 'buyer', seller: false, token: 'test-session-1', deferTerms: false });
  termsCallbacks.length = 0;
  calls.getOrder.mockImplementation(async (id: string) => ({
    id, buyer_id: state.seller ? 'another-buyer' : 'buyer', seller_id: state.seller ? 'buyer' : 'seller',
    listing_title: `Dataset-${id}`, amount: 25, status: 'fulfilled', workspace_delivery: true, created_at: '2026-10-19', access_expired: false,
  }));
  calls.getOrderEvents.mockResolvedValue([]);
  calls.getOrderAccess.mockResolvedValue({ can_download: false });
  calls.getTransaction.mockImplementation(async (id: string) => ({ ...tx(state.orderId, state.seller ? 'fulfilling' : 'delivered'), id }));
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});



describe('Workspace transaction retirement before download activation', () => {
  for (const outcome of ['deferred Terms', 'success', 'error'] as const) {
    it(`retires old transaction ${outcome} on same-user refresh before activation`, async () => {
      const pending = deferred();
      calls.confirmTransaction.mockReturnValue(pending.promise);
      state.deferTerms = outcome === 'deferred Terms';
      const fetcher = vi.fn(() => { throw new Error('Unexpected network before activation'); });
      vi.stubGlobal('fetch', fetcher);
      const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000002');
      vi.stubGlobal('crypto', { randomUUID });
      const create = vi.fn(() => 'blob:fake'); const revoke = vi.fn();
      vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      const page = () => <StrictMode><OrderDetailPage /></StrictMode>;
      const view = render(page());
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm Receipt' }));
      expect(screen.getByRole('button', { name: 'Continue to download' })).toBeTruthy();
      const oldTerms = termsCallbacks[termsCallbacks.length - 1];
      expect(calls.confirmTransaction).toHaveBeenCalledTimes(outcome === 'deferred Terms' ? 0 : 1);

      // Hold the new read so immediate retirement cannot be hidden by a replacement response.
      const currentRead = deferred();
      calls.getTransaction.mockReturnValue(currentRead.promise);
      state.token = 'test-session-2'; view.rerender(page());
      expect(screen.queryByText('TX-A')).toBeNull();
      expect(screen.queryByRole('heading', { name: /^Transaction$/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Continue to download' })).toBeTruthy();
      await act(async () => { currentRead.resolve(tx('A')); });
      expect(screen.getAllByRole('heading', { name: /^Transaction$/ })).toHaveLength(1);
      expect(screen.getAllByText('TX-A')).toHaveLength(1);

      const current = deferred();
      state.deferTerms = false;
      calls.confirmTransaction.mockReturnValue(current.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Receipt' }));
      await act(async () => {
        if (outcome === 'success') pending.resolve(tx('A', 'confirmed'));
        else if (outcome === 'error') pending.reject(new Error('old failure'));
        await oldTerms(); await oldTerms();
      });
      expect(calls.confirmTransaction).toHaveBeenCalledTimes(outcome === 'deferred Terms' ? 1 : 2);
      expect(calls.toast).not.toHaveBeenCalled();
      expect(screen.queryByText('Confirmed')).toBeNull();
      expect((screen.getByRole('button', { name: 'Confirming…' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getAllByRole('heading', { name: /^Transaction$/ })).toHaveLength(1);
      await act(async () => { current.resolve(tx('A', 'confirmed')); });
      expect(calls.toast).toHaveBeenCalledExactlyOnceWith('Receipt confirmed!', 'success');
      expect(calls.confirmTransaction).toHaveBeenLastCalledWith('tx-A');
      expect(screen.getByText('Confirmed')).toBeTruthy();
      expect(screen.getAllByText('TX-A')).toHaveLength(1);
      expect(screen.getAllByRole('heading', { name: /^Transaction$/ })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Continue to download' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Download files' })).toBeNull();
      expect(downloads.allocate).not.toHaveBeenCalled();
      expect(downloads.file).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(randomUUID).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
    });
  }
});

const grant = (index: number) => ({
  filename: `file-${index}.csv`, size: 3,
  url: `https://synthetic.s3.eu-west-1.amazonaws.com/file-${index}?X-Amz-SignedHeaders=host%3Bif-match`,
  headers: { 'If-Match': '"e"' }, expires_at: '2099-01-01T00:00:00Z',
});

for (const phase of ['transfer', 'file authorization'] as const) {
  for (const outcome of ['success', 'error', 'deferred Terms'] as const) {
    it(`keeps the actual download during ${phase} refresh and retires old transaction ${outcome}`, async () => {
      const pending = deferred();
      calls.confirmTransaction.mockReturnValue(pending.promise);
      const authorization = deferred<ReturnType<typeof grant>>();
      downloads.allocate.mockResolvedValue({
        delivery_type: 'workspace_direct', session_id: '00000000-0000-4000-8000-000000000001',
        download_number: 1, downloads_remaining: 2,
        files: [0, 1].map(index => ({ index, filename: `file-${index}.csv`, size: 3 })),
      });
      downloads.file.mockImplementation(async (_order, _session, index) =>
        index === 1 && phase === 'file authorization' ? authorization.promise : grant(index));
      let transfer!: ReadableStreamDefaultController<Uint8Array>;
      const fetcher = vi.fn(async (url: string) => new Response(
        url.includes('file-0') ? new Uint8Array([1, 2, 3]) : new ReadableStream<Uint8Array>({
          start(controller) { transfer = controller; controller.enqueue(new Uint8Array([1])); },
        }), { status: 200 }));
      vi.stubGlobal('fetch', fetcher);
      vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000002') });
      const create = vi.fn(() => 'blob:fake'); const revoke = vi.fn();
      vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      const page = () => <StrictMode><OrderDetailPage /></StrictMode>;
      const view = render(page());
      fireEvent.click(await screen.findByRole('button', { name: 'Continue to download' }));
      await screen.findByRole('button', { name: 'Download files' });
      // Freeze only the Blob cleanup timer; no retries/timeouts are extended.
      vi.useFakeTimers();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download files' })); });
      expect(downloads.file).toHaveBeenCalledTimes(2);
      const progress = screen.getByRole('status').textContent;
      expect(progress).toContain(phase === 'transfer' ? 'file-1.csv: 1 of 3 bytes' : 'file-0.csv: 3 of 3 bytes');
      expect(create).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      const signal: AbortSignal = downloads.allocate.mock.calls[0][1];
      expect(downloads.file.mock.calls[1][3]).toBe(signal);
      state.deferTerms = outcome === 'deferred Terms';
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm Receipt' })); });
      const oldTerms = termsCallbacks[termsCallbacks.length - 1];
      expect(calls.confirmTransaction).toHaveBeenCalledTimes(outcome === 'deferred Terms' ? 0 : 1);

      state.token = 'test-session-2'; view.rerender(page());
      expect(screen.queryByText('TX-A')).toBeNull(); // synchronous old transaction hiding
      expect(signal.aborted).toBe(false);
      expect(screen.getByRole('status').textContent).toBe(progress);
      expect(screen.getByRole('button', { name: 'Cancel download' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Continue to download' })).toBeNull();
      expect(downloads.allocate).toHaveBeenCalledTimes(1);
      expect(downloads.file).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenCalledTimes(1);
      expect(revoke).not.toHaveBeenCalled();
      await act(async () => {});
      expect(screen.getByText('TX-A')).toBeTruthy();
      const current = deferred();
      state.deferTerms = false; calls.confirmTransaction.mockReturnValue(current.promise);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm Receipt' })); });
      await act(async () => {
        if (outcome === 'success') pending.resolve(tx('A', 'confirmed'));
        else if (outcome === 'error') pending.reject(new Error('old failure'));
        await oldTerms(); await oldTerms();
      });
      expect(calls.toast).not.toHaveBeenCalled();
      expect(screen.queryByText('Confirmed')).toBeNull();
      expect((screen.getByRole('button', { name: 'Confirming…' }) as HTMLButtonElement).disabled).toBe(true);
      expect(calls.confirmTransaction).toHaveBeenCalledTimes(outcome === 'deferred Terms' ? 1 : 2);
      expect(signal.aborted).toBe(false);
      expect(screen.getByRole('status').textContent).toBe(progress);
      expect(revoke).not.toHaveBeenCalled();
      await act(async () => {
        if (phase === 'file authorization') authorization.resolve(grant(1));
      });
      await act(async () => { transfer.enqueue(new Uint8Array([2, 3])); transfer.close(); });
      expect(screen.getByRole('status').textContent).toContain('Saved 2 files');
      expect(screen.queryByRole('button', { name: 'Cancel download' })).toBeNull();
      expect(downloads.allocate).toHaveBeenCalledTimes(1);
      expect(downloads.file).toHaveBeenCalledTimes(2);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(click).toHaveBeenCalledTimes(2);
      expect(revoke).toHaveBeenCalledTimes(1); // first URL retired by second completed file
      await act(async () => { current.resolve(tx('A', 'confirmed')); });
      expect(calls.toast).toHaveBeenCalledExactlyOnceWith('Receipt confirmed!', 'success');
      await act(async () => { vi.advanceTimersByTime(30000); });
      expect(revoke).toHaveBeenCalledTimes(2);
      state.token = 'test-session-3';
      await act(async () => { view.rerender(page()); });
      expect(screen.getByRole('status').textContent).toContain('Saved 2 files');
      expect(downloads.allocate).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(2);
      expect(revoke).toHaveBeenCalledTimes(2);
    });
  }
}

it('retires deferred download activation Terms on refresh without allocating a download', async () => {
  state.deferTerms = true;
  const view = render(<StrictMode><OrderDetailPage /></StrictMode>);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to download' }));
  const oldTerms = termsCallbacks[0];
  state.token = 'test-session-2'; view.rerender(<StrictMode><OrderDetailPage /></StrictMode>);
  await act(async () => { await oldTerms(); await oldTerms(); });
  expect(screen.queryByRole('button', { name: 'Download files' })).toBeNull();
  expect(downloads.allocate).not.toHaveBeenCalled();
  state.deferTerms = false;
  fireEvent.click(screen.getByRole('button', { name: 'Continue to download' }));
  expect(await screen.findByRole('button', { name: 'Download files' })).toBeTruthy();
  expect(downloads.allocate).not.toHaveBeenCalled();
});

for (const reason of ['order', 'query', 'account', 'unmount'] as const) {
  it(`retires the actual downloader on ${reason} change`, async () => {
    const allocation = deferred();
    downloads.allocate.mockReturnValue(allocation.promise);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000002') });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
    const view = render(<StrictMode><OrderDetailPage /></StrictMode>);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to download' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download files' }));
    expect(downloads.allocate).toHaveBeenCalledTimes(1);
    const signal: AbortSignal = downloads.allocate.mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    if (reason === 'unmount') view.unmount();
    else {
      if (reason === 'order') { state.orderId = 'B'; state.txId = 'tx-B'; }
      if (reason === 'query') state.txId = 'other-tx-A';
      if (reason === 'account') state.userId = 'other-user';
      view.rerender(<StrictMode><OrderDetailPage /></StrictMode>);
    }
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel download' })).toBeNull();
    await act(async () => { allocation.reject(new Error('Fake aborted allocation')); });
    expect(downloads.allocate).toHaveBeenCalledTimes(1);
    expect(downloads.file).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Download files' })).toBeNull();
  });
}
