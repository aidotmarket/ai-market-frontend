// @vitest-environment jsdom
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import reference from './fixtures/checkout-flag-off-8074c2ca.json';
import * as checkout from '@/api/checkout';
import BuyButton from '@/components/BuyButton';

const mocks = vi.hoisted(() => ({ authenticated: false, post: vi.fn() }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ user: mocks.authenticated ? { id: 'buyer' } : null,
  isAuthenticated: mocks.authenticated, hydrated: true, isLoading: false }) }));
vi.mock('@/api/client', () => ({ api: { post: mocks.post } }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useListingOwnership', () => ({ useListingOwnership: () => ({ isOwner: false, checkingOwnership: false }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ ensureTermsAccepted: vi.fn(), TermsGatePrompt: () => null, checkingTerms: false }) }));
vi.mock('@/components/legal/VersionedTermsCopy', () => ({ useServedTermsVersion: () => '1.1' }));

// Frozen output of main 8074c2ca using the same props, mocks and jsdom origin.
// Captured from its BuyButton and createCheckout; tests require no repository history.
afterEach(() => { vi.unstubAllEnvs(); mocks.post.mockReset(); });
it.each([false, true])('matches origin/main 8074c2ca checkout markup with flag off, authenticated=%s', authenticated => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'false');
  mocks.authenticated = authenticated;
  const props = { listingId: 'listing', slug: 'data', price: 20, pricingType: 'one_time' };
  const licenseDetails = { code: 'standard' as const, version: '1.0', params: { ai_training: false }, summary: ['Terms'],
    full_text_url: '/licenses/standard/1.0', download_url: '/licenses/standard/1.0?download=1',
    sha256: 'a'.repeat(64), covenant_sha256: 'b'.repeat(64), rider_sha256: null };
  const variants = [{}, { licenseDetails }, { disabledReason: 'Unavailable' }, { versionLabel: 'v2', accessWindowDays: 30 }];
  const expectedMarkup = reference.markup[authenticated ? 'true' : 'false'];
  expect(expectedMarkup).toHaveLength(variants.length);
  for (const [index, extra] of variants.entries()) {
    expect(renderToStaticMarkup(<BuyButton {...props} {...extra} />))
      .toBe(expectedMarkup[index]);
  }
});
it('matches origin/main 8074c2ca POST URL and serialized acceptance body with flag off', async () => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'false');
  mocks.post.mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.com/pay' } });
  const acceptance = { accept_license_sha256: 'a'.repeat(64), accept_covenant_sha256: 'b'.repeat(64),
    accept_rider_sha256: null, authority_confirmed: true as const, typed_name: 'Ada Buyer',
    signer_title: 'Director', business_legal_name: 'Buyer Ltd', jurisdiction: 'GB' };
  const versions = [undefined, 'version'];
  expect(reference.serializedPostCalls).toHaveLength(versions.length);
  for (const [index, version] of versions.entries()) {
    await checkout.createCheckout('listing', version, acceptance, { checkoutRequestId: '11111111-1111-4111-8111-111111111111' });
    expect(JSON.stringify(mocks.post.mock.lastCall)).toBe(reference.serializedPostCalls[index]);
  }
});
