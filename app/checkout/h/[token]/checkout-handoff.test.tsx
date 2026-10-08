// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import type { CheckoutHandoff } from '@/api/checkout';
import type { ListingDetail } from '@/types';

const mocks = vi.hoisted(() => ({ get: vi.fn(), listing: vi.fn(), buy: vi.fn(), notFound: vi.fn(),
  token: ('a'.repeat(42) + 'A'), auth: { user: { id: 'owner' } as { id: string } | null, token: 'session' as string | null, hydrated: true, isLoading: false } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ token: mocks.token }), notFound: () => { mocks.notFound(); throw new Error('NOT_FOUND'); } }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('@/api/checkout', () => ({ getCheckoutHandoff: mocks.get }));
vi.mock('@/api/listings', () => ({ getListing: mocks.listing }));
vi.mock('@/components/BuyButton', async importOriginal => ({ ...await importOriginal<typeof import('@/components/BuyButton')>(),
  default: (props: unknown) => { mocks.buy(props); return <div>Human licence and authority form</div>; } }));
import CheckoutHandoffReview from './CheckoutHandoffReview';
import Page from './page';

const license = { code: 'standard' as const, version: '1.0', params: { ai_training: false }, summary: [], full_text_url: '/licenses/standard/1.0',
  download_url: '/licenses/standard/1.0?download=1', sha256: 'b'.repeat(64), covenant_sha256: 'c'.repeat(64), rider_sha256: null };
const handoff: CheckoutHandoff = { handoff_id: 'handoff', listing_id: 'listing', version_id: 'version', status: 'open',
  expires_at: '2099-01-01T00:00:00Z', price_cents: 1200, currency: 'USD', license_sha256: license.sha256,
  covenant_sha256: license.covenant_sha256, rider_sha256: null };
const listing = { id: 'listing', slug: 'listing-slug', title: 'Example data', purchasable: true, purchase_hold_reason: null,
  pricing: { price: 12, pricing_type: 'one_time' }, license } as unknown as ListingDetail;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
  mocks.token = ('a'.repeat(42) + 'A'); mocks.auth = { user: { id: 'owner' }, token: 'session', hydrated: true, isLoading: false };
  mocks.get.mockResolvedValue(handoff); mocks.listing.mockResolvedValue(listing);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.useRealTimers(); });
it('only inspects on load and delegates fresh human acceptance with the pinned version to BuyButton', async () => {
  render(<CheckoutHandoffReview />);
  await screen.findByText('Human licence and authority form');
  expect(screen.getByText('USD 12.00')).toBeTruthy();
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(mocks.token);
  expect(mocks.buy.mock.lastCall?.[0]).toMatchObject({ listingId: 'listing', versionId: 'version', licenseDetails: license,
    checkoutContext: { handoffToken: mocks.token } });
  expect(mocks.buy.mock.lastCall?.[0]).not.toHaveProperty('authorityConfirmed');
});
it.each(['expired', 'superseded'] as const)('blocks %s without loading a listing or purchase form', async status => {
  mocks.get.mockResolvedValue({ ...handoff, status }); render(<CheckoutHandoffReview />);
  await screen.findByText('Checkout link expired or replaced');
  expect(mocks.listing).not.toHaveBeenCalled(); expect(mocks.buy).not.toHaveBeenCalled();
});
it('blocks an expired open link', async () => {
  mocks.get.mockResolvedValue({ ...handoff, expires_at: '2000-01-01T00:00:00Z' }); render(<CheckoutHandoffReview />);
  await screen.findByText('Checkout link expired or replaced'); expect(mocks.buy).not.toHaveBeenCalled();
});
it('removes the purchase form when the displayed handoff expires', async () => {
  vi.useFakeTimers(); mocks.get.mockResolvedValue({ ...handoff, expires_at: new Date(Date.now() + 1000).toISOString() });
  await act(async () => { render(<CheckoutHandoffReview />); });
  expect(screen.getByText('Human licence and authority form')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
  expect(screen.queryByText('Human licence and authority form')).toBeNull();
  expect(screen.getByText('Checkout link expired or replaced')).toBeTruthy();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it.each([{ license: { ...license, sha256: 'd'.repeat(64) } }, { license: { ...license, covenant_sha256: 'd'.repeat(64) } },
  { license: { ...license, rider_sha256: 'd'.repeat(64) } }, { pricing: { price: 15, pricing_type: 'one_time' } }, { license: null }])('blocks changed snapshots %j', async fields => {
  mocks.listing.mockResolvedValue({ ...listing, ...fields }); render(<CheckoutHandoffReview />);
  await screen.findByText('The terms changed'); expect(mocks.buy).not.toHaveBeenCalled();
});
it.each(['reserved', 'provider_unknown', 'failed', 'payment_conflict', 'refunded'] as const)('renders consumed %s read-only and never continues to a provider URL', async checkout_status => {
  mocks.get.mockResolvedValue({ ...handoff, status: 'consumed', checkout_status, checkout_url: 'https://checkout.stripe.com/pay', order_id: 'order' });
  render(<CheckoutHandoffReview />); await screen.findByRole('link', { name: 'View order' });
  expect(screen.queryByRole('link', { name: 'Continue to payment' })).toBeNull();
  expect(mocks.listing).not.toHaveBeenCalled(); expect(mocks.buy).not.toHaveBeenCalled();
});
it('checks consumed processing status with another GET only', async () => {
  mocks.get.mockResolvedValue({ ...handoff, status: 'consumed', checkout_status: 'provider_unknown' }); render(<CheckoutHandoffReview />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check checkout status' }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2)); expect(mocks.buy).not.toHaveBeenCalled();
});
it.each(['https://checkout.stripe.com/c/pay/test', 'https://evil.test/c/pay/test', null])('allows only a finalised safe provider URL: %s', async checkout_url => {
  mocks.get.mockResolvedValue({ ...handoff, status: 'consumed', checkout_status: 'finalised', checkout_url, order_id: 'order' });
  render(<CheckoutHandoffReview />); await screen.findByRole('link', { name: 'View order' });
  const payment = screen.queryByRole('link', { name: 'Continue to payment' });
  expect(!!payment).toBe(checkout_url?.startsWith('https://checkout.stripe.com/') === true);
  if (payment) expect(payment.getAttribute('referrerpolicy')).toBe('no-referrer');
});
it('requires sign-in and preserves only the handoff route without automatic purchase', async () => {
  mocks.auth.user = null; mocks.auth.token = null; render(<CheckoutHandoffReview />);
  const login = screen.getByRole('link', { name: 'Sign in to review checkout' });
  expect(login.getAttribute('href')).toBe(`/login?redirect=${encodeURIComponent(`/checkout/h/${mocks.token}`)}`);
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.buy).not.toHaveBeenCalled();
});
it('renders wrong-owner 404 without exposing terms', async () => {
  mocks.get.mockRejectedValue({ response: { status: 404 } }); render(<CheckoutHandoffReview />);
  await screen.findByText('Checkout link unavailable'); expect(mocks.buy).not.toHaveBeenCalled();
});
it('hides the old owner review immediately and ignores late replies', async () => {
  const view = render(<CheckoutHandoffReview />); await screen.findByText('Human licence and authority form');
  mocks.get.mockReturnValue(new Promise(() => {})); mocks.auth = { ...mocks.auth, user: { id: 'other' }, token: 'other-session' };
  view.rerender(<CheckoutHandoffReview />); expect(screen.queryByText('Human licence and authority form')).toBeNull();
});
it.each(['SELLER_PAYOUT_READINESS_UNKNOWN', 'SELLER_PAYOUT_NOT_READY', 'REFERENCE_DELIVERY_UNREADY'])('renders %s blocks with web paths without a purchase form', async code => {
  const error = new AxiosError('blocked');
  error.response = { status: 409, data: { detail: { code, web_path: '/listings/listing' } }, statusText: 'Conflict', headers: {}, config: {} as never };
  mocks.get.mockRejectedValue(error); render(<CheckoutHandoffReview />);
  await screen.findByRole('link', { name: 'Review listing' });
  expect(screen.getByRole('alert').textContent).toContain('Checkout is blocked'); expect(mocks.buy).not.toHaveBeenCalled();
});
it('keeps the new route inert when the flag is off', () => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'false');
  expect(() => Page()).toThrow('NOT_FOUND'); expect(mocks.notFound).toHaveBeenCalledOnce();
  render(<CheckoutHandoffReview />); expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.buy).not.toHaveBeenCalled();
});
it('rejects malformed links before loading', () => {
  mocks.token = '../wrong'; render(<CheckoutHandoffReview />); expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.buy).not.toHaveBeenCalled();
});

it('rechecks authoritative status at expiry and keeps a purchase started just before expiry recoverable', async () => {
  vi.useFakeTimers();
  mocks.get.mockResolvedValueOnce({ ...handoff, expires_at: new Date(Date.now() + 1000).toISOString() })
    .mockResolvedValue({ ...handoff, status: 'consumed', checkout_status: 'provider_unknown', expires_at: new Date(Date.now() + 1000).toISOString() });
  await act(async () => { render(<CheckoutHandoffReview />); });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(999);
    (mocks.buy.mock.lastCall?.[0] as { onCheckoutStarted: () => void }).onCheckoutStarted();
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(2); });
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Check checkout status' })).toBeTruthy();
  expect(screen.queryByText('Checkout link expired or replaced')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole('button', { name: 'Check checkout status' })).toBeTruthy();
});
it('keeps recovery mounted if authoritative expiry inspection fails', async () => {
  vi.useFakeTimers();
  mocks.get.mockResolvedValueOnce({ ...handoff, expires_at: new Date(Date.now() + 1000).toISOString() }).mockRejectedValue(new Error('network'));
  await act(async () => { render(<CheckoutHandoffReview />); });
  await act(async () => { (mocks.buy.mock.lastCall?.[0] as { onCheckoutStarted: () => void }).onCheckoutStarted(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
  expect(screen.getByText('Human licence and authority form')).toBeTruthy();
  expect(screen.getByText('Your purchase may have started. Keep checking the same checkout.')).toBeTruthy();
  expect(screen.queryByText('Checkout link expired or replaced')).toBeNull();
});
it('invalidates a same-user review when the session rotates without using its access token as a key', async () => {
  const view = render(<CheckoutHandoffReview />);
  await screen.findByText('Human licence and authority form');
  mocks.get.mockReturnValue(new Promise(() => {})); mocks.auth.token = 'rotated-private-access-token';
  view.rerender(<CheckoutHandoffReview />);
  expect(screen.queryByText('Human licence and authority form')).toBeNull();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
