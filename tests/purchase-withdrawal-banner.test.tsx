// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { AxiosError } from 'axios';
import OrderDetailPage from '@/app/dashboard/orders/[id]/page';
import PurchaseEvidence from '@/components/orders/PurchaseEvidence';
import { DELIVERY_NOTICES, REDACTED_NOTICE, UNAVAILABLE_NOTICE, WITHDRAWN_NOTICE } from '@/lib/order-purchase-evidence';
import type { BuyerOrderDetail } from '@/types';

const ports = vi.hoisted(() => ({ get: vi.fn(), report: vi.fn(), gateway: vi.fn(), userId: 'buyer-1', orderId: 'order-1' }));
vi.mock('@/api/client', () => ({ api: { get: ports.get } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: ports.orderId }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/store/auth', () => ({ useAuthStore: (select: (value: unknown) => unknown) => select({ user: { id: ports.userId } }) }));
vi.mock('@/components/allai/AllAIContext', () => ({ useAllAI: () => ({ openReportIssue: ports.report }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({
  ensureTermsAccepted: async (action: () => unknown) => action(), TermsGatePrompt: () => null, checkingTerms: false,
}) }));
vi.mock('@/components/orders/GatewayDeliverySection', () => ({ default: ({ onPresenceChange }: { onPresenceChange: (present: boolean) => void }) => {
  ports.gateway();
  useEffect(() => onPresenceChange(false), [onPresenceChange]);
  return <div>Gateway delivery check</div>;
} }));

const html = '<article><h1>Purchased v1</h1><p>Original seller evidence.</p></article>';
const approved = { state: 'approved' as const, approval_id: 'approval-v1', listing_version_id: 'version-v1',
  render_hash: bytesToHex(sha256(new TextEncoder().encode(html))), rendered_html: html, notice: null };
const base: BuyerOrderDetail = { id: 'order-1', listing_id: 'listing-1', listing_title: 'Purchased v1',
  buyer_id: 'buyer-1', seller_id: 'seller-1', seller_name: null, amount: 25, status: 'completed',
  created_at: '2026-11-01T00:00:00Z', updated_at: null, workspace_delivery: true, access_expired: false,
  purchased_presentation: approved, listing_notice: WITHDRAWN_NOTICE, delivery_access_state: 'within_order_terms' };

function documentResponse(text = 'Accepted document A (retired)', contentType = 'text/plain') {
  const bytes = new TextEncoder().encode(text);
  return { data: bytes.buffer, headers: { 'content-type': contentType, 'cache-control': 'private, no-store',
    'x-license-source-sha256': bytesToHex(sha256(bytes)) } };
}
function noDocument(detail = 'No recorded licence document is available', status = 404) {
  return Object.assign(new AxiosError('Document refused'), { response: { status,
    data: new TextEncoder().encode(JSON.stringify({ detail })).buffer } });
}
function install(order: BuyerOrderDetail = base, doc: () => Promise<unknown> = async () => documentResponse()) {
  ports.get.mockImplementation((path: string) => {
    if (path === `/orders/${order.id}`) return Promise.resolve({ data: order });
    if (path === `/orders/${order.id}/events`) return Promise.resolve({ data: [{ id: 'paid', event_type: 'paid', created_at: base.created_at }] });
    if (path === `/orders/${order.id}/license-document`) return doc();
    if (path === `/orders/${order.id}/access`) return Promise.resolve({ data: { can_download: true, delivery_type: 'reference', download_urls: [{ url: 'https://storage.example/file', filename: 'v1.csv' }] } });
    throw new Error(`Unexpected API request ${path}`);
  });
}
beforeEach(() => {
  ports.get.mockReset(); ports.report.mockReset(); ports.gateway.mockReset(); ports.userId = 'buyer-1'; ports.orderId = 'order-1';
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected fetch'); }));
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:accepted'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('purchase notices and frozen evidence', () => {
  it.each([
    ['paused', null], ['hidden', null], ['withdrawn', WITHDRAWN_NOTICE], ['restricted', DELIVERY_NOTICES.restricted],
  ])('renders the purchased version after %s without reading a public listing', async (state, notice) => {
    install({ ...base, listing_notice: notice, delivery_access_state: state === 'restricted' ? state : 'within_order_terms' });
    render(<OrderDetailPage />);
    const frame = await screen.findByTitle('Listing description for the purchased version');
    expect(frame.getAttribute('srcdoc')).toBe(html);
    expect(frame.getAttribute('sandbox')).toBe('');
    if (notice) expect(screen.getByText(notice)).toBeTruthy();
    expect(await screen.findByText('Accepted document A (retired)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Original licence record' }).getAttribute('href')).toBe('/dashboard/orders/order-1/license-record');
    expect(screen.getByText('Amount Paid').nextElementSibling?.textContent).toBe('$25.00');
    expect(screen.getByText('Payment received')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Report Issue' }));
    expect(ports.report).toHaveBeenCalledWith('order-1');
    expect(ports.get.mock.calls.every(([path]) => path.startsWith('/orders/'))).toBe(true);
  });

  it('uses the exact redaction notice and keeps delivery available', async () => {
    install({ ...base, purchased_presentation: { ...approved, state: 'redacted', rendered_html: null, notice: REDACTED_NOTICE } });
    render(<OrderDetailPage />);
    expect(await screen.findByText(REDACTED_NOTICE)).toBeTruthy();
    expect(screen.queryByTitle('Listing description for the purchased version')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue to download' })).toBeTruthy();
    expect(await screen.findByText('Accepted document A (retired)')).toBeTruthy();
  });

  it.each([
    null,
    { state: 'unavailable' as const, notice: UNAVAILABLE_NOTICE },
    { ...approved, render_hash: '0'.repeat(64) },
    { ...approved, listing_version_id: null },
    { ...approved, state: 'unavailable' as const },
  ])('fails closed for unavailable or damaged presentation %o', presentation => {
    render(<PurchaseEvidence order={{ ...base, purchased_presentation: presentation }} />);
    expect(screen.getByText(UNAVAILABLE_NOTICE)).toBeTruthy();
    expect(screen.queryByTitle('Listing description for the purchased version')).toBeNull();
  });

  it('shows the explicit pre-snapshot state without creating document content', async () => {
    install({ ...base, purchased_presentation: { state: 'unavailable', notice: UNAVAILABLE_NOTICE } }, async () => { throw noDocument(); });
    render(<OrderDetailPage />);
    expect(await screen.findByText('No recorded licence document is available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download accepted licence' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue to download' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Original licence record' })).toBeTruthy();
  });

  it('preserves the seller order view with private evidence and the seller licence record', async () => {
    ports.userId = 'seller-1'; install(); render(<OrderDetailPage />);
    expect(await screen.findByTitle('Listing description for the purchased version')).toBeTruthy();
    expect(await screen.findByText('Accepted document A (retired)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Original licence record' }).getAttribute('href')).toBe('/dashboard/sales/order-1/license-record');
    expect(screen.queryByRole('button', { name: 'Continue to download' })).toBeNull();
    expect(ports.gateway).not.toHaveBeenCalled();
  });
});

describe('delivery_access_state gates every delivery UI', () => {
  for (const workspace of [true, false]) {
    it.each(['within_order_terms', 'restricted', 'destroyed', 'unavailable', 'future_state'])('handles %s with workspace=' + workspace, async state => {
      install({ ...base, workspace_delivery: workspace, delivery_access_state: state,
        listing_notice: state === 'restricted' || state === 'destroyed' ? DELIVERY_NOTICES[state] : null });
      render(<OrderDetailPage />);
      await screen.findByRole('heading', { name: 'Order #order-1' });
      const allowed = state === 'within_order_terms';
      if (allowed) {
        expect(await screen.findByRole('button', { name: workspace ? 'Continue to download' : 'Download v1.csv' })).toBeTruthy();
        expect(ports.gateway).toHaveBeenCalled();
      } else {
        expect(screen.getByRole('heading', { name: 'Delivery unavailable' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Continue to download|Download v1.csv/ })).toBeNull();
        expect(ports.gateway).not.toHaveBeenCalled();
        expect(ports.get.mock.calls.some(([path]) => path.endsWith('/access'))).toBe(false);
      }
      expect(await screen.findByText('Accepted document A (retired)')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Original licence record' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Report Issue' })).toBeTruthy();
    });
  }
  it.each(['restricted', 'destroyed', 'unavailable'])('does not mount pending Workspace recovery when %s', async state => {
    install({ ...base, status: 'pending_delivery', delivery_access_state: state });
    render(<OrderDetailPage />);
    await screen.findByRole('heading', { name: 'Delivery unavailable' });
    expect(ports.get.mock.calls.some(([path]) => /prepare|delivery|access/.test(path))).toBe(false);
    expect(screen.queryByRole('button', { name: /Retry|download/i })).toBeNull();
  });
});

describe('accepted document through the order', () => {
  it('views document A and downloads A with the exact order-bound download=0|1 contract', async () => {
    install();
    const create = vi.fn(() => 'blob:accepted'); const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download accepted licence' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const reads = ports.get.mock.calls.filter(([path]) => path.endsWith('/license-document'));
    expect(reads.map(([, options]) => options.params)).toEqual([{ download: 0 }, { download: 1 }]);
    for (const [, options] of reads) expect(options).toMatchObject({ adapter: 'fetch', fetchOptions: { cache: 'no-store' }, responseType: 'arraybuffer' });
    expect(ports.get.mock.calls.some(([path]) => path.startsWith('/listings/'))).toBe(false);
  });

  it('reads the accepted PDF and revokes its private object URL on unmount', async () => {
    install(base, async () => documentResponse('%PDF-1.4 Accepted document A', 'application/pdf'));
    const view = render(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Read accepted licence PDF' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('object')?.getAttribute('data')).toBe('blob:accepted');
    expect(dialog.querySelector('object')?.getAttribute('type')).toBe('application/pdf');
    expect(screen.getByRole('link', { name: 'Open in new tab' }).getAttribute('href')).toBe('blob:accepted');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:accepted');
  });

  it.each(['missing bytes', 'forbidden', 'other missing document', 'hash mismatch', 'public cache'])('renders %s as unavailable without inventing a pre-snapshot state', async reason => {
    install(base, async () => {
      if (reason === 'missing bytes') throw noDocument('Licence document unavailable', 503);
      if (reason === 'forbidden') throw noDocument('Access denied', 403);
      if (reason === 'other missing document') throw noDocument('Licence document not found');
      const value = documentResponse();
      if (reason === 'hash mismatch') value.headers['x-license-source-sha256'] = '0'.repeat(64);
      else value.headers['cache-control'] = 'public, max-age=600';
      return value;
    });
    render(<OrderDetailPage />);
    expect(await screen.findByText('Licence document unavailable. Contact support through your order.')).toBeTruthy();
    expect(screen.queryByText('No recorded licence document is available')).toBeNull();
    expect(screen.queryByText('Accepted document A (retired)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download accepted licence' })).toBeNull();
  });

  it('discards a late accepted-document response when the account changes', async () => {
    let finish!: (value: unknown) => void;
    install(base, () => new Promise(resolve => { finish = resolve; }));
    const view = render(<OrderDetailPage />);
    await screen.findByText('Loading accepted licence document…');
    const signal = ports.get.mock.calls.find(([path]) => path.endsWith('/license-document'))![1].signal as AbortSignal;
    ports.userId = 'other-user';
    view.rerender(<OrderDetailPage />);
    await act(async () => finish(documentResponse('Private accepted text')));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText('Private accepted text')).toBeNull();
  });
});
