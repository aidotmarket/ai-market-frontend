// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellerOrder, SellerOrderStatus } from '@/types';

const navigation = vi.hoisted(() => ({ search: '' }));
const capabilitiesApi = vi.hoisted(() => ({ getCapabilities: vi.fn() }));
const sellerApi = vi.hoisted(() => ({ getSellerOrders: vi.fn() }));
const ordersApi = vi.hoisted(() => ({ getMyOrders: vi.fn() }));
const transactionsApi = vi.hoisted(() => ({ getMyTransactions: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/api/capabilities', () => capabilitiesApi);
vi.mock('@/api/seller', () => sellerApi);
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/transactions', () => transactionsApi);
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({
  default: () => null,
}));

const { default: SalesPage } = await import('./page');
const { default: OrdersListPage } = await import('../orders/page');

const activeCapabilities = {
  seller: { effective_status: 'active' },
};

function sellerOrder(overrides: Partial<SellerOrder> = {}): SellerOrder {
  return {
    id: 'sale-1',
    order_number: 'SALE-001',
    listing_id: 'listing-sale-1',
    listing_title: 'Seller dataset',
    buyer_email: 'buyer@example.com',
    amount_cents: 1234,
    seller_amount_cents: 1000,
    status: 'pending_delivery',
    needs_action: false,
    created_at: '2026-08-20T11:00:00Z',
    paid_at: '2026-08-20T12:00:00Z',
    delivered_at: null,
    completed_at: null,
    ...overrides,
  };
}

function tableSaleNumbers(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    (row) => row.querySelector('td')?.textContent ?? ''
  );
}

function fullPage(): SellerOrder[] {
  return Array.from({ length: 100 }, (_, index) => sellerOrder({
    id: `sale-${index}`, order_number: `PAGE1-${String(index).padStart(3, '0')}`,
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function pagingButton(name: 'Previous' | 'Next'): HTMLButtonElement {
  return within(screen.getByRole('navigation', { name: 'Sales pagination' }))
    .getByRole('button', { name }) as HTMLButtonElement;
}

describe('SalesPage', () => {
  beforeEach(() => {
    navigation.search = '';
    capabilitiesApi.getCapabilities.mockReset();
    sellerApi.getSellerOrders.mockReset();
    ordersApi.getMyOrders.mockReset();
    transactionsApi.getMyTransactions.mockReset();
    capabilitiesApi.getCapabilities.mockResolvedValue(activeCapabilities);
    sellerApi.getSellerOrders.mockResolvedValue({ data: [] });
    ordersApi.getMyOrders.mockResolvedValue([]);
    transactionsApi.getMyTransactions.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reaches distinct sales beyond 100 and reads the previous page normally', async () => {
    sellerApi.getSellerOrders
      .mockResolvedValueOnce({ data: fullPage() })
      .mockResolvedValueOnce({ data: [sellerOrder({ id: 'sale-101', order_number: 'PAGE2-101' })] })
      .mockResolvedValueOnce({ data: fullPage() });
    const { container } = render(<SalesPage />);
    await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
    expect(screen.getByText('Page 1')).not.toBeNull();
    expect(pagingButton('Previous').disabled).toBe(true);
    expect(pagingButton('Next').disabled).toBe(false);
    // One shared navigation outside the desktop/mobile row containers.
    expect(screen.getAllByRole('navigation', { name: 'Sales pagination' })).toHaveLength(1);
    fireEvent.click(pagingButton('Next'));
    await waitFor(() => expect(tableSaleNumbers(container)).toEqual(['PAGE2-101']));
    expect(screen.getAllByText('PAGE2-101')).toHaveLength(2);
    expect(screen.queryByText('PAGE1-000')).toBeNull();
    expect(screen.getByText('Page 2')).not.toBeNull();
    expect(pagingButton('Next').disabled).toBe(true);
    expect(pagingButton('Previous').disabled).toBe(false);
    fireEvent.click(pagingButton('Previous'));
    await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
    expect(screen.getByText('Page 1')).not.toBeNull();
    expect(pagingButton('Previous').disabled).toBe(true);
    expect(sellerApi.getSellerOrders.mock.calls.map(([params]) => params)).toEqual([
      { status_filter: 'pending_delivery', limit: 100, offset: 0 },
      { status_filter: 'pending_delivery', limit: 100, offset: 100 },
      { status_filter: 'pending_delivery', limit: 100, offset: 0 },
    ]);
  });

  it.each(['', 'status=all', 'status=delivered', 'status=completed'])(
    'keeps Previous on an empty terminal page without first-page empty copy: %s', async (search) => {
      navigation.search = search;
      sellerApi.getSellerOrders
        .mockResolvedValueOnce({ data: fullPage() })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: fullPage() });
      const { container } = render(<SalesPage />);
      await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
      fireEvent.click(pagingButton('Next'));
      expect(await screen.findByRole('heading', { name: 'End of sales results' })).not.toBeNull();
      expect(screen.queryByText(/No sales yet|No sales awaiting delivery|No sales match this filter/)).toBeNull();
      expect(screen.getByText('Page 2')).not.toBeNull();
      expect(pagingButton('Next').disabled).toBe(true);
      expect(pagingButton('Previous').disabled).toBe(false);
      fireEvent.click(pagingButton('Previous'));
      await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
      expect(screen.getByText('Page 1')).not.toBeNull();
    }
  );

  it('resets the filter and offset together with no new-filter old-offset request', async () => {
    sellerApi.getSellerOrders.mockResolvedValue({ data: fullPage() });
    const { container } = render(<SalesPage />);
    await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
    fireEvent.click(pagingButton('Next'));
    await waitFor(() => expect(screen.getByText('Page 2')).not.toBeNull());
    await waitFor(() => expect(pagingButton('Next').disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(sellerApi.getSellerOrders).toHaveBeenCalledTimes(3));
    expect(sellerApi.getSellerOrders).toHaveBeenLastCalledWith({ limit: 100, offset: 0 });
    expect(screen.getByText('Page 1')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(sellerApi.getSellerOrders.mock.calls.map(([params]) => params.offset)).toEqual([0, 100, 0]);
  });

  it('clears rows, disables paging during load, and retries the same later filter/page', async () => {
    navigation.search = 'status=completed';
    const later = deferred<{ data: SellerOrder[] }>();
    const retry = deferred<{ data: SellerOrder[] }>();
    sellerApi.getSellerOrders
      .mockResolvedValueOnce({ data: fullPage() })
      .mockReturnValueOnce(later.promise)
      .mockReturnValueOnce(retry.promise);
    const { container } = render(<SalesPage />);
    await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
    fireEvent.click(pagingButton('Next'));
    await waitFor(() => expect(sellerApi.getSellerOrders).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Loading sales...')).not.toBeNull();
    expect(tableSaleNumbers(container)).toEqual([]);
    expect(pagingButton('Previous').disabled).toBe(true);
    expect(pagingButton('Next').disabled).toBe(true);
    fireEvent.click(pagingButton('Next'));
    expect(sellerApi.getSellerOrders).toHaveBeenCalledTimes(2);
    await act(async () => later.reject(new Error('offline')));
    expect(screen.getByRole('heading', { name: 'Sales are unavailable' })).not.toBeNull();
    expect(tableSaleNumbers(container)).toEqual([]);
    expect(pagingButton('Previous').disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(sellerApi.getSellerOrders).toHaveBeenCalledTimes(3));
    expect(screen.getByText('Page 2')).not.toBeNull();
    expect(pagingButton('Previous').disabled).toBe(true);
    await act(async () => retry.resolve({ data: [sellerOrder({ order_number: 'RETRY-PAGE2' })] }));
    expect(tableSaleNumbers(container)).toEqual(['RETRY-PAGE2']);
    expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(2, { status_filter: 'completed', limit: 100, offset: 100 });
    expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(3, { status_filter: 'completed', limit: 100, offset: 100 });
  });

  it.each(['resolve', 'reject'] as const)('ignores a retired page %s while the new filter is loading', async (settle) => {
    const retired = deferred<{ data: SellerOrder[] }>();
    const current = deferred<{ data: SellerOrder[] }>();
    sellerApi.getSellerOrders.mockResolvedValueOnce({ data: fullPage() })
      .mockReturnValueOnce(retired.promise).mockReturnValueOnce(current.promise);
    const { container } = render(<SalesPage />);
    await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
    fireEvent.click(pagingButton('Next'));
    await waitFor(() => expect(sellerApi.getSellerOrders).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }));
    await waitFor(() => expect(sellerApi.getSellerOrders).toHaveBeenCalledTimes(3));
    await act(async () => {
      if (settle === 'resolve') retired.resolve({ data: fullPage() });
      else retired.reject(new Error('late page error'));
    });
    expect(screen.getByText('Page 1')).not.toBeNull();
    expect(screen.getByText('Loading sales...')).not.toBeNull();
    expect(tableSaleNumbers(container)).toEqual([]);
    expect(pagingButton('Next').disabled).toBe(true);
    await act(async () => current.resolve({ data: [sellerOrder({ order_number: 'CURRENT-FILTER' })] }));
    expect(tableSaleNumbers(container)).toEqual(['CURRENT-FILTER']);
    expect(pagingButton('Next').disabled).toBe(true);
  });

  it.each(['resolve', 'reject'] as const)('ignores a retired retry %s after a new filter succeeds', async (settle) => {
    const retired = deferred<{ data: SellerOrder[] }>();
    sellerApi.getSellerOrders.mockResolvedValueOnce({ data: fullPage() })
      .mockRejectedValueOnce(new Error('page failed')).mockReturnValueOnce(retired.promise)
      .mockResolvedValueOnce({ data: [sellerOrder({ order_number: 'CURRENT' })] });
    const { container } = render(<SalesPage />);
    await waitFor(() => expect(tableSaleNumbers(container)).toHaveLength(100));
    fireEvent.click(pagingButton('Next'));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(sellerApi.getSellerOrders).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(tableSaleNumbers(container)).toEqual(['CURRENT']));
    await act(async () => {
      if (settle === 'resolve') retired.resolve({ data: fullPage() });
      else retired.reject(new Error('late retry error'));
    });
    expect(tableSaleNumbers(container)).toEqual(['CURRENT']);
    expect(screen.getByText('Page 1')).not.toBeNull();
    expect(screen.queryByText('Loading sales...')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Sales are unavailable' })).toBeNull();
    expect(pagingButton('Previous').disabled).toBe(true);
    expect(pagingButton('Next').disabled).toBe(true);
  });

  it('does not dispatch seller orders after a retired capability check', async () => {
    const retired = deferred<typeof activeCapabilities>();
    capabilitiesApi.getCapabilities.mockReturnValueOnce(retired.promise)
      .mockResolvedValue(activeCapabilities);
    render(<SalesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByRole('heading', { name: 'No sales yet' })).not.toBeNull();
    await act(async () => retired.resolve(activeCapabilities));
    expect(sellerApi.getSellerOrders).toHaveBeenCalledExactlyOnceWith({ limit: 100, offset: 0 });
  });

  it('guards provisioning sellers before seller orders', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'provisioning' },
    });

    render(<SalesPage />);

    expect(await screen.findByRole('heading', { name: 'Sales' })).not.toBeNull();
    expect(await screen.findByText('Sales unlock after seller setup is complete.')).not.toBeNull();
    expect(sellerApi.getSellerOrders).not.toHaveBeenCalled();
  });

  it.each(['not_requested', 'suspended']) (
    'blocks unavailable seller capabilities before seller orders: %s',
    async (effectiveStatus) => {
      capabilitiesApi.getCapabilities.mockResolvedValue({
        seller: { effective_status: effectiveStatus },
      });

      render(<SalesPage />);

      expect(await screen.findByRole('heading', { name: 'Sales' })).not.toBeNull();
      expect(await screen.findByText('Sales are unavailable for this account.')).not.toBeNull();
      expect(sellerApi.getSellerOrders).not.toHaveBeenCalled();
    }
  );

  it('shows the Sales heading and Loading sales... without stale rows', async () => {
    let resolveSecondRequest: ((value: { data: SellerOrder[] }) => void) | undefined;
    sellerApi.getSellerOrders
      .mockResolvedValueOnce({ data: [sellerOrder({ listing_title: 'Old pending sale' })] })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondRequest = resolve;
      }));

    render(<SalesPage />);
    expect(await screen.findAllByText('Old pending sale')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }));

    expect(await screen.findByRole('heading', { name: 'Sales' })).not.toBeNull();
    expect(await screen.findByText('Loading sales...')).not.toBeNull();
    expect(screen.queryByText('Old pending sale')).toBeNull();
    expect(resolveSecondRequest).toBeTypeOf('function');
  });

  it('requests the selected filters with the bounded query', async () => {
    render(<SalesPage />);

    await waitFor(() => {
      expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(1, {
        status_filter: 'pending_delivery',
        limit: 100,
        offset: 0,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => {
      expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(2, { limit: 100, offset: 0 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }));
    await waitFor(() => {
      expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(3, {
        status_filter: 'delivered',
        limit: 100,
        offset: 0,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await waitFor(() => {
      expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(4, {
        status_filter: 'completed',
        limit: 100,
        offset: 0,
      });
    });
  });

  it('renders all six facts in desktop and mobile presentations without links', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-20T15:00:00Z'));
    sellerApi.getSellerOrders.mockResolvedValue({ data: [sellerOrder()] });

    const { container } = render(<SalesPage />);

    expect(await screen.findAllByText('SALE-001')).toHaveLength(2);
    for (const label of ['Sale', 'Listing', 'Gross (USD)', 'You receive (USD)', 'Status', 'Paid']) {
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
    expect(screen.getAllByText('Seller dataset')).toHaveLength(2);
    expect(screen.queryByText('buyer@example.com')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Buyer' })).toBeNull();
    expect(screen.getAllByText('$12.34')).toHaveLength(2);
    expect(screen.getAllByText('$10.00')).toHaveLength(2);
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('/dashboard/orders/');
    expect(screen.queryByText(/Mark Delivered|Deliver now|Upload/)).toBeNull();
  });

  it('links the seller licence record only when exposed by the backend', async () => {
    sellerApi.getSellerOrders.mockResolvedValue({ data: [sellerOrder({ license_record_available: true })] });

    render(<SalesPage />);

    const links = await screen.findAllByRole('link', { name: 'Licence record' });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/dashboard/sales/sale-1/license-record');
  });

  it('keeps needs_action informational', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-20T15:00:00Z'));
    sellerApi.getSellerOrders.mockResolvedValue({
      data: [
        sellerOrder({ id: 'sale-b', order_number: 'SALE-B', needs_action: true }),
        sellerOrder({ id: 'sale-a', order_number: 'SALE-A', needs_action: false }),
      ],
    });

    const { container } = render(<SalesPage />);
    await waitFor(() => expect(tableSaleNumbers(container)).toEqual(['SALE-A', 'SALE-B']));

    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const firstBadge = within(rows[0] as HTMLElement).getByText('Awaiting delivery');
    const secondBadge = within(rows[1] as HTMLElement).getByText('Awaiting delivery');
    expect(firstBadge.className).toBe(secondBadge.className);
    expect(screen.getAllByText(/Aug 20, 2026 \(3 hours ago\)/)).toHaveLength(4);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.queryByText(/Needs action|Mark Delivered|Deliver now|Upload/)).toBeNull();
  });

  it('sorts pending sales oldest paid first with deterministic ties', async () => {
    sellerApi.getSellerOrders.mockResolvedValue({
      data: [
        sellerOrder({ id: 'sale-c', order_number: 'SALE-C', paid_at: '2026-08-20T12:00:00Z', created_at: '2026-08-20T10:00:00Z' }),
        sellerOrder({ id: 'sale-old', order_number: 'SALE-OLD', paid_at: '2026-08-19T12:00:00Z', created_at: '2026-08-19T10:00:00Z' }),
        sellerOrder({ id: 'sale-b', order_number: 'SALE-B', paid_at: '2026-08-20T12:00:00Z', created_at: '2026-08-20T10:00:00Z' }),
        sellerOrder({ id: 'sale-created-late', order_number: 'SALE-A', paid_at: '2026-08-20T12:00:00Z', created_at: '2026-08-20T11:00:00Z' }),
        sellerOrder({ id: 'sale-created-early', order_number: 'SALE-Z', paid_at: '2026-08-20T12:00:00Z', created_at: '2026-08-20T09:00:00Z' }),
      ],
    });

    const { container } = render(<SalesPage />);

    await waitFor(() => {
      expect(tableSaleNumbers(container)).toEqual(['SALE-OLD', 'SALE-Z', 'SALE-B', 'SALE-C', 'SALE-A']);
    });
  });

  it('renders null-paid fallback and delivered and completed dates', async () => {
    sellerApi.getSellerOrders.mockResolvedValue({
      data: [
        sellerOrder({
          id: 'sale-not-paid',
          order_number: 'SALE-NOT-PAID',
          paid_at: null,
          created_at: '2026-08-17T12:00:00Z',
        }),
        sellerOrder({
          id: 'sale-delivered',
          order_number: 'SALE-DELIVERED',
          status: 'delivered',
          delivered_at: '2026-08-19T12:00:00Z',
        }),
        sellerOrder({
          id: 'sale-completed',
          order_number: 'SALE-COMPLETED',
          status: 'completed',
          completed_at: '2026-08-18T12:00:00Z',
        }),
      ],
    });

    render(<SalesPage />);

    for (const notPaid of await screen.findAllByText('Not paid')) {
      expect(within(notPaid.parentElement as HTMLElement).getByText('Created Aug 17, 2026')).not.toBeNull();
    }
    for (const deliveredBadge of screen.getAllByText('Delivered', { selector: 'span' })) {
      expect(within(deliveredBadge.parentElement as HTMLElement).getByText('Aug 19, 2026')).not.toBeNull();
    }
    for (const completedBadge of screen.getAllByText('Completed', { selector: 'span' })) {
      expect(within(completedBadge.parentElement as HTMLElement).getByText('Aug 18, 2026')).not.toBeNull();
    }
  });

  it('sorts all non-default filters newest paid first with nulls and deterministic ties', async () => {
    const descendingFixtures = [
      sellerOrder({ id: 'sale-null', order_number: 'SALE-NULL', paid_at: null }),
      sellerOrder({ id: 'sale-b', order_number: 'SALE-B', paid_at: '2026-08-20T12:00:00Z', created_at: '2026-08-20T10:00:00Z' }),
      sellerOrder({ id: 'sale-new', order_number: 'SALE-NEW', paid_at: '2026-08-21T12:00:00Z' }),
      sellerOrder({ id: 'sale-a', order_number: 'SALE-A', paid_at: '2026-08-20T12:00:00Z', created_at: '2026-08-20T10:00:00Z' }),
    ];
    sellerApi.getSellerOrders.mockResolvedValue({ data: descendingFixtures });

    const { container } = render(<SalesPage />);
    await waitFor(() => expect(sellerApi.getSellerOrders).toHaveBeenCalledOnce());

    for (const filterLabel of ['All', 'Delivered', 'Completed']) {
      fireEvent.click(screen.getByRole('button', { name: filterLabel }));
      await waitFor(() => {
        expect(tableSaleNumbers(container)).toEqual(['SALE-NEW', 'SALE-A', 'SALE-B', 'SALE-NULL']);
      });
    }
  });

  it.each([
    ['created', 'Order created'],
    ['paid', 'Paid'],
    ['in_escrow', 'Payment held'],
    ['pending_delivery', 'Awaiting delivery'],
    ['delivered', 'Delivered'],
    ['completed', 'Completed'],
    ['disputed', 'Disputed'],
    ['resolved', 'Dispute resolved'],
    ['delivery_failed', 'Delivery failed'],
    ['refunded', 'Refunded'],
    ['cancelled', 'Cancelled'],
  ] as const)('maps every seller status independently: %s', async (status, label) => {
    sellerApi.getSellerOrders.mockResolvedValue({ data: [sellerOrder({ status })] });

    render(<SalesPage />);

    await waitFor(() => {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('Fulfilled')).toBeNull();
    expect(screen.queryByText('Failed')).toBeNull();
  });

  it('reports an unknown status exactly once', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sellerApi.getSellerOrders.mockResolvedValue({
      data: [sellerOrder({ status: 'future_status' as SellerOrderStatus })],
    });

    render(<SalesPage />);

    expect(await screen.findAllByText('Status unavailable')).toHaveLength(2);
    expect(screen.queryByText('future_status')).toBeNull();
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledTimes(1);
    });
    expect(consoleError).toHaveBeenCalledWith('Unknown seller order status:', 'future_status');
  });

  it('renders each exact empty state', async () => {
    render(<SalesPage />);

    expect(await screen.findByRole('heading', { name: 'No sales awaiting delivery' })).not.toBeNull();
    expect(screen.getByText('Paid sales awaiting delivery will appear here.')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByRole('heading', { name: 'No sales yet' })).not.toBeNull();
    expect(screen.getByText('Sales will appear here after a buyer completes payment.')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }));
    expect(await screen.findByRole('heading', { name: 'No sales match this filter' })).not.toBeNull();
    expect(screen.getByText('Choose another status to view your sales.')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(await screen.findByRole('heading', { name: 'No sales match this filter' })).not.toBeNull();
    expect(screen.getByText('Choose another status to view your sales.')).not.toBeNull();
  });

  it('renders exact error copy and retries the same request', async () => {
    sellerApi.getSellerOrders
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ data: [sellerOrder()] });

    render(<SalesPage />);

    expect(await screen.findByRole('heading', { name: 'Sales are unavailable' })).not.toBeNull();
    expect(screen.getByText("We couldn't load your sales. Try again.")).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByText('Seller dataset')).toHaveLength(2);

    const expectedParams = { status_filter: 'pending_delivery', limit: 100, offset: 0 };
    expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(1, expectedParams);
    expect(sellerApi.getSellerOrders).toHaveBeenNthCalledWith(2, expectedParams);
  });

  it('keeps one sale and one personal purchase on separate surfaces', async () => {
    sellerApi.getSellerOrders.mockResolvedValue({
      data: [sellerOrder({ listing_title: 'Seller-only sale' })],
    });
    ordersApi.getMyOrders.mockResolvedValue([
      {
        id: 'purchase-1',
        listing_id: 'listing-purchase-1',
        listing_title: 'Buyer-only purchase',
        seller_name: 'Another seller',
        amount: 20,
        status: 'fulfilled',
        created_at: '2026-08-19T00:00:00Z',
        updated_at: null,
      },
    ]);

    const salesRender = render(<SalesPage />);
    expect(await screen.findAllByText('Seller-only sale')).toHaveLength(2);
    expect(screen.queryByText('Buyer-only purchase')).toBeNull();
    salesRender.unmount();

    render(<OrdersListPage />);
    expect(await screen.findAllByText('Buyer-only purchase')).toHaveLength(2);
    expect(screen.queryByText('Seller-only sale')).toBeNull();
    expect(sellerApi.getSellerOrders).toHaveBeenCalledOnce();
    expect(sellerApi.getSellerOrders).toHaveBeenCalledWith({
      status_filter: 'pending_delivery',
      limit: 100,
      offset: 0,
    });
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });
});
