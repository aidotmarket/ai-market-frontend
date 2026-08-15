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

describe('OrdersListPage buyer empty state', () => {
  beforeEach(() => {
    ordersApi.getMyOrders.mockResolvedValue([]);
    transactionsApi.getMyTransactions.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders an explicit empty state with a link to browse data', async () => {
    render(<OrdersListPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No orders yet' })).not.toBeNull();
    });

    expect(screen.getByText("You haven't purchased any datasets yet.")).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Browse data' }).getAttribute('href')).toBe('/find-data');
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });
});
