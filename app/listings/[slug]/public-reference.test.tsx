// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import type { ListingDetail, PublicSourceReference } from '@/types';
import PublicSourceReferencePage from './PublicSourceReferencePage';

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

const reference = {
  url: 'https://sdi.eea.europa.eu/data/9eee3fc9-3060-4e3f-bc8d-e22e7c3f6bda',
  label: 'Get free data from the EEA',
  publisher: 'European Environment Agency (EEA)',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  metadata_url: 'https://sdi.eea.europa.eu/catalogue/srv/api/records/9eee3fc9-3060-4e3f-bc8d-e22e7c3f6bda?language=all',
};
// Design-shaped API fixture only: not a saved row, source availability check,
// executed backend serialization result, or browser proof.
const instructionsReference = {
  url: 'https://github.com/google-deepmind/alphafold/blob/main/afdb/README.md',
  label: 'Read complete-species AlphaFold v4 access instructions',
  publisher: 'Google DeepMind and EMBL-EBI (AlphaFold DB)',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  metadata_url: 'https://alphafold.ebi.ac.uk/download',
  access_kind: 'instructions' as const,
};
function fixture(overrides: Record<string, unknown> = {}): ListingDetail {
  return {
    id: 'arbitrary-listing', slug: 'arbitrary-slug', title: 'EU Emissions Trading System: emissions and allowances (2005–2025)',
    description: `Official **aggregate** data. [Source record](${reference.metadata_url})`,
    short_description: 'Old facility marketing', publisher: { display_name: 'Old seller', trust_level: 'L1' },
    pricing: { price: 0, pricing_type: 'one_time', subscription_price_monthly: null },
    fulfillment_type: 'reference', purchasable: false, purchase_hold_reason: 'public_source_reference',
    public_reference: reference, license: 'Old seller terms', license_status: 'pending_seller_terms',
    tags: ['old inferred claim'], category: 'Business', row_count: 8400,
    secondary_categories: null, task_category: null, domain_tags: null,
    data_format: 'csv', update_frequency: null, coverage: null,
    privacy_scan_status: 'scanned', searchability_score: 80, is_accessible_for_free: true,
    created_at: '2026-09-25T00:00:00Z', updated_at: null, scan_findings: null,
    schema_summary: { columns: ['facility_coordinates'], column_count: 1, sample_types: null },
    privacy_score: 9, trust_level: 'L1', view_count: 42, inquiry_count: 99,
    published_at: '2026-09-25T00:00:00Z', noindex: false,
    jsonld: { '@type': 'Dataset', name: 'Old facility claims', offers: { price: 450 } },
    ...overrides,
  };
}
async function render(listing = fixture()) {
  api.fetchPublicListing.mockResolvedValue(listing);
  const element = await Page({ params: Promise.resolve({ slug: listing.slug }), searchParams: Promise.resolve({ version: 'old-version' }) });
  document.body.innerHTML = renderToStaticMarkup(element);
  return within(document.body);
}
beforeEach(() => {
  vi.clearAllMocks();
  api.fetchListingVersions.mockResolvedValue([{ id: 'old-version' }]);
  api.fetchListingAccessWindowDays.mockResolvedValue(30);
  document.body.innerHTML = '';
});
describe('public-source reference route', () => {
  it.each<[string, PublicSourceReference]>([
    ['absent', reference],
    ['explicit download', { ...reference, access_kind: 'download' as const }],
  ])('retains existing download copy for %s access_kind', async (_name, public_reference) => {
    const before = { ...public_reference };
    const page = await render(fixture({ public_reference }));
    expect(page.getByText('ai.market indexes this public source. Access files directly from the publisher; no purchase or checkout is required.')).toBeTruthy();
    expect(page.getByRole('link', { name: reference.label }).getAttribute('href')).toBe(reference.url);
    expect(public_reference).toEqual(before);
    expect(Object.keys(reference)).toEqual(['url', 'label', 'publisher', 'license_url', 'metadata_url']);
    expect(forbidden).not.toHaveBeenCalled();
    expect(api.fetchListingVersions).not.toHaveBeenCalled();
    expect(api.fetchListingAccessWindowDays).not.toHaveBeenCalled();
  });

  it('renders AlphaFold instructions with upstream rights and no marketplace delivery promise', async () => {
    const page = await render(fixture({
      public_reference: instructionsReference,
      title: 'AlphaFold predicted protein structures: Maize proteome (taxonomy 4577)',
      description: 'Complete-species AlphaFold v4 GCS access instructions. A normal Google Cloud account is required. CC BY 4.0; Google DeepMind and EMBL-EBI. Source object availability and complete coverage have not been freshly verified.',
    }));
    const cta = page.getByRole('link', { name: instructionsReference.label });
    expect(cta.getAttribute('href')).toBe(instructionsReference.url);
    expect(cta.getAttribute('target')).toBe('_blank');
    expect(cta.getAttribute('rel')).toBe('noopener noreferrer');
    expect(page.getByText(instructionsReference.publisher)).toBeTruthy();
    expect(page.getByText('Free', { exact: true })).toBeTruthy();
    expect(page.getByRole('link', { name: 'License' }).getAttribute('href')).toBe(instructionsReference.license_url);
    expect(page.getByRole('link', { name: 'Source metadata' }).getAttribute('href')).toBe(instructionsReference.metadata_url);
    expect(document.body.textContent).toContain('Follow the publisher’s access instructions');
    expect(document.body.textContent).toContain('ai.market does not host or relay the dataset');
    expect(document.body.textContent).toContain('No purchase or checkout is required');
    for (const promise of ['Access files directly from the publisher', 'Download', 'Query', 'Old seller terms', 'Standard', 'covenant', 'signature']) {
      expect(document.body.textContent).not.toContain(promise);
    }
    expect(document.querySelector('a[href*="checkout"], a[href*="/licenses/"], button')).toBeNull();
    expect(forbidden).not.toHaveBeenCalled();
    expect(api.fetchListingVersions).not.toHaveBeenCalled();
    expect(api.fetchListingAccessWindowDays).not.toHaveBeenCalled();
    const jsonld = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(jsonld.license).toBe(instructionsReference.license_url);
    expect(jsonld.publisher.name).toBe(instructionsReference.publisher);
    expect(jsonld.sameAs).toBe(instructionsReference.metadata_url);
    expect(jsonld.isAccessibleForFree).toBe(true);
    expect(jsonld.url).toBe('https://ai.market/listings/arbitrary-slug');
    expect(jsonld.offers).toBeUndefined();
    expect(jsonld.distribution).toBeUndefined();
    expect(JSON.stringify(jsonld)).not.toMatch(/DataDownload|contentUrl|Old facility claims/);
  });

  it.each<[string, unknown]>([
    ['null', null], ['unknown', 'other'], ['empty', ''], ['number', 42],
    ['boolean', false], ['object', {}], ['array', []], ['present undefined', undefined],
  ])('fails closed for %s access_kind without commercial fallback', async (_name, access_kind) => {
    const page = await render(fixture({ public_reference: { ...instructionsReference, access_kind } }));
    expect(page.getByRole('status').textContent).toContain('Public source reference unavailable');
    expect(page.queryByRole('link', { name: instructionsReference.label })).toBeNull();
    expect(page.queryByRole('link', { name: 'License' })).toBeNull();
    expect(page.queryByText('Free', { exact: true })).toBeNull();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(forbidden).not.toHaveBeenCalled();
    expect(api.fetchListingVersions).not.toHaveBeenCalled();
    expect(api.fetchListingAccessWindowDays).not.toHaveBeenCalled();
  });

  it.each([
    { emitJsonLd: false, noindex: false },
    { emitJsonLd: true, noindex: true },
  ])('honors instructions component JSON-LD controls %j', ({ emitJsonLd, noindex }) => {
    document.body.innerHTML = renderToStaticMarkup(<PublicSourceReferencePage
      listing={fixture({ public_reference: instructionsReference, noindex })} emitJsonLd={emitJsonLd}
    />);
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(within(document.body).getByRole('link', { name: instructionsReference.label }).getAttribute('href')).toBe(instructionsReference.url);
  });

  it.each(['url', 'license_url', 'metadata_url'])('rejects unsafe instructions %s', async field => {
    const page = await render(fixture({ public_reference: { ...instructionsReference, [field]: 'https://user:secret@example.org' } }));
    expect(page.getByRole('status').textContent).toContain('Public source reference unavailable');
    expect(page.queryByRole('link', { name: instructionsReference.label })).toBeNull();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(forbidden).not.toHaveBeenCalled();
    expect(api.fetchListingVersions).not.toHaveBeenCalled();
  });

  it('preserves instructions page noindex and canonical metadata', async () => {
    const listing = fixture({ public_reference: instructionsReference, noindex: true });
    await render(listing);
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: listing.slug }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe('https://ai.market/listings/arbitrary-slug');
  });

  it('renders factual markdown, attribution and safe external access without purchase or inferred content', async () => {
    const page = await render();
    expect(page.getByText('Indexed from public source')).toBeTruthy();
    expect(page.getByText('Free', { exact: true })).toBeTruthy();
    expect(page.getByText(reference.publisher)).toBeTruthy();
    const cta = page.getByRole('link', { name: reference.label });
    expect(cta.getAttribute('href')).toBe(reference.url);
    expect(cta.getAttribute('rel')).toContain('noopener');
    expect(page.getByRole('link', { name: 'License' }).getAttribute('href')).toBe(reference.license_url);
    expect(page.getByRole('link', { name: 'Source metadata' }).getAttribute('href')).toBe(reference.metadata_url);
    expect(document.querySelector('strong')?.textContent).toBe('aggregate');
    expect(page.getByRole('link', { name: 'Source record' }).getAttribute('href')).toBe(reference.metadata_url);
    expect(forbidden).not.toHaveBeenCalled();
    expect(api.fetchListingVersions).not.toHaveBeenCalled();
    expect(api.fetchListingAccessWindowDays).not.toHaveBeenCalled();
    for (const stale of ['Old seller', 'Trust Metrics', 'Privacy Score', 'Schema Information', '8400', 'facility_coordinates', 'inquiries', 'Non-Custodial', 'Old facility claims']) {
      expect(document.body.textContent).not.toContain(stale);
    }
    expect(document.body.textContent).toContain('42 views');
    const jsonld = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(jsonld.license).toBe(reference.license_url);
    expect(jsonld.publisher.name).toBe(reference.publisher);
    expect(jsonld.offers).toBeUndefined();
    expect(jsonld.sameAs).toBe(reference.metadata_url);
    expect(jsonld.distribution).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ['missing', undefined], ['null', null], ['empty', {}], ['array', []], ['invalid publisher', { ...reference, publisher: '' }], ['invalid label', { ...reference, label: 42 }],
    ...['url', 'license_url', 'metadata_url'].flatMap(field =>
      ['http://example.org', 'javascript:alert(1)', '//example.org', 'https://user:password@example.org', '/checkout', 'https://'].map(url =>
        [field + ':' + url, { ...reference, [field]: url }] as [string, unknown])),
  ])('fails closed for %s reference metadata', async (_name, value) => {
    const page = await render(fixture({ public_reference: value }));
    expect(page.getByRole('status').textContent).toContain('Public source reference unavailable');
    expect(page.queryByRole('link', { name: reference.label })).toBeNull();
    expect(forbidden).not.toHaveBeenCalled();
    expect(api.fetchListingVersions).not.toHaveBeenCalled();
    expect(api.fetchListingAccessWindowDays).not.toHaveBeenCalled();
  });

  it.each([{ fulfillment_type: 'platform_download' }, { pricing: { price: 10 } }, { purchasable: true }, { purchase_hold_reason: null }])('fails closed for inconsistent contract %j', async overrides => {
    const page = await render(fixture(overrides));
    expect(page.getByRole('status').textContent).toContain('Public source reference unavailable');
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('ignores stale seller-approved presentations on a reference', async () => {
    await render(fixture({ approved_presentation: { presentation_version: 'seller-listing-review-v2', rendered_html: 'Old seller approved claims', render_hash: 'stale' } }));
    expect(document.body.textContent).toContain('Indexed from public source');
    expect(document.body.textContent).not.toContain('Old seller approved claims');
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('uses metadata labels and publishers for other opted-in sources', async () => {
    const page = await render(fixture({ public_reference: { ...reference, url: 'https://data.example.org/files', label: 'Access public data', publisher: 'Another public agency' } }));
    expect(page.getByRole('link', { name: 'Access public data' }).getAttribute('href')).toBe('https://data.example.org/files');
    expect(page.getByText('Another public agency')).toBeTruthy();
  });

  it.each([reference, instructionsReference])('keeps reference links safe inside source markdown and honors noindex for $label', async public_reference => {
    await render(fixture({ public_reference, noindex: true, description: '[Unsafe](https://user:secret@example.org) <script>alert(1)</script>' }));
    expect(document.querySelector('a[href*="secret"]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it.each<[ListingDetail['fulfillment_type'], number]>([
    ['reference', 0], ['reference', 15],
    ['ai_queryable', 0], ['ai_queryable', 15],
    ['file_download', 0], ['file_download', 15],
  ])('retains the existing path for ordinary %s at price %s without opt-in', async (fulfillment_type, price) => {
    await render(fixture({ fulfillment_type, pricing: { price, pricing_type: 'one_time', subscription_price_monthly: null }, public_reference: undefined, purchase_hold_reason: null, purchasable: true, license_status: 'bound', approved_presentation: undefined, jsonld: null }));
    expect(forbidden).toHaveBeenCalled();
    expect(api.fetchListingVersions).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain('Indexed from public source');
  });

  it('uses factual description for reference discovery metadata', async () => {
    api.fetchPublicListing.mockResolvedValue(fixture());
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'arbitrary-slug' }) });
    expect(metadata.description).toContain('Official');
    expect(metadata.description).not.toContain('Old facility marketing');
    expect(metadata.alternates?.canonical).toBe('https://ai.market/listings/arbitrary-slug');
  });
});
