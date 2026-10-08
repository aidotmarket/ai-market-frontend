// @vitest-environment jsdom
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as Link from 'next/link';
import * as axios from 'axios';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { gitReferenceModule } from './gitReferenceModule';
import * as auth from '@/store/auth';
import * as toast from '@/components/Toast';
import * as checkout from '@/api/checkout';
import * as orders from '@/api/orders';
import * as format from '@/lib/format';
import * as terms from '@/components/legal/TermsGate';
import * as versionedTerms from '@/components/legal/VersionedTermsCopy';
import * as termsCopy from '@/components/legal/terms12Copy';
import * as country from '@/components/CountrySelect';
import * as disclosure from '@/components/ListingLicenseDisclosure';
import * as ownership from '@/hooks/useListingOwnership';
import BuyButton from '@/components/BuyButton';

const mocks = vi.hoisted(() => ({ authenticated: false, post: vi.fn() }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ user: mocks.authenticated ? { id: 'buyer' } : null,
  isAuthenticated: mocks.authenticated, hydrated: true, isLoading: false }) }));
vi.mock('@/api/client', () => ({ api: { post: mocks.post } }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useListingOwnership', () => ({ useListingOwnership: () => ({ isOwner: false, checkingOwnership: false }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ ensureTermsAccepted: vi.fn(), TermsGatePrompt: () => null, checkingTerms: false }) }));
vi.mock('@/components/legal/VersionedTermsCopy', () => ({ useServedTermsVersion: () => '1.1' }));

const reference = gitReferenceModule<typeof import('@/components/BuyButton')>('components/BuyButton.tsx', {
  react: React, 'react/jsx-runtime': jsxRuntime, 'next/link': Link, axios,
  '@/store/auth': auth, '@/components/Toast': toast, '@/api/checkout': checkout, '@/api/orders': orders,
  '@/lib/format': format, '@/components/legal/TermsGate': terms,
  '@/components/legal/VersionedTermsCopy': versionedTerms, '@/components/legal/terms12Copy': termsCopy,
  '@/components/CountrySelect': country, '@/components/ListingLicenseDisclosure': disclosure,
  '@/hooks/useListingOwnership': ownership,
});
const ReferenceBuyButton = reference.default;
const referenceApi = gitReferenceModule<typeof import('@/api/checkout')>('api/checkout.ts', {
  './client': { api: { post: mocks.post } },
});

afterEach(() => { vi.unstubAllEnvs(); mocks.post.mockReset(); });
it.each([false, true])('matches origin/main 8074c2ca checkout markup with flag off, authenticated=%s', authenticated => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'false');
  mocks.authenticated = authenticated;
  const props = { listingId: 'listing', slug: 'data', price: 20, pricingType: 'one_time' };
  const licenseDetails = { code: 'standard' as const, version: '1.0', params: { ai_training: false }, summary: ['Terms'],
    full_text_url: '/licenses/standard/1.0', download_url: '/licenses/standard/1.0?download=1',
    sha256: 'a'.repeat(64), covenant_sha256: 'b'.repeat(64), rider_sha256: null };
  for (const extra of [{}, { licenseDetails }, { disabledReason: 'Unavailable' }, { versionLabel: 'v2', accessWindowDays: 30 }]) {
    expect(renderToStaticMarkup(<BuyButton {...props} {...extra} />))
      .toBe(renderToStaticMarkup(<ReferenceBuyButton {...props} {...extra} />));
  }
});
it('matches origin/main 8074c2ca POST URL and serialized acceptance body with flag off', async () => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'false');
  mocks.post.mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.com/pay' } });
  const acceptance = { accept_license_sha256: 'a'.repeat(64), accept_covenant_sha256: 'b'.repeat(64),
    accept_rider_sha256: null, authority_confirmed: true as const, typed_name: 'Ada Buyer',
    signer_title: 'Director', business_legal_name: 'Buyer Ltd', jurisdiction: 'GB' };
  for (const version of [undefined, 'version']) {
    await referenceApi.createCheckout('listing', version, acceptance);
    const baseline = JSON.stringify(mocks.post.mock.lastCall);
    await checkout.createCheckout('listing', version, acceptance, { checkoutRequestId: '11111111-1111-4111-8111-111111111111' });
    expect(JSON.stringify(mocks.post.mock.lastCall)).toBe(baseline);
  }
});
