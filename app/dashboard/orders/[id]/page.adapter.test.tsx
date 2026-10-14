// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn() }));
const navigation = vi.hoisted(() => ({ id: 'synthetic-order' }));
vi.mock('@/api/client', () => ({ api: client }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: navigation.id }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/store/auth', () => ({
  useAuthStore: <T,>(selector: (state: { user: { id: string } }) => T) => selector({ user: { id: 'buyer-1' } }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/legal/TermsGate', () => ({
  useTermsGate: () => ({ ensureTermsAccepted: vi.fn(), TermsGatePrompt: () => null, checkingTerms: false }),
}));
vi.mock('@/components/orders/GatewayDeliverySection', () => ({ default: () => null }));
import OrderDetailPage from './page';

const retained = {
  id: 'synthetic-order', buyer_id: 'buyer-1', seller_id: 'seller-1', listing_id: 'listing-1',
  status: 'completed', currency: 'USD', created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z', access_expired: false,
  access_expires_at: null, purchased_version: null, newer_version_available: false,
  access_url: null, download_count: 0,
};

const cases = [
  { name: 'non-workspace canonical backend response', fields: { workspace_delivery: false, amount_cents: 12345, listing_snapshot: { title: 'Canonical purchase' } }, title: 'Canonical purchase', price: '$123.45' },
  { name: 'workspace canonical control', fields: { workspace_delivery: true, amount_cents: 12345, listing_snapshot: { title: 'Workspace purchase' } }, title: 'Workspace purchase', price: '$123.45' },
  { name: 'legacy response', fields: { workspace_delivery: false, amount: 12.34, listing_title: 'Legacy purchase' }, title: 'Legacy purchase', price: '$12.34' },
  { name: 'canonical zero over legacy amount', fields: { workspace_delivery: false, amount_cents: 0, amount: 99, listing_snapshot: { title: 'Zero purchase' } }, title: 'Zero purchase', price: '$0.00' },
  { name: 'encoded route id', id: 'order/with ?#%', fields: { amount_cents: 12345, listing_snapshot: { title: 'Encoded purchase' } }, title: 'Encoded purchase', price: '$123.45' },
];

describe('mounted order detail through the real order adapter', () => {
  beforeEach(() => {
    client.get.mockReset();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each(cases)('renders $name', async ({ fields, title, price, id }) => {
    navigation.id = id ?? retained.id;
    const path = `/orders/${encodeURIComponent(navigation.id)}`;
    const data = Object.freeze({ ...retained, ...fields, id: navigation.id });
    client.get.mockImplementation((url: string) => {
      if (url === path) return Promise.resolve({ data });
      if (url === `${path}/events`) return Promise.resolve({ data: [] });
      if (url === `${path}/access`) return Promise.resolve({ data: { can_download: false } });
      throw new Error(`Unexpected API request: ${url}`);
    });

    render(<OrderDetailPage />);
    await screen.findByRole('heading', { name: `Order #${navigation.id.slice(0, 8)}` });
    expect.soft(screen.getByText('Listing').nextElementSibling?.textContent).toBe(title);
    expect.soft(screen.getByText('Amount Paid').nextElementSibling?.textContent).toBe(price);
    expect.soft(screen.queryByText('$NaN')).toBeNull();
    expect(client.get.mock.calls.filter(([url]) => url === path)).toHaveLength(1);
    expect(client.get).toHaveBeenCalledWith(`${path}/events`);
    if (fields.workspace_delivery) {
      expect(screen.getByRole('button', { name: 'Continue to download' })).toBeTruthy();
      expect(client.get).not.toHaveBeenCalledWith(`${path}/access`);
    } else {
      await waitFor(() => expect(client.get).toHaveBeenCalledWith(`${path}/access`));
      expect(screen.queryByRole('button', { name: 'Continue to download' })).toBeNull();
    }
    expect(data).toEqual({ ...retained, ...fields, id: navigation.id });
  });
});
