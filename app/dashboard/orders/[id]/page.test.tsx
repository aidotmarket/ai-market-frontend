// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyerOrderDetail, Transaction } from '@/types';

const navigation = vi.hoisted(() => ({ orderId: 'order-1', txId: 'tx-1' }));
const auth = vi.hoisted(() => ({ userId: 'viewer-1', role: 'seller' }));
const membersApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/api/client', () => ({ api: membersApi }));
const ordersApi = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getOrderAccess: vi.fn(),
  getOrderEvents: vi.fn(),
  refreshOrderAccess: vi.fn(),
  refreshScopedDelivery: vi.fn(),
  requestDownload: vi.fn(),
}));
const transactionsApi = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  deliverTransaction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: navigation.orderId }),
  useSearchParams: () => new URLSearchParams({ tx: navigation.txId }),
}));
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/transactions', () => transactionsApi);
vi.mock('@/store/auth', () => ({
  useAuthStore: <T,>(selector: (state: { user: { id: string; role: string } }) => T) => selector({
    user: { id: auth.userId, role: auth.role },
  }),
}));
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/components/legal/TermsGate', () => ({
  useTermsGate: () => ({
    ensureTermsAccepted: async (action: () => unknown) => action(),
    TermsGatePrompt: () => null,
    checkingTerms: false,
  }),
}));
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({
  default: () => null,
}));
vi.mock('@/components/orders/ScopedCredentialDownload', () => ({
  default: () => <div>Scoped downloads</div>,
  isS3ScopedDeliveryResponse: () => false,
}));

const { default: OrderDetailPage } = await import('./page');

function order(overrides: Partial<BuyerOrderDetail> = {}): BuyerOrderDetail {
  return {
    id: 'order-1',
    buyer_id: 'viewer-1',
    seller_id: 'seller-1',
    listing_id: 'listing-1',
    listing_title: 'Order dataset',
    seller_name: 'Example Seller',
    amount: 25,
    status: 'pending_fulfillment',
    created_at: '2026-08-21T10:00:00Z',
    updated_at: '2026-08-21T10:30:00Z',
    access_expires_at: null,
    access_expired: false,
    purchased_version: null,
    newer_version_available: false,
    access_url: null,
    download_count: 0,
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    order_id: navigation.orderId,
    tx_number: 'TX-001',
    status: 'delivered',
    buyer_type: 'human',
    amount_cents: 2500,
    currency: 'usd',
    platform_fee_cents: 250,
    seller_amount_cents: 2250,
    listing_title: 'Order dataset',
    seller_name: 'Example Seller',
    created_at: '2026-08-21T10:00:00Z',
    updated_at: '2026-08-21T10:30:00Z',
    paid_at: '2026-08-21T10:05:00Z',
    delivered_at: '2026-08-21T10:30:00Z',
    settled_at: null,
    events: [],
    ...overrides,
  };
}

describe('OrderDetailPage viewer relationship gating', () => {
  beforeEach(() => {
    navigation.orderId = 'order-1';
    navigation.txId = 'tx-1';
    auth.userId = 'viewer-1';
    auth.role = 'seller';
    membersApi.get.mockRejectedValue({ response: { status: 404 } });
    ordersApi.getOrder.mockResolvedValue(order());
    ordersApi.getOrderEvents.mockResolvedValue([]);
    ordersApi.requestDownload.mockResolvedValue({
      download_url: 'https://downloads.example.test/order-1',
      download_number: 1,
      downloads_remaining: 4,
      s3_download_urls: [],
    });
    transactionsApi.getTransaction.mockResolvedValue(transaction());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not offer Mark Delivered to a buyer of record who also has global seller role', async () => {
    auth.role = 'seller';
    ordersApi.getOrder.mockResolvedValue(order({ buyer_id: auth.userId, seller_id: 'seller-1' }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({ status: 'fulfilling' }));

    render(<OrderDetailPage />);

    expect(await screen.findByText('Order dataset')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark Delivered' })).toBeNull();
  });

  it('offers Mark Delivered to the seller of record', async () => {
    ordersApi.getOrder.mockResolvedValue(order({
      buyer_id: 'buyer-1',
      seller_id: auth.userId,
    }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({ status: 'fulfilling' }));

    render(<OrderDetailPage />);

    expect(await screen.findByRole('button', { name: 'Mark Delivered' })).not.toBeNull();
  });

  it('discards a participant-authorized transaction that belongs to another order', async () => {
    navigation.orderId = 'A';
    navigation.txId = 'B';
    ordersApi.getOrder.mockResolvedValue(order({
      id: 'A',
      buyer_id: auth.userId,
    }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({
      id: 'B',
      order_id: 'B-order',
      status: 'delivered',
    }));

    render(<OrderDetailPage />);

    expect(await screen.findByText('Order #A')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Transaction' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm Receipt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark Delivered' })).toBeNull();
    expect(transactionsApi.confirmTransaction).not.toHaveBeenCalled();
    expect(transactionsApi.deliverTransaction).not.toHaveBeenCalled();
  });

  it('renders a transaction that belongs to the current order', async () => {
    navigation.orderId = 'A';
    navigation.txId = 'B';
    ordersApi.getOrder.mockResolvedValue(order({
      id: 'A',
      buyer_id: auth.userId,
    }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({
      id: 'B',
      order_id: 'A',
      status: 'delivered',
    }));

    render(<OrderDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Transaction' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm Receipt' })).not.toBeNull();
  });

  it('hides buyer actions and download preparation from a seller of record', async () => {
    auth.role = 'buyer';
    ordersApi.getOrder.mockResolvedValue(order({
      buyer_id: 'buyer-1',
      seller_id: auth.userId,
      status: 'fulfilled',
    }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({ status: 'delivered' }));

    render(<OrderDetailPage />);

    expect(await screen.findByText(/available to the buyer/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm Receipt' })).toBeNull();
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
  });

  it('offers Confirm Receipt to the buyer of record', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ buyer_id: auth.userId, seller_id: 'seller-1' }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({ status: 'delivered' }));

    render(<OrderDetailPage />);

    expect(await screen.findByRole('button', { name: 'Confirm Receipt' })).not.toBeNull();
  });

  it('prepares fulfilled downloads exactly once for the buyer of record', async () => {
    ordersApi.getOrder.mockResolvedValue(order({
      buyer_id: auth.userId,
      seller_id: 'seller-1',
      status: 'fulfilled',
    }));

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(ordersApi.requestDownload).toHaveBeenCalledTimes(1);
      expect(ordersApi.requestDownload).toHaveBeenCalledWith('order-1');
    });
  });
  it('shows Workspace downloads without automatically consuming an allowance', async () => {
    ordersApi.getOrder.mockResolvedValue({...order(),workspace_delivery:true,status:'delivered'});
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button',{name:'Continue to download'}));
    expect(await screen.findByRole('button',{name:'Choose folder and download'})).not.toBeNull();
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
  });

  it('treats an empty 200 without a hash as a directory without legacy download', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    membersApi.get.mockResolvedValue({ status: 200, data: { members: [] } });
    render(<OrderDetailPage />);
    await screen.findByText('Files in this dataset');
    expect(await screen.findByText('No files are available yet.')).toBeTruthy();
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
    expect(membersApi.post).not.toHaveBeenCalled();
  });

  it('recognizes directory rows when the order serializer omits the hash', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    membersApi.get.mockResolvedValue({ status: 200, data: { members: [{ index: 0, basename: 'rows.csv', size_bytes: 10, sha256: 'hash', state: 'delivered' }] } });
    render(<OrderDetailPage />);
    await screen.findByText('rows.csv');
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
  });

  it.each([
    [410, 'delivery_retention_expired', 'This dataset is no longer available for download.'],
    [403, 'download_window_expired', 'This order’s download window has ended.'],
    [403, 'access_closed', 'Download access for this order has been closed.'],
    [403, 'Download access has been closed', 'Download access for this order has been closed.'],
  ])('renders permanent member refusal %s/%s without retry', async (status, detail, copy) => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    membersApi.get.mockRejectedValue({ response: { status, data: { detail: detail === 'download_window_expired' || detail === 'access_closed' ? { code: detail } : detail } } });
    render(<OrderDetailPage />);
    await screen.findByText('Order dataset');
    expect(screen.queryByText('Failed to load order details.')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain(copy);
    expect(screen.queryByRole('button', { name: 'Get download access' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry loading files' })).toBeNull();
    expect(membersApi.get).toHaveBeenCalledTimes(1);
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
  });

  it.each([
    ['500', { response: { status: 500 } }],
    ['transport error', new Error('network')],
  ])('keeps order details and offers read-only retry for %s', async (_label, failure) => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    membersApi.get.mockRejectedValue(failure);
    render(<OrderDetailPage />);
    await screen.findByText('Order dataset');
    expect(screen.getByRole('heading', { name: 'Transaction' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Report Issue' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('files_unavailable');
    const retry = screen.getByRole('button', { name: 'Retry loading files' });
    membersApi.get.mockResolvedValue({ status: 200, data: { members: [] } });
    fireEvent.click(retry);
    await screen.findByText('No files are available yet.');
    expect(membersApi.get).toHaveBeenCalledTimes(2);
    expect(membersApi.post).not.toHaveBeenCalled();
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
  });

  it('keeps unexpected successful probe statuses unavailable', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    membersApi.get.mockResolvedValue({ status: 204 });
    render(<OrderDetailPage />);
    await screen.findByText('Order dataset');
    expect(screen.queryByRole('button', { name: 'Retry loading files' })).toBeNull();
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
  });

  it('treats a 200 without a members array as unavailable rather than a directory', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    membersApi.get.mockResolvedValue({ status: 200, data: {} });
    render(<OrderDetailPage />);
    await screen.findByText('Order dataset');
    expect(screen.getByRole('alert').textContent).toContain('files_unavailable');
    expect(screen.queryByText('No files are available yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry loading files' })).toBeNull();
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
  });

  it('permits legacy access only after a retry returns a definitive 404', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    membersApi.get.mockRejectedValue({ response: { status: 503 } });
    render(<OrderDetailPage />);
    const retry = await screen.findByRole('button', { name: 'Retry loading files' });
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(membersApi.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
    expect(ordersApi.requestDownload).not.toHaveBeenCalled();
    membersApi.get.mockRejectedValue({ response: { status: 404 } });
    fireEvent.click(retry);
    await waitFor(() => expect(ordersApi.requestDownload).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Files in this dataset')).toBeNull();
  });

  it('does not show directory access controls to the seller', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ buyer_id: 'buyer-2', seller_id: auth.userId, status: 'fulfilled' }));
    render(<OrderDetailPage />);
    await screen.findByText(/available to the buyer/);
    expect(screen.queryByText('Files in this dataset')).toBeNull();
    expect(membersApi.get).not.toHaveBeenCalled();
    expect(membersApi.post).not.toHaveBeenCalled();
  });

});
