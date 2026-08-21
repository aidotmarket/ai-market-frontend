// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersListPage from './page';

const ordersApi = vi.hoisted(() => ({
  getMyOrders: vi.fn(),
}));

const transactionsApi = vi.hoisted(() => ({
  getMyTransactions: vi.fn(),
}));

vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/transactions', () => transactionsApi);
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({
  default: () => null,
}));

describe('OrdersListPage Purchases heading', () => {
  beforeEach(() => {
    ordersApi.getMyOrders.mockResolvedValue([]);
    transactionsApi.getMyTransactions.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Purchases heading in the explicit empty state', async () => {
    render(<OrdersListPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Purchases' })).not.toBeNull();
    });

    expect(screen.getByRole('heading', { level: 2, name: 'No orders yet' })).not.toBeNull();
    expect(screen.getByText("You haven't purchased any datasets yet.")).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Browse data' }).getAttribute('href')).toBe('/find-data');
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });

  it('renders Purchases heading with a buyer order', async () => {
    ordersApi.getMyOrders.mockResolvedValue([
      {
        id: 'purchase-1',
        listing_id: 'listing-purchase-1',
        listing_title: 'Buyer purchase fixture',
        seller_name: 'Seller',
        amount: 12,
        status: 'fulfilled',
        created_at: '2026-08-20T00:00:00Z',
        updated_at: null,
      },
    ]);

    render(<OrdersListPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Purchases' })).not.toBeNull();
    expect(screen.getAllByText('Buyer purchase fixture')).toHaveLength(2);
    expect(screen.queryByText('Seller sale fixture')).toBeNull();
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });
});
