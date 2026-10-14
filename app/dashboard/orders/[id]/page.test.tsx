// @vitest-environment jsdom

import { AxiosError } from 'axios';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const workspaceApi = vi.hoisted(() => ({ requestWorkspaceDownload: vi.fn(), requestWorkspaceFile: vi.fn() }));
vi.mock('@/api/sellerWorkspaceDownload', async (original) => ({
  ...await original<typeof import('@/api/sellerWorkspaceDownload')>(), ...workspaceApi,
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
  return { useTermsGate: (...args: Parameters<typeof actual.useTermsGate>) => terms.realGate ? actual.useTermsGate(...args) : ({
    ensureTermsAccepted: terms.ensureTermsAccepted,
    TermsGatePrompt: () => null,
    checkingTerms: false,
    termsAccepted: false,
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

  it('offers an explicit protected download link only after new acceptance', async () => {
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
    const link = await screen.findByRole('link', { name: 'Open download' });
    expect(link.getAttribute('href')).toBe('https://public.example.test/data.csv');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(open).not.toHaveBeenCalled();
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
    const button = await screen.findByRole('button', { name: 'Download' });
    await waitFor(() => expect(legalApi.getTermsAcceptanceStatus).toHaveBeenCalledTimes(1));
    fireEvent.click(button);
    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://public.example.test/data.csv', '_blank', 'noopener,noreferrer',
    );
    expect(legalApi.getTermsAcceptanceStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Open download' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Accept Terms and Conditions' })).toBeNull();
  });

  it('offers a fresh download activation when acceptance verification finishes after the click', async () => {
    terms.realGate = true;
    let verify!: (status: { accepted: boolean }) => void;
    legalApi.getTermsAcceptanceStatus.mockReturnValue(new Promise((resolve) => { verify = resolve; }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    ordersApi.getOrder.mockResolvedValue({ ...order(), status: 'delivered' });
    ordersApi.getOrderAccess.mockResolvedValue({ delivery_type: 'reference', can_download: true,
      download_urls: [{ url: 'https://public.example.test/data.csv' }] });
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(screen.queryByRole('link', { name: 'Open download' })).toBeNull();
    verify({ accepted: true });
    const link = await screen.findByRole('link', { name: 'Open download' });
    expect(link.getAttribute('href')).toBe('https://public.example.test/data.csv');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(open).not.toHaveBeenCalled();
  });

  it.each(['denied', 'dismissed'])('exposes no reference link when acceptance is %s', async (outcome) => {
    terms.realGate = true;
    // Reference downloads require verified acceptance even when the general gate is advisory.
    vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'false');
    legalApi.getTermsAcceptanceStatus.mockImplementation(() => outcome === 'denied'
      ? Promise.reject(new Error('Denied')) : Promise.resolve({ accepted: false }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    ordersApi.getOrder.mockResolvedValue({ ...order(), status: 'delivered' });
    ordersApi.getOrderAccess.mockResolvedValue({ delivery_type: 'reference', can_download: true,
      download_urls: [{ url: 'https://public.example.test/data.csv' }] });
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    if (outcome === 'dismissed') {
      await screen.findByRole('heading', { name: 'Accept Terms and Conditions' });
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    } else {
      await waitFor(() => expect(legalApi.getTermsAcceptanceStatus).toHaveBeenCalledTimes(2));
      await waitFor(() => expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(false));
    }
    expect(screen.queryByRole('link', { name: 'Open download' })).toBeNull();
    expect(document.querySelector('a[href="https://public.example.test/data.csv"]')).toBeNull();
    expect(open).not.toHaveBeenCalled();
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

  describe('retained partial-refund download presentation', () => {
    function partial(workspace_delivery: boolean, overrides = {}) {
      // No frontend delivery timestamp: the server can establish transaction fallback.
      return { ...order(), status: 'partially_refunded', workspace_delivery, ...overrides };
    }
    function metadata(workspace: boolean, overrides = {}) {
      return { order_id: 'order-1', is_delivered: true, is_revoked: false, access_open: true,
        downloads_remaining: workspace ? 2 : null,
        message: workspace ? 'Download access is unavailable.' : 'Ready to download.',
        can_download: !workspace,
        ...(workspace ? {} : { delivery_type: 'reference', download_urls: [{ url: 'https://public.example.test/data.csv', filename: 'data.csv' }] }),
        ...overrides };
    }
    function expectNoControls() {
      expect(screen.queryByRole('button', { name: /Continue to download|Download data.csv|Download files/ })).toBeNull();
      expect(screen.queryByRole('link', { name: /Open download/ })).toBeNull();
      expect(workspaceApi.requestWorkspaceDownload).not.toHaveBeenCalled();
      expect(workspaceApi.requestWorkspaceFile).not.toHaveBeenCalled();
    }
    for (const workspace of [false, true]) {
      it(`restores server-evidenced prior delivery with explicit terms and click, workspace=${workspace}`, async () => {
        terms.realGate = true;
        vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'true');
        legalApi.getTermsAcceptanceStatus.mockResolvedValue({ accepted: false });
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace, { message: 'A display message may change independently.' }));
        render(<OrderDetailPage />);
        const button = await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download data.csv' });
        expect(ordersApi.getOrderAccess).toHaveBeenCalledExactlyOnceWith('order-1');
        expect(workspaceApi.requestWorkspaceDownload).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
        fireEvent.click(button);
        await screen.findByRole('heading', { name: 'Accept Terms and Conditions' });
        expect(workspaceApi.requestWorkspaceDownload).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Accept terms' }));
        if (workspace) {
          const download = await screen.findByRole('button', { name: 'Download files' });
          expect(workspaceApi.requestWorkspaceDownload).not.toHaveBeenCalled();
          workspaceApi.requestWorkspaceDownload.mockRejectedValue({ response: { status: 403 } });
          fireEvent.click(download);
          await waitFor(() => expect(workspaceApi.requestWorkspaceDownload).toHaveBeenCalledTimes(1));
          expect(workspaceApi.requestWorkspaceDownload.mock.calls[0][0]).toBe('order-1');
          expect(workspaceApi.requestWorkspaceFile).not.toHaveBeenCalled();
        } else {
          expect((await screen.findByRole('link', { name: 'Open download data.csv' })).getAttribute('href')).toBe('https://public.example.test/data.csv');
        }
        expect(open).not.toHaveBeenCalled();
      });

      const transportRefusals: Array<[string, Record<string, unknown>]> = workspace ? [
          ['zero allowance', { downloads_remaining: 0 }], ['unknown allowance', { downloads_remaining: null }],
          
        ] : [
          ['denied', { can_download: false }], ['empty URLs', { download_urls: [] }],
          ['unsafe URLs', { download_urls: [{ url: 'javascript:alert(1)' }] }],
        ];
      it.each<[string, Record<string, unknown>]>([
        ['undelivered', { is_delivered: false }], ['revoked', { is_revoked: true }],
        ['closed despite unrevoked flag', { access_open: false }],
        ['unknown closure decision', { access_open: undefined }],
        ['non-boolean closure decision', { access_open: 'true' }],
        ['foreign', { order_id: 'other-order' }], ['missing identity', { order_id: undefined }],
        ['unknown delivery', { is_delivered: undefined }], ['unknown revocation', { is_revoked: undefined }],
        ...transportRefusals,
      ])(`refuses %s metadata, workspace=${workspace}`, async (_name, overrides) => {
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace, overrides));
        render(<OrderDetailPage />);
        await screen.findByText('Order dataset');
        await act(async () => {});
        expect(ordersApi.getOrderAccess).toHaveBeenCalledTimes(1);
        expectNoControls();
      });

      it.each(['seller', 'foreign viewer', 'full refund', 'expired']) (`does not read or grant for %s, workspace=${workspace}`, async (kind) => {
        if (kind === 'seller') auth.userId = 'seller-1';
        if (kind === 'foreign viewer') auth.userId = 'foreign';
        ordersApi.getOrder.mockResolvedValue(partial(workspace, {
          ...(kind === 'full refund' ? { status: 'refunded' } : {}),
          ...(kind === 'expired' ? { access_expired: true } : {}),
        }));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace));
        render(<OrderDetailPage />);
        await screen.findByText('Order dataset');
        await act(async () => {});
        expect(ordersApi.getOrderAccess).not.toHaveBeenCalled();
        expectNoControls();
      });

      it.each(['empty', 'failure', 'loading'])(`fails closed for %s read, workspace=${workspace}`, async (kind) => {
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        if (kind === 'empty') ordersApi.getOrderAccess.mockResolvedValue(null);
        if (kind === 'failure') ordersApi.getOrderAccess.mockRejectedValue({ response: { status: 403 } });
        if (kind === 'loading') ordersApi.getOrderAccess.mockReturnValue(new Promise(() => {}));
        render(<OrderDetailPage />);
        await screen.findByText('Order dataset');
        await act(async () => {});
        expectNoControls();
      });

      it.each(['denied', 'dismissed'])(`does not activate after terms are %s, workspace=${workspace}`, async (outcome) => {
        terms.realGate = true;
        vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'true');
        legalApi.getTermsAcceptanceStatus.mockImplementation(() => outcome === 'denied'
          ? Promise.reject(new Error('Denied')) : Promise.resolve({ accepted: false }));
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace));
        render(<OrderDetailPage />);
        fireEvent.click(await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download data.csv' }));
        if (outcome === 'dismissed') {
          await screen.findByRole('heading', { name: 'Accept Terms and Conditions' });
          fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        } else await waitFor(() => expect(legalApi.getTermsAcceptanceStatus).toHaveBeenCalled());
        expect(screen.queryByRole('button', { name: 'Download files' })).toBeNull();
        expect(screen.queryByRole('link', { name: /Open download/ })).toBeNull();
        expect(workspaceApi.requestWorkspaceDownload).not.toHaveBeenCalled();
      });

      it(`withdraws resolved metadata when the viewer becomes the seller, workspace=${workspace}`, async () => {
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace));
        const view = render(<OrderDetailPage />);
        await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download data.csv' });
        auth.userId = 'seller-1';
        view.rerender(<OrderDetailPage />);
        expectNoControls();
        await act(async () => {});
        expect(ordersApi.getOrderAccess).toHaveBeenCalledTimes(1);
      });

      it.each(['resolved', 'pending'])(`never borrows %s access after route changes, workspace=${workspace}`, async (kind) => {
        let finish!: (data: unknown) => void;
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        ordersApi.getOrderAccess.mockReturnValueOnce(kind === 'resolved' ? Promise.resolve(metadata(workspace)) : new Promise(resolve => { finish = resolve; }));
        const view = render(<OrderDetailPage />);
        await screen.findByText('Order dataset');
        if (kind === 'resolved') await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download data.csv' });
        navigation.orderId = 'order-2';
        ordersApi.getOrder.mockResolvedValue(partial(workspace, { id: 'order-2', listing_title: 'Second dataset' }));
        ordersApi.getOrderAccess.mockRejectedValue({ response: { status: 403 } });
        view.rerender(<OrderDetailPage />);
        expectNoControls();
        await screen.findByText('Second dataset');
        if (kind === 'pending') await act(async () => finish(metadata(workspace)));
        await act(async () => {});
        expect(ordersApi.getOrderAccess.mock.calls.map(call => call[0])).toEqual(['order-1', 'order-2']);
        expectNoControls();
      });

      it.each(['uppercase', 'compact'])(`accepts equivalent UUID route spelling %s, workspace=${workspace}`, async (spelling) => {
        const canonical = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        navigation.orderId = spelling === 'uppercase' ? canonical.toUpperCase() : canonical.replaceAll('-', '');
        ordersApi.getOrder.mockResolvedValue(partial(workspace, { id: canonical }));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace, { order_id: canonical }));
        render(<OrderDetailPage />);
        await screen.findByText('Order dataset');
        await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download data.csv' });
        expect(ordersApi.getOrder).toHaveBeenCalledWith(canonical);
        expect(ordersApi.getOrderAccess).toHaveBeenCalledWith(canonical);
        expect(workspaceApi.requestWorkspaceDownload).not.toHaveBeenCalled();
      });

      it.each(['404', 'network'])(`renders failed route request and recovers, failure=%s, workspace=${workspace}`, async (failure) => {
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace));
        const view = render(<OrderDetailPage />);
        await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download data.csv' });
        navigation.orderId = 'order-2';
        const requestError = failure === '404'
          ? Object.assign(new AxiosError('Not found'), { response: { status: 404 } })
          : new Error('Network failed');
        ordersApi.getOrder.mockRejectedValue(requestError);
        view.rerender(<OrderDetailPage />);
        expectNoControls();
        await screen.findByText(failure === '404' ? 'Order not found.' : 'Failed to load order details.');
        expect(screen.queryByText('Order dataset')).toBeNull();
        expectNoControls();
        navigation.orderId = 'order-3';
        ordersApi.getOrder.mockResolvedValue(partial(workspace, { id: 'order-3', listing_title: 'Recovered dataset' }));
        ordersApi.getOrderAccess.mockResolvedValue(metadata(workspace, { order_id: 'order-3' }));
        view.rerender(<OrderDetailPage />);
        await screen.findByText('Recovered dataset');
        await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download data.csv' });
        expect(screen.queryByText('Order not found.')).toBeNull();
        expect(screen.queryByText('Failed to load order details.')).toBeNull();
        expect(workspaceApi.requestWorkspaceDownload).not.toHaveBeenCalled();
      });

      it(`cancels a pending metadata result on unmount, workspace=${workspace}`, async () => {
        let finish!: (data: unknown) => void;
        ordersApi.getOrder.mockResolvedValue(partial(workspace));
        ordersApi.getOrderAccess.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const view = render(<OrderDetailPage />);
        await screen.findByText('Order dataset');
        view.unmount();
        await act(async () => finish(metadata(workspace)));
        expectNoControls();
      });
    }
  });

});
