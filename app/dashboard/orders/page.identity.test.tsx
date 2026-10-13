// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyerOrder, Transaction } from '@/types';
import OrdersListPage from './page';

const ordersApi = vi.hoisted(() => ({ getMyOrders: vi.fn() }));
const transactionsApi = vi.hoisted(() => ({ getMyTransactions: vi.fn() }));
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/transactions', () => transactionsApi);

function order(id = 'purchase-one', overrides: Partial<BuyerOrder> = {}): BuyerOrder {
  return {
    id, listing_id: 'shared-listing', listing_title: 'Repeated title', seller_name: 'Synthetic seller',
    amount: 12, status: 'fulfilled', created_at: '2026-10-13T00:00:00Z', updated_at: null,
    ...overrides,
  };
}

function transaction(id: string, orderId: string | null, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id, order_id: orderId, tx_number: `SYN-${id}`, listing_title: 'Repeated title', status: 'paid',
    buyer_type: 'human', amount_cents: 1200, currency: 'usd', platform_fee_cents: 120,
    seller_amount_cents: 1080, created_at: '2026-10-13T00:00:00Z',
    updated_at: '2026-10-13T00:00:00Z', paid_at: null, delivered_at: null, settled_at: null,
    ...overrides,
  };
}

async function purchases() {
  const view = render(<OrdersListPage />);
  await screen.findByRole('heading', { name: 'Purchases' });
  const desktop = screen.getAllByRole('row').slice(1);
  const mobile = Array.from(view.container.querySelectorAll<HTMLAnchorElement>('a.block.rounded-lg'));
  expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  expect(transactionsApi.getMyTransactions).toHaveBeenCalledOnce();
  expect(mobile).toHaveLength(desktop.length);
  return { desktop, mobile };
}

function expectAssociation(desktop: HTMLElement, mobile: HTMLElement, purchase: BuyerOrder, tx: Transaction, label: string) {
  const link = within(desktop).getByRole('link', { name: `${label}${tx.tx_number}` });
  expect(link.getAttribute('href')).toBe(`/dashboard/orders/${purchase.id}?tx=${tx.id}`);
  expect(within(desktop).getByText(label)).not.toBeNull();
  expect(within(mobile).getByText(label)).not.toBeNull();
  expect(within(mobile).getByText(tx.tx_number)).not.toBeNull();
  expect(mobile.getAttribute('href')).toBe(`/dashboard/orders/${purchase.id}`);
}

describe('purchase transaction identity in the mounted desktop and mobile page', () => {
  beforeEach(() => {
    ordersApi.getMyOrders.mockResolvedValue([order()]);
    transactionsApi.getMyTransactions.mockResolvedValue([]);
  });
  afterEach(() => { cleanup(); vi.resetAllMocks(); });

  it('keeps equal-title purchases associated with their distinct canonical order IDs', async () => {
    const first = order();
    const second = order('purchase-two');
    const txOne = transaction('tx-one', first.id, { status: 'settled' });
    const txTwo = transaction('tx-two', second.id);
    ordersApi.getMyOrders.mockResolvedValue([first, second]);
    transactionsApi.getMyTransactions.mockResolvedValue([txTwo, txOne]);
    const { desktop, mobile } = await purchases();
    expectAssociation(desktop[0], mobile[0], first, txOne, 'Settled');
    expectAssociation(desktop[1], mobile[1], second, txTwo, 'Paid');
    expect(within(desktop[0]).queryByText(txTwo.tx_number)).toBeNull();
    expect(within(mobile[0]).queryByText(txTwo.tx_number)).toBeNull();
    expect(within(desktop[1]).queryByText(txOne.tx_number)).toBeNull();
    expect(within(mobile[1]).queryByText(txOne.tx_number)).toBeNull();
  });

  it('uses the canonical order ID even when the transaction title differs', async () => {
    const tx = transaction('renamed', 'purchase-one', { listing_title: 'Different title', status: 'confirmed' });
    transactionsApi.getMyTransactions.mockResolvedValue([tx]);
    const { desktop, mobile } = await purchases();
    expectAssociation(desktop[0], mobile[0], order(), tx, 'Confirmed');
  });

  it.each(['null', 'missing', 'foreign', 'prefix'])('never guesses an association for a %s order ID', async (kind) => {
    const tx = transaction('unassociated', kind === 'null' ? null : kind === 'prefix' ? 'purchase-one-extra' : 'other-order');
    // Missing order_id is a runtime legacy response, outside the current typed contract.
    if (kind === 'missing') Reflect.deleteProperty(tx, 'order_id');
    transactionsApi.getMyTransactions.mockResolvedValue([tx]);
    const { desktop, mobile } = await purchases();
    expect(desktop[0].querySelector('a[href*="?tx="]')).toBeNull();
    for (const region of [desktop[0], mobile[0]]) {
      expect(within(region).queryByText('Paid')).toBeNull();
      expect(within(region).queryByText(tx.tx_number)).toBeNull();
      expect(within(region).getByText('Fulfilled')).not.toBeNull();
    }
  });

  it.each([false, true])('preserves API order for multiple exact matches (reversed=%s)', async (reverse) => {
    const txFirst = transaction('first', 'purchase-one', { status: 'confirmed', updated_at: '2026-01-01T00:00:00Z' });
    const txLater = transaction('later', 'purchase-one', { status: 'settled', updated_at: '2026-10-13T00:00:00Z' });
    transactionsApi.getMyTransactions.mockResolvedValue(reverse ? [txLater, txFirst] : [txFirst, txLater]);
    const { desktop, mobile } = await purchases();
    expectAssociation(desktop[0], mobile[0], order(), reverse ? txLater : txFirst, reverse ? 'Settled' : 'Confirmed');
  });

  it('keeps purchases, licence links and download labels when the transaction API is unavailable', async () => {
    ordersApi.getMyOrders.mockResolvedValue([order('purchase-one', { license_record_available: true }),
      order('purchase-two', { access_expired: true })]);
    transactionsApi.getMyTransactions.mockRejectedValue(new Error('Synthetic unavailable API'));
    const { desktop, mobile } = await purchases();
    expect(screen.queryByText('Failed to load orders.')).toBeNull();
    expect(document.querySelector('a[href*="?tx="]')).toBeNull();
    const licenceLinks = screen.getAllByRole('link', { name: 'Licence record' });
    expect(licenceLinks).toHaveLength(2);
    for (const link of licenceLinks) expect(link.getAttribute('href')).toBe('/dashboard/orders/purchase-one/license-record');
    expect(within(desktop[0]).getByRole('link', { name: 'View downloads' }).getAttribute('href')).toBe('/dashboard/orders/purchase-one');
    expect(within(mobile[0]).getByText('View downloads')).not.toBeNull();
    expect(within(desktop[1]).getByText('Expired')).not.toBeNull();
    expect(within(mobile[1]).getByText('Download window expired')).not.toBeNull();
    for (const region of [...desktop, ...mobile]) {
      expect(within(region).queryByText('Paid')).toBeNull();
      expect(within(region).queryByText(/SYN-/)).toBeNull();
    }
  });

  it('retains the loading state until purchases resolve', async () => {
    let resolve!: (value: BuyerOrder[]) => void;
    ordersApi.getMyOrders.mockReturnValue(new Promise<BuyerOrder[]>((done) => { resolve = done; }));
    const view = render(<OrdersListPage />);
    expect(view.container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Purchases' })).toBeNull();
    await act(async () => { resolve([order()]); });
    expect(await screen.findByRole('heading', { name: 'Purchases' })).not.toBeNull();
    expect(view.container.querySelector('.animate-spin')).toBeNull();
  });

  it('retains the order API error state', async () => {
    ordersApi.getMyOrders.mockRejectedValue(new Error('Synthetic order failure'));
    render(<OrdersListPage />);
    expect(await screen.findByText('Failed to load orders.')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Purchases' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
