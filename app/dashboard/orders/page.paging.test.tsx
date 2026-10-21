// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyerOrder, Transaction } from '@/types';
import OrdersListPage from './page';

// A controlled passive-effect scheduler makes the pre-cleanup interval
// deterministic. The page and its promise callbacks remain production code.
const passiveEffects = vi.hoisted(() => ({ held: false, pending: [] as Array<() => void> }));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useEffect: (effect: import('react').EffectCallback, deps: import('react').DependencyList) => react.useEffect(() => {
      let dispose: ReturnType<typeof effect>;
      const setup = () => { dispose = effect(); };
      if (passiveEffects.held) passiveEffects.pending.push(setup);
      else setup();
      return () => {
        const teardown = () => { if (dispose) dispose(); };
        if (passiveEffects.held) passiveEffects.pending.push(teardown);
        else teardown();
      };
    }, deps),
  };
});
function releaseEffects() {
  passiveEffects.held = false;
  for (const run of passiveEffects.pending.splice(0)) run();
}

const ordersApi = vi.hoisted(() => ({ getMyOrders: vi.fn() }));
const transactionsApi = vi.hoisted(() => ({ getMyTransactions: vi.fn() }));
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/transactions', () => transactionsApi);

function order(n: number, overrides: Partial<BuyerOrder> = {}): BuyerOrder {
  return { id: `purchase-${n}`, listing_id: 'repeated-listing', listing_title: `Purchase ${n}`,
    seller_name: 'Synthetic seller', amount: 12.34, status: 'fulfilled',
    created_at: '2026-10-13T00:00:00Z', updated_at: null, ...overrides };
}
const first50 = Array.from({ length: 50 }, (_, i) => order(i + 1));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function previous() { return screen.getByRole<HTMLButtonElement>('button', { name: 'Previous' }); }
function next() { return screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }); }
async function start() {
  const view = render(<OrdersListPage />);
  await screen.findByRole('navigation', { name: 'Purchase pages' });
  return view;
}
async function pageTwo() {
  fireEvent.click(next());
  await screen.findAllByText('Purchase 51');
}
function tx(id: string, orderId: string | null, status: Transaction['status'] = 'paid'): Transaction {
  return { id, order_id: orderId, status, tx_number: `SYN-${id}`, listing_title: 'Different title',
    buyer_type: 'human', amount_cents: 1234, currency: 'usd', platform_fee_cents: 123,
    seller_amount_cents: 1111, created_at: '2026-10-13T00:00:00Z',
    updated_at: '2026-10-13T00:00:00Z', paid_at: null, delivered_at: null, settled_at: null };
}

describe('bounded purchase paging on the production page', () => {
  beforeEach(() => {
    ordersApi.getMyOrders.mockResolvedValue(first50);
    transactionsApi.getMyTransactions.mockResolvedValue([]);
  });
  afterEach(() => { releaseEffects(); cleanup(); vi.resetAllMocks(); });

  it('renders the actual first 50 in server order, reaches purchase 51 and reads Previous at offset zero', async () => {
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockResolvedValueOnce([order(51)]).mockResolvedValueOnce(first50);
    const view = await start();
    expect(ordersApi.getMyOrders).toHaveBeenCalledExactlyOnceWith({ limit: 50, offset: 0 });
    expect(transactionsApi.getMyTransactions).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getAllByRole('row').slice(1).map(row => within(row).getByText(/^Purchase /).textContent))
      .toEqual(first50.map(purchase => purchase.listing_title));
    expect(view.container.querySelectorAll('a.block.rounded-lg')).toHaveLength(50);
    expect(previous().disabled).toBe(true);
    expect(next().disabled).toBe(false);
    await pageTwo();
    expect(screen.getAllByText('Purchase 51')).toHaveLength(2);
    expect(screen.queryByText('Purchase 1')).toBeNull();
    expect(screen.getByText('Page 2')).not.toBeNull();
    expect(next().disabled).toBe(true);
    expect(previous().disabled).toBe(false);
    expect(ordersApi.getMyOrders).toHaveBeenNthCalledWith(2, { limit: 50, offset: 50 });
    fireEvent.click(previous());
    await screen.findAllByText('Purchase 1');
    expect(ordersApi.getMyOrders).toHaveBeenNthCalledWith(3, { limit: 50, offset: 0 });
    expect(ordersApi.getMyOrders).toHaveBeenCalledTimes(3);
    expect(transactionsApi.getMyTransactions).toHaveBeenCalledTimes(3);
  });

  it('disables Next for a short first page without speculative reads', async () => {
    ordersApi.getMyOrders.mockResolvedValue([order(1), order(2)]);
    await start();
    expect(next().disabled).toBe(true);
    fireEvent.click(next());
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });

  it('shows explicit end copy after a full page followed by an empty page and permits Previous', async () => {
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockResolvedValueOnce([]).mockResolvedValueOnce(first50);
    await start();
    fireEvent.click(next());
    await screen.findByText(/No more purchases/);
    expect(screen.queryByText('No orders yet')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Browse data' })).toBeNull();
    expect(previous().disabled).toBe(false);
    expect(next().disabled).toBe(true);
    fireEvent.click(previous());
    await screen.findAllByText('Purchase 1');
    expect(ordersApi.getMyOrders.mock.calls).toEqual([[{ limit: 50, offset: 0 }], [{ limit: 50, offset: 50 }], [{ limit: 50, offset: 0 }]]);
  });

  it('retries an initial failure at the same offset', async () => {
    ordersApi.getMyOrders.mockRejectedValueOnce(new Error('Synthetic failure')).mockResolvedValueOnce([order(1)]);
    render(<OrdersListPage />);
    await screen.findByRole('alert');
    expect(previous().disabled).toBe(true);
    expect(next().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findAllByText('Purchase 1');
    expect(ordersApi.getMyOrders.mock.calls).toEqual([[{ limit: 50, offset: 0 }], [{ limit: 50, offset: 0 }]]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retries a failed later page at the same offset with Previous available on error and retry loading', async () => {
    const retry = deferred<BuyerOrder[]>();
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockRejectedValueOnce(new Error('Synthetic failure')).mockReturnValueOnce(retry.promise);
    await start();
    fireEvent.click(next());
    await screen.findByRole('alert');
    expect(previous().disabled).toBe(false);
    expect(next().disabled).toBe(true);
    expect(screen.queryByText('Purchase 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(previous().disabled).toBe(false);
    expect(next().disabled).toBe(true);
    expect(screen.getByRole('status', { name: 'Loading purchases' })).not.toBeNull();
    await act(async () => { retry.resolve([order(51)]); });
    expect(screen.getAllByText('Purchase 51')).toHaveLength(2);
    expect(ordersApi.getMyOrders.mock.calls).toEqual([[{ limit: 50, offset: 0 }], [{ limit: 50, offset: 50 }], [{ limit: 50, offset: 50 }]]);
  });

  it.each(['success', 'error'])('ignores a late later-page %s and finally while Previous is loading', async (outcome) => {
    const older = deferred<BuyerOrder[]>();
    const back = deferred<BuyerOrder[]>();
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockReturnValueOnce(older.promise).mockReturnValueOnce(back.promise);
    await start();
    fireEvent.click(next());
    expect(previous().disabled).toBe(false);
    fireEvent.click(previous());
    await act(async () => {
      if (outcome === 'success') older.resolve([order(51)]);
      else older.reject(new Error('Retired failure'));
    });
    expect(screen.getByRole('status', { name: 'Loading purchases' })).not.toBeNull();
    expect(screen.queryByText('Purchase 51')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { back.resolve(first50); });
    expect(screen.getAllByText('Purchase 1')).toHaveLength(2);
    expect(screen.getByText('Page 1')).not.toBeNull();
  });

  it.each(['success', 'error'])('retires retry %s immediately before navigation effect cleanup', async (outcome) => {
    const retry = deferred<BuyerOrder[]>();
    const back = deferred<BuyerOrder[]>();
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockRejectedValueOnce(new Error('Synthetic failure'))
      .mockReturnValueOnce(retry.promise).mockReturnValueOnce(back.promise);
    await start();
    fireEvent.click(next());
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // Hold both cleanup and the next setup while the retired request settles.
    // This catches a cleanup-only cancellation implementation deterministically.
    passiveEffects.held = true;
    fireEvent.click(previous());
    expect(passiveEffects.pending.length).toBeGreaterThan(0);
    expect(ordersApi.getMyOrders).toHaveBeenCalledTimes(3);
    await act(async () => {
      if (outcome === 'success') retry.resolve([order(99)]);
      else retry.reject(new Error('Retired retry failure'));
    });
    expect(screen.getByRole('status', { name: 'Loading purchases' })).not.toBeNull();
    expect(screen.queryByText('Purchase 99')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { releaseEffects(); back.resolve(first50); });
    expect(screen.getAllByText('Purchase 1')).toHaveLength(2);
  });

  it.each(['success', 'error'])('ignores a late retry %s after Previous has already succeeded', async (outcome) => {
    const retry = deferred<BuyerOrder[]>();
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockRejectedValueOnce(new Error('Synthetic failure'))
      .mockReturnValueOnce(retry.promise).mockResolvedValueOnce([order(1)]);
    transactionsApi.getMyTransactions.mockResolvedValue([tx('current', 'purchase-1', 'confirmed')]);
    await start();
    fireEvent.click(next());
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(previous());
    await screen.findAllByText('SYN-current');
    await act(async () => {
      if (outcome === 'success') retry.resolve([order(99)]);
      else retry.reject(new Error('Retired retry failure'));
    });
    expect(screen.getAllByText('Purchase 1')).toHaveLength(2);
    expect(screen.getAllByText('SYN-current')).toHaveLength(2);
    expect(screen.queryByText('Purchase 99')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status', { name: 'Loading purchases' })).toBeNull();
    expect(screen.getByText('Page 1')).not.toBeNull();
    expect(previous().disabled).toBe(true);
    expect(next().disabled).toBe(true);
  });

  it('ignores retired supplemental transactions after the newer page succeeds', async () => {
    const oldTransactions = deferred<Transaction[]>();
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockResolvedValueOnce([order(51)]).mockResolvedValueOnce([order(1)]);
    transactionsApi.getMyTransactions.mockResolvedValueOnce([]).mockReturnValueOnce(oldTransactions.promise)
      .mockResolvedValueOnce([tx('current', 'purchase-1', 'confirmed')]);
    await start();
    fireEvent.click(next());
    fireEvent.click(previous());
    await screen.findAllByText('SYN-current');
    await act(async () => { oldTransactions.resolve([tx('stale', 'purchase-51')]); });
    expect(screen.queryByText('Purchase 51')).toBeNull();
    expect(screen.queryByText('SYN-stale')).toBeNull();
    expect(screen.getAllByText('SYN-current')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['success', 'error'])('safely retires pending orders and transactions on unmount (%s)', async (outcome) => {
    const pending = deferred<BuyerOrder[]>();
    const supplemental = deferred<Transaction[]>();
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockReturnValueOnce(pending.promise);
    transactionsApi.getMyTransactions.mockResolvedValueOnce([]).mockReturnValueOnce(supplemental.promise);
    const view = await start();
    fireEvent.click(next());
    view.unmount();
    await act(async () => {
      supplemental.resolve([tx('unmounted', 'purchase-51')]);
      if (outcome === 'success') pending.resolve([order(51)]);
      else pending.reject(new Error('Unmounted failure'));
    });
    expect(view.container.childElementCount).toBe(0);
    expect(ordersApi.getMyOrders).toHaveBeenCalledTimes(2);
    expect(transactionsApi.getMyTransactions).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('preserves later-page identity, amounts, versions, licence gates and downloads with transaction failure=%s', async (failTransactions) => {
    const later = [order(51, { license_record_available: true, purchased_version: { id: 'v1', version_label: 'Stored v1', status: 'superseded' }, newer_version_available: true }),
      order(52, { listing_title: 'Purchase 51', access_expired: true, access_expires_at: '2026-01-01T00:00:00Z' }),
      order(53, { status: 'pending_fulfillment' })];
    ordersApi.getMyOrders.mockResolvedValueOnce(first50).mockResolvedValueOnce(later);
    const transactions = [tx('foreign', 'purchase-51-extra'), tx('first', 'purchase-51', 'confirmed'), tx('second', 'purchase-51', 'settled'), tx('null', null)];
    if (failTransactions) transactionsApi.getMyTransactions.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Optional unavailable'));
    else transactionsApi.getMyTransactions.mockResolvedValueOnce([]).mockResolvedValueOnce(transactions);
    const view = await start();
    await pageTwo();
    const desktop = screen.getAllByRole('row').slice(1);
    const mobile = Array.from(view.container.querySelectorAll<HTMLAnchorElement>('a.block.rounded-lg'));
    expect(desktop).toHaveLength(3);
    expect(mobile).toHaveLength(3);
    for (const region of [desktop[0], mobile[0]]) {
      expect(within(region).getByText('$12.34')).not.toBeNull();
      expect(within(region).getByText('Stored v1')).not.toBeNull();
      expect(within(region).getByRole('link', { name: 'Newer version available' }).getAttribute('href')).toBe('/listings/repeated-listing');
      expect(within(region).getByText('View downloads')).not.toBeNull();
      expect(within(region).queryByText('SYN-second')).toBeNull();
      expect(within(region).queryByText('SYN-foreign')).toBeNull();
      if (!failTransactions) expect(within(region).getByText('SYN-first')).not.toBeNull();
    }
    if (!failTransactions) expect(within(desktop[0]).getByRole('link', { name: 'ConfirmedSYN-first' }).getAttribute('href')).toBe('/dashboard/orders/purchase-51?tx=first');
    else expect(view.container.querySelector('a[href*="?tx="]')).toBeNull();
    expect(mobile[0].getAttribute('href')).toBe('/dashboard/orders/purchase-51');
    expect(within(desktop[0]).getByRole('link', { name: 'View downloads' }).getAttribute('href')).toBe('/dashboard/orders/purchase-51');
    expect(screen.getAllByRole('link', { name: 'Licence record' }).map(link => link.getAttribute('href')))
      .toEqual(['/dashboard/orders/purchase-51/license-record', '/dashboard/orders/purchase-51/license-record']);
    expect(within(desktop[1]).getByText('Expired')).not.toBeNull();
    expect(within(mobile[1]).getByText('Download window expired')).not.toBeNull();
    for (const region of [desktop[1], mobile[1], desktop[2], mobile[2]]) {
      expect(within(region).queryByText('View downloads')).toBeNull();
      expect(within(region).queryByText('SYN-first')).toBeNull();
      expect(within(region).queryByRole('link', { name: 'Licence record' })).toBeNull();
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
