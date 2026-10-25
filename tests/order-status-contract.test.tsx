// @vitest-environment jsdom
// Hosted CI only. Actual components with synthetic ports; no production stores,
// Terms, licences, checkout transports or preview fixture imports.
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuyButton from '@/components/BuyButton';
import OrdersListPage from '@/app/dashboard/orders/page';
import OrderDetailPage from '@/app/dashboard/orders/[id]/page';
import DashboardOverview from '@/app/dashboard/page';
import type { BuyerOrder, BuyerOrderDetail, LicenseAcceptanceFields, OrderStatus } from '@/types';

const ports = vi.hoisted(() => ({
  state: { user: { id: 'synthetic-buyer' }, token: 'synthetic', isAuthenticated: true, hydrated: true, isLoading: false },
  domainEnabled: false, isOwner: false, checkingOwnership: false,
  readReplay: vi.fn(), saveReplay: vi.fn(), checkout: vi.fn(),
  orders: vi.fn(), order: vi.fn(), access: vi.fn(), transactions: vi.fn(),
  refused: vi.fn(() => { throw new Error('Unexpected operation'); }),
}));
vi.mock('@/store/auth', () => ({ useAuthStore: Object.assign((select?: (s: typeof ports.state) => unknown) => select ? select(ports.state) : ports.state, { getState: () => ports.state, subscribe: (_listener: (state: typeof ports.state) => void) => () => {} }) }));
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
vi.mock('@/hooks/useListingOwnership', () => ({ useListingOwnership: () => ({ isOwner: ports.isOwner, checkingOwnership: ports.checkingOwnership }) }));
vi.mock('@/api/orders', () => ({ getMyOrders: ports.orders, getOrder: ports.order, getOrderEvents: async () => [], getOrderAccess: ports.access }));
vi.mock('@/api/transactions', () => ({ getMyTransactions: ports.transactions, getTransaction: ports.refused, confirmTransaction: ports.refused, deliverTransaction: ports.refused }));
vi.mock('@/api/checkout', () => ({ createCheckout: ports.checkout }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: ports.refused }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ ensureTermsAccepted: ports.refused, TermsGatePrompt: () => null, checkingTerms: false }) }));
vi.mock('@/components/legal/termsContext', () => ({ getTermsPartyContext: () => ({ party_type: 'user', party_id: 'synthetic-buyer' }) }));
vi.mock('@/components/legal/VersionedTermsCopy', () => ({ useServedTermsVersion: () => null }));
vi.mock('@/components/legal/terms12Copy', () => ({ CARD_BUYER_TOTAL: 'Synthetic' }));
vi.mock('@/components/CountrySelect', () => ({ default: () => null }));
vi.mock('@/components/ListingLicenseDisclosure', () => ({ default: () => null }));
vi.mock('@/lib/checkout-domain', () => ({ checkoutDomainEnabled: () => ports.domainEnabled, checkoutBlock: ports.refused, checkoutDestination: ports.refused, checkoutErrorCode: ports.refused, checkoutOutcome: ports.refused, checkoutWebPath: ports.refused }));
vi.mock('@/lib/checkout-replay', () => ({ checkoutReplayKey: (...args: unknown[]) => JSON.stringify(args), readCheckoutReplay: ports.readReplay, saveCheckoutReplay: ports.saveReplay, clearCheckoutReplay: ports.refused }));
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
  ports.domainEnabled = false; ports.isOwner = false; ports.checkingOwnership = false;
  ports.state.isAuthenticated = true;
  ports.readReplay.mockReturnValue(null);
  ports.checkout.mockImplementation(ports.refused);
  ports.saveReplay.mockImplementation(ports.refused);
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

// Saved claims and all checkout effects below are synthetic. A pending fake
// response avoids redirect, provider, Terms and new-claim paths entirely.
const frozenAcceptance = Object.freeze({
  accept_license_sha256: 'synthetic-license', accept_covenant_sha256: 'synthetic-covenant',
  accept_rider_sha256: null, authority_confirmed: true, typed_name: 'Synthetic Buyer',
  signer_title: 'Director', business_legal_name: 'Synthetic Company', jurisdiction: 'GB',
} satisfies LicenseAcceptanceFields);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function restoreClaim(handoff: boolean) {
  ports.domainEnabled = true;
  ports.readReplay.mockReturnValue(Object.freeze({ acceptance: frozenAcceptance,
    ...(!handoff ? { checkoutRequestId: 'synthetic-original-request' } : {}) }));
  ports.saveReplay.mockImplementation(() => {});
  ports.checkout.mockImplementation(() => new Promise<never>(() => {}));
  return handoff ? { handoffToken: 'synthetic-handoff' } : { checkoutRequestId: 'synthetic-original-request' };
}
function recoveryButton(handoff: boolean) {
  return <BuyButton listingId="synthetic-listing" slug="synthetic" price={25} pricingType="one_time"
    {...(handoff ? { recoveryOnly: true, checkoutContext: { handoffToken: 'synthetic-handoff' } } : {})} />;
}
async function retryOriginalClaim(options: ReturnType<typeof restoreClaim>) {
  expect(screen.queryByRole('link', { name: /View purchase|Access Data/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Buy Now/ })).toBeNull();
  expect(ports.checkout).not.toHaveBeenCalled();
  expect(ports.saveReplay).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry checkout' })); });
  expect(ports.checkout).toHaveBeenCalledExactlyOnceWith('synthetic-listing', undefined, frozenAcceptance, options);
  expect(ports.checkout.mock.calls[0][2]).toBe(frozenAcceptance);
  expect(ports.saveReplay).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify(['synthetic-buyer', 'synthetic-listing', undefined, options.handoffToken]),
    { acceptance: frozenAcceptance, ...('checkoutRequestId' in options ? { checkoutRequestId: options.checkoutRequestId } : {}) },
  );
}

describe('current accepted claim precedes existing-order navigation', () => {
  it.each([
    { handoff: false, delayed: false }, { handoff: false, delayed: true },
    { handoff: true, delayed: false }, { handoff: true, delayed: true },
  ])('retains recovery with a created reservation, including reload: %o', async ({ handoff, delayed }) => {
    const options = restoreClaim(handoff);
    // Each mount must restore from storage; the previous component ref is gone.
    for (let reload = 0; reload < 2; reload++) {
      const lookup = deferred<BuyerOrder[]>();
      ports.orders.mockReturnValue(lookup.promise);
      if (!delayed) lookup.resolve([order('created')]);
      await mount(recoveryButton(handoff));
      expect(screen.getByRole('button', { name: 'Retry checkout' })).not.toBeNull();
      if (delayed) await act(async () => { lookup.resolve([order('created')]); await lookup.promise; });
      await retryOriginalClaim(options);
      cleanup();
      ports.checkout.mockClear(); ports.saveReplay.mockClear();
    }
  });
  it.each([false, true])('recovers the saved claim when no order is found (handoff=%s)', async handoff => {
    const options = restoreClaim(handoff);
    ports.orders.mockResolvedValue([]);
    await mount(recoveryButton(handoff));
    await retryOriginalClaim(options);
  });
  it.each([false, true])('keeps ordinary created-order navigation without replay (handoff=%s)', async handoff => {
    ports.domainEnabled = true;
    ports.orders.mockResolvedValue([order('created')]);
    await mount(recoveryButton(handoff));
    expect(screen.getByRole('link', { name: 'View purchase' }).getAttribute('href')).toBe('/dashboard/orders/synthetic-order');
    expect(screen.queryByRole('button', { name: /Retry checkout|Buy Now/ })).toBeNull();
    expect(ports.checkout).not.toHaveBeenCalled();
  });
  it.each(['owner', 'signed out', 'checking ownership'] as const)('preserves the %s guard with a saved claim', async guard => {
    restoreClaim(false);
    ports.isOwner = guard === 'owner';
    ports.state.isAuthenticated = guard !== 'signed out';
    ports.checkingOwnership = guard === 'checking ownership';
    await mount(recoveryButton(false));
    expect(screen.queryByRole('button', { name: 'Retry checkout' })).toBeNull();
    expect(ports.orders).not.toHaveBeenCalled();
    expect(ports.checkout).not.toHaveBeenCalled();
    if (guard === 'owner') expect(screen.getByText('This is your listing')).not.toBeNull();
    if (guard === 'signed out') expect(screen.getByRole('link', { name: /Buy Now/ }).getAttribute('href')).toBe('/login?redirect=/listings/synthetic');
  });
});
