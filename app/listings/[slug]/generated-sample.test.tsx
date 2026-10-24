// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchPublicListing: vi.fn(), fetchListingVersions: vi.fn(),
  fetchListingAccessWindowDays: vi.fn(), resolveListingUUID: vi.fn(),
}));
const forbidden = vi.hoisted(() => vi.fn(() => <div data-forbidden-purchase-or-inference />));
vi.mock('@/lib/api', () => api);
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not found'); }, redirect: vi.fn() }));
vi.mock('@/components/BuyButton', () => ({ default: forbidden }));
vi.mock('@/components/ListingPurchasePanel', () => ({ default: forbidden }));
vi.mock('@/components/ListingPurchaseAdvisory', () => ({ default: forbidden }));
vi.mock('@/components/ListingLicenseDisclosure', () => ({ default: forbidden }));
vi.mock('@/components/InquiryWidget', () => ({ default: forbidden }));
vi.mock('@/components/listings/BuyerAtAGlance', () => ({ default: forbidden, BuyerSamplePreview: forbidden }));
vi.mock('@/components/listings/ScanFindingsBadge', () => ({ default: forbidden }));
vi.mock('@/components/ApprovedListingPreview', () => ({ default: forbidden }));
vi.mock('./SampleFiles', () => ({ default: forbidden }));
const { default: Page, generateMetadata } = await import('./page');


import { sampleFixture, originalSampleIdentities } from '@/tests/generatedSampleFixture';
import { SAMPLE_COPY, SAMPLE_DATA_COPY, SAMPLE_MODEL_COPY, SAMPLE_STANDARD_COPY, STANDARD_DOCUMENTS } from '@/lib/generatedSample';

async function render(listing = sampleFixture()) {
  api.fetchPublicListing.mockResolvedValue(listing);
  const element = await Page({params: Promise.resolve({slug: listing.slug}), searchParams: Promise.resolve({version: 'stale-version'})});
  document.body.innerHTML = renderToStaticMarkup(element);
  return within(document.body);
}
beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; });
function assertNoCommercialMounts() {
  expect(forbidden).not.toHaveBeenCalled();
  expect(api.fetchListingVersions).not.toHaveBeenCalled();
  expect(api.fetchListingAccessWindowDays).not.toHaveBeenCalled();
  expect(document.querySelector('button, form, a[href*="checkout"], a[href*="sample-file"]')).toBeNull();
  for (const stale of ['RETAINED_UNSUPPORTED', 'Old facility', 'old inferred claim', 'Old seller', 'Privacy Score', 'Schema Information', 'facility_coordinates', '8400', 'pending_seller_terms', 'Not yet available to buy']) {
    expect(document.body.textContent).not.toContain(stale);
  }
}
describe('actual public sample detail SSR and metadata', () => {
  it('omits all seller copy even with a retained seller presentation', async () => {
    await render(sampleFixture({ publisher: {
      schema_version: 'seller-presentation-v1', kind: 'marketplace', display_name: 'Synthetic seller business',
      stripe_connected: true, completed_order_count: 12, seller_rating_count: 9, seller_rating_average: 4.7,
    } }));
    expect(document.body.textContent).not.toMatch(/Synthetic seller business|Stripe connected|completed purchases|ratings|ai.market Seller/);
  });
  it.each(['file_download', 'model_access', 'pipeline_invocation'])('short-circuits %s before price, previews, versions, licence, service and purchase UI', async fulfillment_type => {
    const listing = sampleFixture({fulfillment_type, pricing: {price: 2500}, approved_presentation: {rendered_html: 'RETAINED_UNSUPPORTED', render_hash: 'invalid'}});
    const page = await render(listing);
    expect(page.getByRole('heading', {level: 1}).textContent).toBe(`SAMPLE — ${listing.title}`);
    expect(page.getByRole('status').textContent).toBe(SAMPLE_COPY);
    expect(page.getByText(SAMPLE_DATA_COPY)).toBeTruthy();
    expect(page.getByText(SAMPLE_MODEL_COPY)).toBeTruthy();
    expect(page.getByText(SAMPLE_STANDARD_COPY)).toBeTruthy();
    expect(page.getByText('Not for sale')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/2500|\$|\bFree\b/);
    assertNoCommercialMounts();
    const ld = JSON.parse(document.querySelector('script')!.textContent!);
    expect(ld).toEqual({'@context': 'https://schema.org', '@type': 'CreativeWork', name: `SAMPLE — ${listing.title}`, description: SAMPLE_COPY, url: `https://ai.market/listings/${listing.slug}`});
    expect(page.getAllByRole('link', {name: /Standard 1.0/}).map(a => a.getAttribute('href'))).toEqual([...STANDARD_DOCUMENTS]);
    expect(page.getByText(/No contractual variant is established/)).toBeTruthy();
  });
  it.each([null, false, {}, {version: 2, mode: 'display_only'}, {label: 'SAMPLE', display_only: true, extra: 'Offer'}])('closes malformed public marker %j', async generated_sample => {
    const page = await render(sampleFixture({generated_sample}));
    expect(page.getByRole('status').textContent).toContain('unavailable');
    expect(page.queryByText('Not for sale')).toBeNull();
    expect(page.queryByRole('link', {name: /Standard/})).toBeNull();
    const ld = JSON.parse(document.querySelector('script')!.textContent!);
    expect(ld['@type']).toBe('CreativeWork');
    expect(ld.license).toBeUndefined();
    expect(ld.offers).toBeUndefined();
    assertNoCommercialMounts();
  });
  it.each(['pending_seller_terms', 'stripe_not_ready', null])('never falls through under conflicting hold %s', async purchase_hold_reason => {
    await render(sampleFixture({purchase_hold_reason}));
    assertNoCommercialMounts();
    expect(document.body.textContent).toContain('unavailable');
  });
  it('keeps the sample hold ahead of retained seller-terms status and links the actual Standard variant only', async () => {
    const url = STANDARD_DOCUMENTS[1];
    const page = await render(sampleFixture({license_status: 'pending_seller_terms', license: {code: 'standard', version: '1.0', params: {ai_training: false}, full_text_url: url, summary: ['RETAINED_UNSUPPORTED']}}));
    expect(page.getByRole('status').textContent).toBe(SAMPLE_COPY);
    expect(page.getAllByRole('link', {name: /Standard 1.0/})).toHaveLength(1);
    expect(page.getByRole('link', {name: /Standard 1.0/}).getAttribute('href')).toBe(url);
    expect(JSON.parse(document.querySelector('script')!.textContent!).license).toBe(url);
    assertNoCommercialMounts();
  });
  it('emits safe metadata for valid and unavailable cases without retained claims', async () => {
    for (const generated_sample of [{label: 'SAMPLE', display_only: true}, null]) {
      const listing = sampleFixture({generated_sample}); api.fetchPublicListing.mockResolvedValue(listing);
      const metadata = await generateMetadata({params: Promise.resolve({slug: listing.slug})});
      expect(metadata.title).toBe(`${generated_sample ? 'SAMPLE' : 'Unavailable'} — ${listing.title}`);
      expect(metadata.description).not.toContain('Old facility');
      expect(metadata.description).not.toContain('RETAINED_UNSUPPORTED');
      expect(metadata.openGraph).toMatchObject({title: metadata.title, description: metadata.description});
      expect(metadata.twitter).toMatchObject({title: metadata.title, description: metadata.description});
      expect(metadata.alternates?.canonical).toBe(`https://ai.market/listings/${listing.slug}`);
    }
  });
  it('honors noindex without emitting retained JSON-LD', async () => {
    await render(sampleFixture({noindex: true}));
    expect(document.querySelector('script')).toBeNull();
  });
});


it.each(originalSampleIdentities)('preserves original public identity $id at $slug', async identity => {
  const listing = sampleFixture({...identity});
  const page = await render(listing);
  expect(page.getByRole('heading', {level: 1}).textContent).toBe(`SAMPLE — ${identity.title}`);
  const metadata = await generateMetadata({params: Promise.resolve({slug: identity.slug})});
  expect(metadata.alternates?.canonical).toBe(`https://ai.market/listings/${identity.slug}`);
  expect(JSON.parse(document.querySelector('script')!.textContent!).url).toBe(`https://ai.market/listings/${identity.slug}`);
  expect(api.fetchPublicListing).toHaveBeenCalledWith(identity.slug);
  assertNoCommercialMounts();
});


it.each(['hold-only', 'raw-only', 'mixed-reference'])('closes actual SSR for %s without mounting ordinary components', async kind => {
  const listing = sampleFixture();
  if (kind !== 'mixed-reference') delete listing.generated_sample;
  if (kind === 'raw-only') {
    Object.assign(listing, {structured_metadata: {generated_sample: {version: 1, mode: 'display_only'}}, purchase_hold_reason: null, purchasable: true});
  }
  if (kind === 'mixed-reference') Object.assign(listing, {public_reference: {label: 'Untrusted source', url: 'https://example.org'}});
  const page = await render(listing);
  expect(page.getByRole('status').textContent).toContain('unavailable');
  expect(page.queryByRole('link', {name: /Standard/})).toBeNull();
  assertNoCommercialMounts();
});
