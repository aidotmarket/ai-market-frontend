// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import type { ListingDetail } from '@/types';

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

  it('keeps reference links safe inside source markdown and honors noindex', async () => {
    await render(fixture({ noindex: true, description: '[Unsafe](https://user:secret@example.org) <script>alert(1)</script>' }));
    expect(document.querySelector('a[href*="secret"]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it.each(['reference', 'ai_queryable'] as const)('retains the existing path for legacy %s without opt-in', async fulfillment_type => {
    await render(fixture({ fulfillment_type, public_reference: undefined, purchase_hold_reason: null, license_status: 'bound', approved_presentation: undefined, jsonld: null }));
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
