import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), legacyPost: vi.fn(), token: 'web-session' as string | null }));
vi.mock('axios', () => ({ default: { create: () => ({ get: mocks.get, post: mocks.post }) } }));
vi.mock('./client', () => ({ api: { post: mocks.legacyPost } }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ token: mocks.token }) } }));
import { checkoutCsrf, createCheckout, getCheckoutHandoff, type CheckoutHandoff } from './checkout';

const token = 'a'.repeat(42) + 'A';
const requestId = '11111111-1111-4111-8111-111111111111';
const sessionDigest = 'b70ecc869f6b960f4974d6393c8d77c144efb35447d2a0a8b801c37f6644ec37';
const acceptance = { accept_license_sha256: 'b'.repeat(64), accept_covenant_sha256: 'c'.repeat(64), accept_rider_sha256: null,
  authority_confirmed: true as const, typed_name: 'Ada Buyer', signer_title: 'Director', business_legal_name: 'Buyer Ltd', jurisdiction: 'GB' };
const handoff: CheckoutHandoff = { handoff_id: requestId, listing_id: 'listing', version_id: 'version', status: 'open',
  expires_at: '2099-01-01T00:00:00Z', price_cents: 1200, currency: 'USD', license_sha256: acceptance.accept_license_sha256,
  covenant_sha256: acceptance.accept_covenant_sha256, rider_sha256: null };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true'); mocks.token = 'web-session';
  mocks.get.mockResolvedValue({ data: handoff });
  mocks.post.mockResolvedValue({ data: { checkout_url: null, order_id: 'order', transaction_id: 'transaction', order_number: 'ORD-1' } });
});
afterEach(() => vi.unstubAllEnvs());

it('uses the backend domain-separated session CSRF vector', () => {
  expect(checkoutCsrf('web-session')).toBe(sessionDigest);
});
it('inspects only by GET with the first-party session and CSRF header', async () => {
  expect(await getCheckoutHandoff(token)).toEqual(handoff);
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(`/checkout-handoffs/${token}`, {
    headers: { Authorization: 'Bearer web-session', 'X-CSRF-Token': sessionDigest },
  });
  expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.legacyPost).not.toHaveBeenCalled();
});
it('posts only the contract handoff and human acceptance fields with session CSRF', async () => {
  expect(await createCheckout('listing', 'version', acceptance, { handoffToken: token })).toMatchObject({ order_id: 'order', checkout_url: null });
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/checkout/create', {
    listing_id: 'listing', version_id: 'version', handoff_token: token, ...acceptance, csrf: sessionDigest,
  }, { headers: { Authorization: 'Bearer web-session' } });
  expect(mocks.legacyPost).not.toHaveBeenCalled();
});
it('retries processing with the same direct request ID and accepted body without auto refresh', async () => {
  const processing = { response: { status: 503, data: { detail: 'CHECKOUT_PROCESSING' } } };
  mocks.post.mockRejectedValueOnce(processing);
  await expect(createCheckout('listing', 'version', acceptance, { checkoutRequestId: requestId })).rejects.toBe(processing);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await createCheckout('listing', 'version', acceptance, { checkoutRequestId: requestId });
  expect(mocks.post.mock.calls[0]).toEqual(mocks.post.mock.calls[1]);
  expect(mocks.post.mock.calls[0][1]).toHaveProperty('checkout_request_id', requestId);
  expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('handoff_token');
});
it.each(['false', '', 'TRUE'])('preserves the exact legacy request bytes and arguments with flag %s', async flag => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', flag);
  vi.stubGlobal('window', { location: { origin: 'https://ai.market' } });
  mocks.token = null;
  mocks.legacyPost.mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.com/old', session_id: 'old' } });
  await createCheckout('listing', 'version', acceptance, { handoffToken: token });
  expect(mocks.legacyPost.mock.calls).toEqual([['/checkout/create', {
    listing_id: 'listing', version_id: 'version', ...acceptance,
    success_url: 'https://ai.market/checkout/success?session_id={CHECKOUT_SESSION_ID}', cancel_url: 'https://ai.market/checkout/cancel',
  }]]);
  expect(mocks.post).not.toHaveBeenCalled();
  await expect(getCheckoutHandoff(token)).rejects.toThrow('CHECKOUT_UNAVAILABLE'); expect(mocks.get).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it.each(['../foreign', `${token}\n`, `${token}?next=evil`, 'a'.repeat(42)])('rejects malformed tokens %s before any request', async value => {
  await expect(getCheckoutHandoff(value)).rejects.toThrow('INVALID_HANDOFF');
  await expect(createCheckout('listing', 'version', acceptance, { handoffToken: value })).rejects.toThrow('INVALID_HANDOFF');
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
});
it('requires session, request identity and fresh explicit human acceptance', async () => {
  await expect(createCheckout('listing', 'version', acceptance)).rejects.toThrow('CHECKOUT_REQUEST_ID_REQUIRED');
  await expect(createCheckout('listing', 'version', undefined, { handoffToken: token })).rejects.toThrow('LICENSE_AUTHORITY_REQUIRED');
  mocks.token = null;
  await expect(getCheckoutHandoff(token)).rejects.toThrow('FIRST_PARTY_SESSION_REQUIRED');
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
});
it.each([{ status: 'unexpected' }, { price_cents: -1 }, { expires_at: 'bad' }, { license_sha256: '' }, { rider_sha256: 'bad' }])('refuses malformed handoff %j', async fields => {
  mocks.get.mockResolvedValue({ data: { ...handoff, ...fields } });
  await expect(getCheckoutHandoff(token)).rejects.toThrow('INVALID_RESPONSE'); expect(mocks.post).not.toHaveBeenCalled();
});
