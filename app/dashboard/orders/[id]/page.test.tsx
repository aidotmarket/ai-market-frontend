// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyerOrderDetail, OrderEvent, Transaction } from '@/types';

const navigation = vi.hoisted(() => ({ orderId: 'order-1', txId: 'tx-1' }));
const terms = vi.hoisted(() => ({ ensureTermsAccepted: vi.fn(), realGate: false }));
const legalApi = vi.hoisted(() => ({ getTermsAcceptanceStatus: vi.fn() }));
vi.mock('@/api/legal', () => legalApi);
vi.mock('@/components/legal/TermsAcceptanceForm', () => ({
  default: ({ onAccepted }: { onAccepted: () => Promise<void> }) => <button onClick={() => void onAccepted()}>Accept terms</button>,
}));
const auth = vi.hoisted(() => ({ userId: 'viewer-1', role: 'seller' }));
const gatewayApi = vi.hoisted(() => ({ getGatewayDelivery: vi.fn(), reissueGatewayPermission: vi.fn(), reportGatewayProblem: vi.fn() }));
vi.mock('@/api/gatewayDelivery', () => ({ ...gatewayApi, gatewayErrorCode: () => null }));
const ordersApi = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getOrderAccess: vi.fn(),
  getOrderEvents: vi.fn(),
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
vi.mock('@/components/legal/TermsGate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/legal/TermsGate')>();
  return { useTermsGate: () => terms.realGate ? actual.useTermsGate('buyer') : ({
    ensureTermsAccepted: terms.ensureTermsAccepted,
    TermsGatePrompt: () => null,
    checkingTerms: false,
  }) };
});
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({
  default: () => null,
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
    terms.realGate = false;
    navigation.orderId = 'order-1';
    navigation.txId = 'tx-1';
    auth.userId = 'viewer-1';
    auth.role = 'seller';
    terms.ensureTermsAccepted.mockImplementation(async (action: () => unknown) => action());
    gatewayApi.getGatewayDelivery.mockRejectedValue({ response: { status: 404, data: { error: { code: 'not_a_gateway_order' } } } });
    ordersApi.getOrder.mockResolvedValue(order());
    ordersApi.getOrderEvents.mockResolvedValue([]);
    ordersApi.getOrderAccess.mockResolvedValue({ can_download: false });
    transactionsApi.getTransaction.mockResolvedValue(transaction());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not offer Mark Delivered to a buyer of record who also has global seller role', async () => {
    auth.role = 'seller';
    ordersApi.getOrder.mockResolvedValue(order({ buyer_id: auth.userId, seller_id: 'seller-1' }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({ status: 'fulfilling' }));

    render(<OrderDetailPage />);

    expect(await screen.findByText('Order dataset')).not.toBeNull();
    expect(screen.getByText('Identified to ai.market for this order')).not.toBeNull();
    expect(screen.queryByText('Example Seller')).toBeNull();
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
    expect(screen.queryByRole('region', { name: 'Gateway delivery' })).toBeNull();
    expect(gatewayApi.getGatewayDelivery).not.toHaveBeenCalled();
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
    expect(ordersApi.getOrderAccess).not.toHaveBeenCalled();
  });

  it('offers Confirm Receipt to the buyer of record', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ buyer_id: auth.userId, seller_id: 'seller-1' }));
    transactionsApi.getTransaction.mockResolvedValue(transaction({ status: 'delivered' }));

    render(<OrderDetailPage />);

    expect(await screen.findByRole('button', { name: 'Confirm Receipt' })).not.toBeNull();
  });

  it('shows descriptions and readable labels in the order timeline', async () => {
    const created_at = '2026-09-28T10:00:00Z';
    const events: OrderEvent[] = [
      { id: 'described', event_type: 'created', description: 'Custom order note', created_at },
      { id: 'empty', event_type: 'paid', description: '', created_at },
      { id: 'null', event_type: 'disputed', description: null, created_at },
      { id: 'unknown', event_type: 'future_event', created_at },
      { id: 'blank', event_type: '_', description: ' ', created_at },
    ];
    ordersApi.getOrderEvents.mockResolvedValue(events);

    render(<OrderDetailPage />);

    expect(await screen.findByText('Custom order note')).not.toBeNull();
    expect(screen.getByText('Payment received')).not.toBeNull();
    expect(screen.getByText('Issue reported')).not.toBeNull();
    expect(screen.getByText('Future event')).not.toBeNull();
    expect(screen.getByText('Order updated')).not.toBeNull();
    expect(screen.queryByText('Order placed')).toBeNull();
  });

  it('shows Workspace downloads without automatically consuming an allowance', async () => {
    ordersApi.getOrder.mockResolvedValue({...order(),workspace_delivery:true,status:'delivered'});
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button',{name:'Continue to download'}));
    expect(await screen.findByRole('button',{name:'Download files'})).not.toBeNull();
    expect(ordersApi.getOrderAccess).not.toHaveBeenCalled();
  });

  it.each(['fulfilled', 'delivered', 'completed'])('uses retained reference access for a %s order', async (status) => {
    ordersApi.getOrder.mockResolvedValue({ ...order(), status });
    ordersApi.getOrderAccess.mockResolvedValue({
      delivery_type: 'reference', can_download: true,
      download_urls: [{ url: 'https://public.example.test/data.csv', filename: 'data.csv', expires_at: null }],
    });
    render(<OrderDetailPage />);
    const button = await screen.findByRole('button', { name: 'Download data.csv' });
    expect(button.hasAttribute('href')).toBe(false);
    expect(screen.queryByRole('link', { name: 'Download data.csv' })).toBeNull();
    expect(ordersApi.getOrderAccess).toHaveBeenCalledExactlyOnceWith('order-1');
    expect(screen.queryByRole('button', { name: /Refresh|Get download access/ })).toBeNull();
  });

  it('requires acceptance before opening a reference URL with enforcement on', async () => {
    terms.realGate = true;
    vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'true');
    legalApi.getTermsAcceptanceStatus.mockResolvedValue({ accepted: false });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    ordersApi.getOrder.mockResolvedValue({ ...order(), status: 'delivered' });
    ordersApi.getOrderAccess.mockResolvedValue({ delivery_type: 'reference', can_download: true,
      download_urls: [{ url: 'https://public.example.test/data.csv' }] });
    render(<OrderDetailPage />);
    const button = await screen.findByRole('button', { name: 'Download' });
    expect(button.hasAttribute('href')).toBe(false);
    expect(document.querySelector('a[href="https://public.example.test/data.csv"]')).toBeNull();
    fireEvent(button, new MouseEvent('auxclick', { button: 1, bubbles: true }));
    fireEvent.contextMenu(button);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByRole('heading', { name: 'Accept Terms and Conditions' });
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept terms' }));
    await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://public.example.test/data.csv', '_blank', 'noopener,noreferrer',
    ));
  });

  it('opens a reference URL with referrer protections when terms are already accepted', async () => {
    terms.realGate = true;
    vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'true');
    legalApi.getTermsAcceptanceStatus.mockResolvedValue({ accepted: true });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    ordersApi.getOrder.mockResolvedValue({ ...order(), status: 'delivered' });
    ordersApi.getOrderAccess.mockResolvedValue({ delivery_type: 'reference', can_download: true,
      download_urls: [{ url: 'https://public.example.test/data.csv' }] });
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://public.example.test/data.csv', '_blank', 'noopener,noreferrer',
    ));
    expect(screen.queryByRole('heading', { name: 'Accept Terms and Conditions' })).toBeNull();
  });

  it.each([
    { can_download: false },
    { delivery_type: 'reference', can_download: false, download_urls: [{ url: 'https://public.example.test/data.csv' }] },
    { delivery_type: 'reference', can_download: true, download_urls: [] },
    { delivery_type: 'reference', can_download: true, download_urls: [{ url: 'javascript:alert(1)' }] },
  ])('shows neutral unavailable access without a download control for %j', async (access) => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    ordersApi.getOrderAccess.mockResolvedValue(access);
    render(<OrderDetailPage />);
    expect(await screen.findByText('Download access is unavailable.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Preparing download access...')).toBeNull());
    expect(screen.queryByRole('link', { name: /^Download/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Download|Refresh/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Report Issue' })).toBeTruthy();
  });

  it('keeps order details available when retained access is refused', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled' }));
    ordersApi.getOrderAccess.mockRejectedValue({ response: { status: 403 } });
    render(<OrderDetailPage />);
    await screen.findByText('Download access is unavailable.');
    expect(screen.getByText('Order dataset')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Transaction' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Download|Refresh/ })).toBeNull();
  });

  it('does not fetch or offer reference access after the download window expires', async () => {
    ordersApi.getOrder.mockResolvedValue(order({ status: 'fulfilled', access_expired: true }));
    render(<OrderDetailPage />);
    await screen.findByText('Download window expired');
    expect(ordersApi.getOrderAccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /^Download/ })).toBeNull();
  });

  it.each(['delivered', 'completed'])('keeps gateway delivery without contradictory unavailable copy for a %s order', async (status) => {
    ordersApi.getOrder.mockResolvedValue({ ...order(), status });
    ordersApi.getOrderAccess.mockResolvedValue({
      order_id: 'order-1', listing_title: 'Order dataset', status,
      is_delivered: true, is_revoked: false, delivered_at: '2026-08-21T10:30:00Z',
      delivery_method: 'gateway', downloads_remaining: 3,
      access_url: null, can_download: false, message: 'Download access is unavailable.',
    });
    gatewayApi.getGatewayDelivery.mockResolvedValue({ delivery: {
      door_url: 'https://gateway.example.test/door',
      hold: { state: 'no_hold', until: null, disputable: false }, problem: null,
      files: [{ file_id: 'file-1', display_name: 'gateway.csv', size_bytes: 10, sha256: 'abc',
        state: 'not_started', transmitted_bytes: 0,
        permission: { token: 'permission', browser_url: 'https://gateway.example.test/file', download_url: 'https://gateway.example.test/file' },
        reissue: { allowed: false, remaining_24h: 5, blocked_code: null } }],
    } });
    render(<OrderDetailPage />);
    const link = await screen.findByRole('link', { name: 'Download file' });
    expect(link.getAttribute('href')).toBe('https://gateway.example.test/file');
    expect(screen.getByRole('region', { name: 'Gateway delivery' })).toBeTruthy();
    await waitFor(() => expect(ordersApi.getOrderAccess).toHaveBeenCalledExactlyOnceWith('order-1'));
    expect(screen.queryByRole('heading', { name: 'Downloads' })).toBeNull();
    expect(screen.queryByText('Download access is unavailable.')).toBeNull();
  });
});
