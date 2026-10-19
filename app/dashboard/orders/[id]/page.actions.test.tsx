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
vi.mock('@/components/orders/WorkspaceDownload', () => ({ default: () => null }));
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
    listing_title: `Dataset-${id}`, amount: 25, status: 'pending_fulfillment', created_at: '2026-10-19', access_expired: false,
  }));
  calls.getOrderEvents.mockResolvedValue([]);
  calls.getOrderAccess.mockResolvedValue({ can_download: false });
  calls.getTransaction.mockImplementation(async (id: string) => ({ ...tx(state.orderId, state.seller ? 'fulfilling' : 'delivered'), id }));
});
afterEach(cleanup);

describe('order detail action visit ownership', () => {
  // Retain the original actual-page baseline reproductions and same-order control.
  for (const mode of ['confirm', 'deliver'] as const) {
    it(`${mode}: keeps the new order transaction when the old action completes`, async () => {
      state.seller = mode === 'deliver';
      const pending = deferred();
      const method = mode === 'confirm' ? calls.confirmTransaction : calls.deliverTransaction;
      method.mockReturnValue(pending.promise);
      const view = render(<OrderDetailPage />);
      fireEvent.click(await screen.findByRole('button', { name: mode === 'confirm' ? 'Confirm Receipt' : 'Mark Delivered' }));
      await act(async () => {});
      expect(method.mock.calls[0][0]).toBe('tx-A');
      state.orderId = 'B'; state.txId = 'tx-B'; view.rerender(<OrderDetailPage />);
      expect(await screen.findByText('TX-B')).toBeTruthy();
      await act(async () => pending.resolve(tx('A', mode === 'confirm' ? 'confirmed' : 'delivered')));
      expect(screen.getByText('Dataset-B')).toBeTruthy();
      expect(screen.queryByText('TX-A')).toBeNull();
      expect(screen.getByText('TX-B')).toBeTruthy();
      expect(calls.toast).not.toHaveBeenCalled();
      expect(method).toHaveBeenCalledTimes(1);
    });
  }
  it('control: updates a completed action for the same order', async () => {
    const pending = deferred(); calls.confirmTransaction.mockReturnValue(pending.promise);
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Receipt' }));
    await act(async () => pending.resolve(tx('A', 'confirmed')));
    expect(screen.getByText('TX-A')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(calls.toast).toHaveBeenCalledExactlyOnceWith('Receipt confirmed!', 'success');
  });
});

for (const mode of ['confirm', 'deliver'] as const) {
  const label = mode === 'confirm' ? 'Confirm Receipt' : 'Mark Delivered';
  const busyLabel = mode === 'confirm' ? 'Confirming…' : 'Marking…';
  const success = mode === 'confirm' ? 'Receipt confirmed!' : 'Marked as delivered!';
  const failure = mode === 'confirm' ? 'Failed to confirm receipt.' : 'Failed to mark as delivered.';
  const completed = mode === 'confirm' ? 'confirmed' : 'delivered';
  const method = () => mode === 'confirm' ? calls.confirmTransaction : calls.deliverTransaction;
  const page = () => <StrictMode><OrderDetailPage /></StrictMode>;
  const begin = async () => {
    state.seller = mode === 'deliver';
    const pending = deferred();
    method().mockReturnValue(pending.promise);
    const view = render(page());
    fireEvent.click(await screen.findByRole('button', { name: label }));
    return { pending, view };
  };
  const retire = async (reason: string, view: ReturnType<typeof render>) => {
    if (reason === 'unmount') { view.unmount(); return; }
    if (reason === 'user') state.userId = 'other-user';
    else if (reason === 'session') state.token = 'test-session-2';
    else if (reason === 'query') state.txId = 'other-tx-A';
    else { state.orderId = 'B'; state.txId = 'tx-B'; }
    view.rerender(page());
    // The old transaction must disappear before any new read resolves.
    expect(screen.queryByText('TX-A')).toBeNull();
    await screen.findByText(`Dataset-${state.orderId}`);
    if (reason === 'return') {
      state.orderId = 'A'; state.txId = 'tx-A'; view.rerender(page());
      await screen.findByText('TX-A');
    }
  };
  describe(`${mode} lifecycle under StrictMode`, () => {
    for (const reason of ['route', 'return', 'query', 'user', 'session', 'unmount']) {
      for (const outcome of ['success', 'rejection']) {
        it(`ignores late ${outcome} after ${reason} retirement without clearing a new action`, async () => {
          const { pending, view } = await begin();
          await retire(reason, view);
          const current = deferred();
          if (reason !== 'unmount' && reason !== 'user') {
            method().mockReturnValue(current.promise);
            fireEvent.click(await screen.findByRole('button', { name: label }));
          }
          await act(async () => {
            if (outcome === 'success') pending.resolve(tx('A', completed));
            else pending.reject(new Error('old request failed'));
          });
          expect(calls.toast).not.toHaveBeenCalled();
          if (reason !== 'unmount' && reason !== 'user') {
            expect((screen.getByRole('button', { name: busyLabel }) as HTMLButtonElement).disabled).toBe(true);
            expect(screen.getByText(`TX-${state.orderId}`)).toBeTruthy();
            await act(async () => current.resolve({ ...tx(state.orderId, completed), id: state.txId }));
            expect(calls.toast).toHaveBeenCalledExactlyOnceWith(success, 'success');
            expect(method()).toHaveBeenCalledTimes(2);
          } else expect(method()).toHaveBeenCalledTimes(1);
        });
      }
      it(`does not dispatch a deferred Terms callback after ${reason} retirement`, async () => {
        state.deferTerms = true;
        const { view } = await begin();
        const callback = termsCallbacks[0];
        expect(method()).not.toHaveBeenCalled();
        await retire(reason, view);
        await act(async () => { await callback(); await callback(); });
        expect(method()).not.toHaveBeenCalled();
        expect(calls.toast).not.toHaveBeenCalled();
      });
    }
    it('preserves same-visit error, explicit retry, payload and success without replay', async () => {
      state.deferTerms = true;
      const { pending } = await begin();
      const callback = termsCallbacks[0];
      let running: unknown;
      await act(async () => { running = callback(); await callback(); });
      expect(method()).toHaveBeenCalledTimes(1);
      await act(async () => { pending.reject(new Error('failed')); await running; });
      expect(calls.toast).toHaveBeenCalledExactlyOnceWith(failure, 'error');
      await act(async () => { await callback(); });
      expect(method()).toHaveBeenCalledTimes(1);
      const retry = deferred(); method().mockReturnValue(retry.promise);
      fireEvent.click(screen.getByRole('button', { name: label }));
      await act(async () => { running = termsCallbacks[1](); });
      expect(method()).toHaveBeenCalledTimes(2);
      if (mode === 'confirm') expect(method()).toHaveBeenLastCalledWith('tx-A');
      else expect(method()).toHaveBeenLastCalledWith('tx-A', { proof_type: 'manual', notes: 'Marked delivered by seller' });
      await act(async () => { retry.resolve(tx('A', completed)); await running; });
      expect(calls.toast).toHaveBeenLastCalledWith(success, 'success');
      expect(calls.toast).toHaveBeenCalledTimes(2);
      await act(async () => { await termsCallbacks[1](); });
      expect(method()).toHaveBeenCalledTimes(2);
    });
    it.each(['order', 'transaction'])('refuses a mismatched %s response and permits explicit retry', async (mismatch) => {
      const { pending } = await begin();
      await act(async () => pending.resolve({ ...tx('A', completed), ...(mismatch === 'order' ? { order_id: 'B' } : { id: 'other-tx' }) }));
      expect(screen.getByText('TX-A')).toBeTruthy();
      expect(calls.toast).toHaveBeenCalledExactlyOnceWith(failure, 'error');
      method().mockResolvedValue(tx('A', completed));
      fireEvent.click(screen.getByRole('button', { name: label }));
      await act(async () => {});
      expect(calls.toast).toHaveBeenLastCalledWith(success, 'success');
      expect(method()).toHaveBeenCalledTimes(2);
    });
  });
}
