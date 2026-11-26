// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellerOrder, SellerOrderMoneyStatement } from '@/types';
import { formatDate } from '@/lib/format';
import SalesOrderDetails from './SalesOrderDetails';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/api/client', () => ({ api: client }));

const order: SellerOrder = {
  id: 'sale-1', order_number: 'SALE-001', listing_id: 'listing-1', listing_title: 'Test dataset',
  buyer_email: 'buyer@example.com', amount_cents: 100000, seller_amount_cents: 95000,
  status: 'delivered', needs_action: false, created_at: null, paid_at: null,
  delivered_at: null, completed_at: null,
};
const statement: SellerOrderMoneyStatement = { net_transfer_cents: 90045, A: 2930, S: 2812, G: 118, R: 2930 };
const autoConfirm = '2026-11-26T12:00:00Z';
const confirmed = '2026-11-25T12:00:00Z';

function expandDetails(sale: SellerOrder = order) {
  render(<SalesOrderDetails order={sale} />);
  expect(client.get).not.toHaveBeenCalled();
  const details = screen.getByText('Order details').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
}

function field(label: string) {
  return within(screen.getByText(label).parentElement!).getByRole('definition');
}

describe('Sales order details', () => {
  beforeEach(() => {
    client.get.mockReset().mockImplementation(async (url: string) => {
      if (url === '/orders/sale-1') return { data: { id: order.id } };
      if (url === '/orders/sale-1/money-statement') return { data: { seller_statement: statement } };
      throw new Error(`Unexpected path ${url}`);
    });
  });
  afterEach(cleanup);

  it('shows the posted net transfer and each fee field directly from the statement', async () => {
    expandDetails();
    await screen.findByText('$900.45');
    expect(field('Final payout').textContent).toBe('$900.45');
    expect(field('Actual card processing fee (A)').textContent).toBe('$29.30');
    expect(field('Seller policy share (S)').textContent).toBe('$28.12');
    expect(field('Seller gap (G)').textContent).toBe('$1.18');
    expect(field('Seller recovery (R)').textContent).toBe('$29.30');
    expect(client.get).toHaveBeenCalledWith('/orders/sale-1/money-statement', expect.objectContaining({
      fetchOptions: { cache: 'no-store' }, signal: expect.any(AbortSignal),
    }));
  });

  it('shows the unposted message for a 404 statement', async () => {
    client.get.mockRejectedValueOnce(Object.assign(new AxiosError(), { response: { status: 404 } }));
    expandDetails();
    expect(await screen.findByText('Final payout not yet posted')).toBe(field('Final payout'));
    expect(screen.queryByText('Actual card processing fee (A)')).toBeNull();
  });

  it('shows the unposted message for a zero net transfer and preserves a zero fee', async () => {
    client.get.mockResolvedValueOnce({ data: { seller_statement: { ...statement, net_transfer_cents: 0, G: 0, A: null } } });
    expandDetails();
    expect(await screen.findByText('Final payout not yet posted')).toBe(field('Final payout'));
    expect(field('Seller gap (G)').textContent).toBe('$0.00');
    expect(field('Actual card processing fee (A)').textContent).toBe('—');
  });

  it('shows expected auto-confirmation and actual confirmation from order detail', async () => {
    client.get.mockResolvedValueOnce({ data: { seller_statement: statement } })
      .mockResolvedValueOnce({ data: { id: order.id, auto_confirm_at: autoConfirm, confirmed_at: confirmed } });
    expandDetails();
    await screen.findByText('Expected auto-confirmation');
    const expected = within(field('Expected auto-confirmation')).getByText(formatDate(autoConfirm));
    const actual = within(field('Confirmed')).getByText(formatDate(confirmed));
    expect(expected.getAttribute('datetime')).toBe(autoConfirm);
    expect(actual.getAttribute('datetime')).toBe(confirmed);
  });

  it('links an actionable pending delivery to the existing order transaction step', async () => {
    client.get.mockImplementation(async (url: string, options: { params?: { offset: number } }) => {
      if (url === '/transactions') {
        return { data: options.params?.offset === 0
          ? Array.from({ length: 100 }, () => ({ id: 'other-tx', order_id: 'other-sale', status: 'fulfilling' }))
          : [{ id: 'sale-tx', order_id: order.id, status: 'fulfilling' }] };
      }
      return { data: { id: order.id, seller_statement: statement } };
    });
    expandDetails({ ...order, status: 'pending_delivery', needs_action: true });
    expect((await screen.findByRole('link', { name: 'Mark Delivered' })).getAttribute('href'))
      .toBe('/dashboard/orders/sale-1?tx=sale-tx');
  });

  it('shows the delivery instruction when no matching delivery step is available', async () => {
    client.get.mockResolvedValueOnce({ data: { seller_statement: statement } })
      .mockResolvedValueOnce({ data: { id: order.id } })
      .mockResolvedValueOnce({ data: [{ id: 'other-tx', order_id: 'other-sale', status: 'fulfilling' }] });
    expandDetails({ ...order, status: 'pending_delivery', needs_action: true });
    expect(await screen.findByText('Ask Claude to mark this order as delivered.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Mark Delivered' })).toBeNull();
  });
});
