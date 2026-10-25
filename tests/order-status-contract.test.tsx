// @vitest-environment jsdom
// Hosted CI only. Actual components with synthetic ports; no production stores,
// Terms, licences, checkout transports or preview fixture imports.
import React, { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuyButton from '@/components/BuyButton';
import OrdersListPage from '@/app/dashboard/orders/page';
import OrderDetailPage from '@/app/dashboard/orders/[id]/page';
import DashboardOverview from '@/app/dashboard/page';
import type { BuyerOrder, BuyerOrderDetail, OrderStatus } from '@/types';

const ports = vi.hoisted(() => ({
  state: { user: { id: 'synthetic-buyer' }, token: 'synthetic', isAuthenticated: true, hydrated: true, isLoading: false },
  orders: vi.fn(), order: vi.fn(), access: vi.fn(), transactions: vi.fn(),
  refused: vi.fn(() => { throw new Error('Unexpected operation'); }),
}));
vi.mock('@/store/auth', () => ({ useAuthStore: Object.assign((select?: (s: typeof ports.state) => unknown) => select ? select(ports.state) : ports.state, { getState: () => ports.state }) }));
vi.mock('@/api/capabilities', () => ({ getCapabilities: async () => ({ seller: { effective_status: 'not_requested', missing_steps: [] } }), requestSellerCapability: ports.refused }));
vi.mock('@/api/connect', () => ({ getConnectStatus: ports.refused, getConnectOnboarding: ports.refused, isConnectOnboardingTwoFactorRequired: ports.refused, redirectToConnectOnboarding: ports.refused }));
vi.mock('@/api/auth', () => ({ setup2FA: ports.refused, verify2FASetup: ports.refused, SSO_MANAGED_2FA_MESSAGE: 'Synthetic' }));
vi.mock('@/api/seller', () => ({ getSellerStats: ports.refused }));
vi.mock('@/api/listings', () => ({ getMyListings: ports.refused }));
vi.mock('@/lib/two-factor-policy', () => ({ accountReauthMethod: () => 'password', setupRestriction: () => null, setupRefusal: ports.refused, sellerSecuritySatisfied: () => true }));
vi.mock('@/components/CompanyAuthenticator', () => ({ companyEnrollmentOffered: () => false }));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ notifyCapabilitiesChanged: ports.refused }));
vi.mock('@/app/dashboard/settings/ReauthModal', () => ({ default: () => null }));
vi.mock('@/components/TotpQrCode', () => ({ default: ports.refused }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'synthetic-order' }), useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/hooks/useSessionGeneration', () => ({ useSessionGeneration: () => 0 }));
vi.mock('@/hooks/useListingOwnership', () => ({ useListingOwnership: () => ({ isOwner: false, checkingOwnership: false }) }));
vi.mock('@/api/orders', () => ({ getMyOrders: ports.orders, getOrder: ports.order, getOrderEvents: async () => [], getOrderAccess: ports.access }));
vi.mock('@/api/transactions', () => ({ getMyTransactions: ports.transactions, getTransaction: ports.refused, confirmTransaction: ports.refused, deliverTransaction: ports.refused }));
vi.mock('@/api/checkout', () => ({ createCheckout: ports.refused }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: ports.refused }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ ensureTermsAccepted: ports.refused, TermsGatePrompt: () => null, checkingTerms: false }) }));
vi.mock('@/components/legal/termsContext', () => ({ getTermsPartyContext: () => ({ party_type: 'user', party_id: 'synthetic-buyer' }) }));
vi.mock('@/components/legal/VersionedTermsCopy', () => ({ useServedTermsVersion: () => null }));
vi.mock('@/components/legal/terms12Copy', () => ({ CARD_BUYER_TOTAL: 'Synthetic' }));
vi.mock('@/components/CountrySelect', () => ({ default: () => null }));
vi.mock('@/components/ListingLicenseDisclosure', () => ({ default: () => null }));
vi.mock('@/lib/checkout-domain', () => ({ checkoutDomainEnabled: () => false, checkoutBlock: ports.refused, checkoutDestination: ports.refused, checkoutErrorCode: ports.refused, checkoutOutcome: ports.refused, checkoutWebPath: ports.refused }));
vi.mock('@/lib/checkout-replay', () => ({ checkoutReplayKey: (...args: unknown[]) => JSON.stringify(args), readCheckoutReplay: () => null, saveCheckoutReplay: ports.refused, clearCheckoutReplay: ports.refused }));
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({ default: () => null }));
vi.mock('@/components/orders/GatewayDeliverySection', () => ({ default: () => null }));
vi.mock('@/components/orders/WorkspaceDownload', () => ({ default: ports.refused }));
vi.mock('@/components/orders/WorkspacePurchaseRecovery', () => ({ default: ports.refused }));

const canonical = [
  ['created', 'Created'], ['paid', 'Paid'], ['in_escrow', 'In escrow'],
  ['pending_delivery', 'Pending delivery'], ['delivered', 'Delivered'],
  ['completed', 'Completed'], ['disputed', 'Disputed'], ['resolved', 'Resolved'],
  ['delivery_failed', 'Delivery failed'], ['partially_refunded', 'Partially refunded'],
  ['refunded', 'Refunded'], ['cancelled', 'Cancelled'],
] as const satisfies ReadonlyArray<readonly [OrderStatus, string]>;
const legacy = [
  ['fulfilled', 'Fulfilled'], ['pending_fulfillment', 'Pending Fulfillment'], ['payment_failed', 'Payment Failed'],
] as const satisfies ReadonlyArray<readonly [OrderStatus, string]>;
function order(status: OrderStatus, expired = false): BuyerOrderDetail {
  return { id: 'synthetic-order', listing_id: 'synthetic-listing', listing_title: 'Synthetic dataset',
    buyer_id: 'synthetic-buyer', seller_id: 'synthetic-seller', seller_name: null,
    status, amount: 25, created_at: '2026-10-25T00:00:00Z', updated_at: null, access_expired: expired };
}
async function mount(node: React.ReactNode) {
  await act(async () => { render(<StrictMode>{node}</StrictMode>); });
}
beforeEach(() => {
  vi.stubGlobal('fetch', ports.refused);
  vi.stubGlobal('crypto', { randomUUID: ports.refused });
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(ports.refused);
  ports.transactions.mockResolvedValue([]);
  // No access is granted by this synthetic server read.
  ports.access.mockRejectedValue(new Error('Synthetic access denied'));
});
afterEach(() => {
  cleanup();
  expect(ports.refused).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals();
});

describe('existing purchase navigation', () => {
  it.each([...canonical.filter(([status]) => status !== 'refunded' && status !== 'cancelled'), ...legacy.slice(0, 2)])('recognizes %s without offering a new purchase', async (status) => {
    ports.orders.mockResolvedValue([order(status)] satisfies BuyerOrder[]);
    await mount(<BuyButton listingId="synthetic-listing" slug="synthetic" price={25} pricingType="one_time" />);
    const label = ['completed', 'delivered', 'fulfilled'].includes(status) ? 'Access Data' : 'View purchase';
    expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe('/dashboard/orders/synthetic-order');
    expect(screen.queryByRole('button', { name: /Buy Now/ })).toBeNull();
    if (label === 'View purchase') expect(screen.queryByRole('link', { name: 'Access Data' })).toBeNull();
  });
  it.each(['completed', 'delivered', 'fulfilled'] as const)('uses honest order navigation for expired %s', async status => {
    ports.orders.mockResolvedValue([order(status, true)]);
    await mount(<BuyButton listingId="synthetic-listing" slug="synthetic" price={25} pricingType="one_time" />);
    expect(screen.getByRole('link', { name: 'View purchase' }).getAttribute('href')).toBe('/dashboard/orders/synthetic-order');
    expect(screen.queryByText('Access Data')).toBeNull();
  });
  it.each(['refunded', 'cancelled', 'payment_failed', 'future_state', '__proto__'] as const)('does not label %s as paid data access', async status => {
    // Cast only at this deliberate unknown-wire boundary.
    ports.orders.mockResolvedValue([{ ...order('created'), status }] as BuyerOrder[]);
    await mount(<BuyButton listingId="synthetic-listing" slug="synthetic" price={25} pricingType="one_time" />);
    expect(screen.queryByRole('link', { name: /Access Data|View purchase/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Buy Now/ })).not.toBeNull();
  });
  it('ignores an active order for another listing', async () => {
    ports.orders.mockResolvedValue([{ ...order('completed'), listing_id: 'another-listing' }]);
    await mount(<BuyButton listingId="synthetic-listing" slug="synthetic" price={25} pricingType="one_time" />);
    expect(screen.queryByText('Access Data')).toBeNull();
    expect(screen.getByRole('button', { name: /Buy Now/ })).not.toBeNull();
  });
});

describe('history and detail status contract', () => {
  it.each([...canonical, ...legacy, ['future_state', 'Unknown'], ['__proto__', 'Unknown']] as const)('presents %s in history, detail and dashboard summary', async (status, label) => {
    const fixture = { ...order('created'), status } as BuyerOrderDetail;
    ports.orders.mockResolvedValue([fixture]); ports.order.mockResolvedValue(fixture);
    await mount(<OrdersListPage />);
    expect(screen.getAllByText(label)).toHaveLength(2);
    expect(screen.getAllByText(label).every(element => element.className.includes('bg-'))).toBe(true);
    cleanup();
    await mount(<OrderDetailPage />);
    expect(screen.getByText(label).className).toContain('bg-');
    cleanup();
    await mount(<DashboardOverview />);
    expect(screen.getByText(label)).not.toBeNull();
  });
  it.each([...canonical, ...legacy])('keeps download navigation status-specific for %s and honors expiry', async (status) => {
    for (const expired of [false, true]) {
      ports.orders.mockResolvedValue([order(status, expired)]);
      await mount(<OrdersListPage />);
      const links = screen.queryAllByRole('link', { name: 'View downloads' });
      expect(links).toHaveLength(!expired && ['completed', 'delivered', 'fulfilled'].includes(status) ? 2 : 0);
      for (const link of links) expect(link.getAttribute('href')).toBe('/dashboard/orders/synthetic-order');
      expect(screen.getByRole('link', { name: '#syntheti' }).getAttribute('href')).toBe('/dashboard/orders/synthetic-order');
      expect(screen.getByRole('link', { name: 'Synthetic dataset' }).getAttribute('href')).toBe('/dashboard/orders/synthetic-order');
      expect(ports.access).not.toHaveBeenCalled();
      cleanup();
    }
  });
});
