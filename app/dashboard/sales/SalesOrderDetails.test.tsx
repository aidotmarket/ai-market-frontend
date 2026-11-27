// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellerOrder } from '@/types';
import SalesOrderDetails from './SalesOrderDetails';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/api/client', () => ({ api: client }));

const order: SellerOrder = {
  id: 'sale-1', order_number: 'SALE-001', listing_id: 'listing-1', listing_title: 'Test dataset',
  buyer_email: 'buyer@example.com', amount_cents: 100000, seller_amount_cents: 95000,
  status: 'delivered', needs_action: false, created_at: null, paid_at: null,
  delivered_at: null, completed_at: null,
};
const autoConfirm = '2026-11-26T12:00:00Z';
const confirmed = '2026-11-25T12:00:00Z';

function expandDetails(summary: HTMLElement) {
  const details = summary.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  return within(details);
}

function renderAndExpand(sale: SellerOrder = order) {
  render(<SalesOrderDetails order={sale} />);
  expect(client.get).not.toHaveBeenCalled();
  return expandDetails(screen.getByText('Order details'));
}

describe('Sales order details', () => {
  beforeEach(() => {
    client.get.mockReset().mockResolvedValue({ data: {
      id: order.id, status: 'delivered', auto_confirm_at: autoConfirm, confirmed_at: null,
    } });
  });
  afterEach(cleanup);

  it('reads only the expanded sale and shows its expected date while awaiting confirmation', async () => {
    render(<>
      <SalesOrderDetails order={order} />
      <SalesOrderDetails order={{ ...order, id: 'sale-2' }} />
    </>);
    expect(client.get).not.toHaveBeenCalled();

    const [first, second] = screen.getAllByText('Order details');
    const expanded = expandDetails(first);
    expect((await expanded.findByRole('time')).getAttribute('datetime')).toBe(autoConfirm);
    expect(expanded.getByText('Expected auto-confirmation')).toBeTruthy();
    expect(expanded.queryByText('Confirmed')).toBeNull();
    expect(within(second.closest('details')!).queryByRole('time')).toBeNull();
    expect(client.get).toHaveBeenCalledExactlyOnceWith('/orders/sale-1', expect.objectContaining({
      fetchOptions: { cache: 'no-store' }, signal: expect.any(AbortSignal),
    }));
  });

  it.each(['delivered', 'completed'] as const)('shows only the actual date when confirmed with status %s', async (status) => {
    client.get.mockResolvedValue({ data: { id: order.id, status, auto_confirm_at: autoConfirm, confirmed_at: confirmed } });
    const expanded = renderAndExpand({ ...order, status });
    expect((await expanded.findByRole('time')).getAttribute('datetime')).toBe(confirmed);
    expect(expanded.getByText('Confirmed')).toBeTruthy();
    expect(expanded.queryByText('Expected auto-confirmation')).toBeNull();
  });

  it.each(['disputed', 'refunded', 'completed'])('hides a stale expected date when the order is now %s', async (status) => {
    client.get.mockResolvedValue({ data: { id: order.id, status, auto_confirm_at: autoConfirm, confirmed_at: null } });
    const expanded = renderAndExpand();
    await expanded.findByText('No confirmation date available.');
    expect(expanded.queryByRole('time')).toBeNull();
    expect(expanded.queryByText('Expected auto-confirmation')).toBeNull();
    expect(expanded.queryByText('Confirmed')).toBeNull();
  });

  it('shows the pending delivery instruction without fetching order or transaction data', () => {
    const expanded = renderAndExpand({ ...order, status: 'pending_delivery', needs_action: true });
    expect(expanded.getByRole('link', { name: 'Claude' }).getAttribute('href')).toBe('/docs/claude');
    expect(expanded.getByText(/to mark this order as delivered/).textContent)
      .toBe('Ask Claude to mark this order as delivered.');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('omits delivery instructions when the sale does not need action', () => {
    render(<SalesOrderDetails order={{ ...order, status: 'pending_delivery' }} />);
    expect(screen.queryByText('Order details')).toBeNull();
    expect(client.get).not.toHaveBeenCalled();
  });

  it('shows a failed order read and clears the error on retry', async () => {
    client.get.mockRejectedValueOnce(new Error('Network failure'));
    const expanded = renderAndExpand();
    await expanded.findByText(/couldn't load your order details/);
    expect(expanded.queryByText(/mark this order as delivered/)).toBeNull();

    fireEvent.click(expanded.getByRole('button', { name: 'Try again' }));
    expect((await expanded.findByRole('time')).getAttribute('datetime')).toBe(autoConfirm);
    expect(expanded.queryByText(/couldn't load your order details/)).toBeNull();
    expect(client.get.mock.calls.map(([path]) => path)).toEqual(['/orders/sale-1', '/orders/sale-1']);
  });
});
