// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';

import type { ListingDetail, ListingVersion } from '@/types';
import type { ListingWithSamples } from './SampleFiles';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

const fetchPublicListing = vi.fn();
const fetchListingVersions = vi.fn();
const fetchListingAccessWindowDays = vi.fn();
const resolveListingUUID = vi.fn();
const buyButtonProps = vi.hoisted(() => vi.fn());
const usdcRequestProps = vi.hoisted(() => vi.fn());
const composition = vi.hoisted(() => ({
  enabled: false,
  atAGlanceProps: vi.fn(),
  sampleProps: vi.fn(),
}));

vi.mock('@/components/listings/BuyerAtAGlance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/listings/BuyerAtAGlance')>();
  return {
    ...actual,
    default: (props: React.ComponentProps<typeof actual.default>) => {
      // Existing behavioral tests and snapshots still render the actual component.
      if (!composition.enabled) return <actual.default {...props} />;
      composition.atAGlanceProps(props);
      return <div data-buyer-at-a-glance />;
    },
    BuyerSamplePreview: (props: React.ComponentProps<typeof actual.BuyerSamplePreview>) => {
      if (!composition.enabled) return <actual.BuyerSamplePreview {...props} />;
      composition.sampleProps(props);
      return <div data-standalone-buyer-sample />;
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({refresh: vi.fn()}),
  notFound,
  redirect: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  fetchPublicListing,
  fetchListingVersions,
  fetchListingAccessWindowDays,
  resolveListingUUID,
}));

vi.mock('@/components/BuyButton', () => ({
  default: (props: Record<string, unknown>) => {
    buyButtonProps(props);
    return <>{props.licenseDetails&&<section aria-label="Licence terms">Purchase licence cards</section>}<button type="button">Buy</button></>;
  },
}));

vi.mock('@/components/InquiryWidget', () => ({
  default: () => <div />,
}));

vi.mock('@/components/UsdcLargePurchaseRequest', () => ({
  default: (props: Record<string, unknown>) => {
    usdcRequestProps(props);
    return null;
  },
}));

const { default: ListingDetailPage } = await import('./page');

function makeListing(overrides: Partial<ListingWithSamples> = {}): ListingWithSamples {
  return {
    id: 'listing-1',
    slug: 'test-dataset',
    title: 'Test Dataset',
    description: 'Visible dataset description.',
    short_description: 'Visible dataset description.',
    publisher: { display_name: 'Seller Co', trust_level: 'L1' },
    pricing: {
      price: 0,
      pricing_type: 'one_time',
      subscription_price_monthly: null,
    },
    license: 'CC-BY-4.0',
    category: 'Business',
    secondary_categories: null,
    tags: ['test'],
    task_category: null,
    domain_tags: null,
    schema_summary: {
      columns: ['region'],
      column_count: 1,
      sample_types: { region: 'string' },
    },
    row_count: 10,
    data_format: 'csv',
    update_frequency: null,
    coverage: null,
    privacy_score: 9,
    privacy_scan_status: 'scanned',
    searchability_score: 80,
    trust_level: 'L1',
    is_accessible_for_free: true,
    view_count: 1,
    inquiry_count: 0,
    noindex: false,
    purchasable: true,
    purchase_hold_reason: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    published_at: '2026-06-01T00:00:00Z',
    fulfillment_type: 'ai_queryable',
    scan_findings: null,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Test Dataset',
      description: 'Visible dataset description.',
      url: 'https://ai.market/listings/test-dataset',
    },
    ...overrides,
  };
}

async function renderPage(listing: ListingDetail | null, versions: ListingVersion[] = []): Promise<string> {
  fetchPublicListing.mockResolvedValueOnce(listing);
  fetchListingVersions.mockResolvedValueOnce(versions);
  const element = await ListingDetailPage({
    params: Promise.resolve({ slug: 'test-dataset' }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

function extractJsonLdScripts(html: string): string[] {
  return Array.from(
    html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    (match) => match[1],
  );
}

describe('seller presentation on the real listing route', () => {
  beforeEach(() => { fetchPublicListing.mockReset(); fetchListingVersions.mockReset(); });
  it('uses seller-wide evidence in the publisher card independently of listing trust', async () => {
    const html = await renderPage(makeListing({ publisher: {
      schema_version: 'seller-presentation-v1', kind: 'marketplace', display_name: 'Synthetic Co', name_source: 'seller_supplied',
      stripe_connected: true, completed_order_count: 12, seller_rating_count: 9, seller_rating_average: 4.7,
    } }));
    expect(html).toContain('Synthetic Co');
    expect(html).toContain('Stripe connected');
    expect(html).toContain('12 completed purchases');
    expect(html).toContain('4.7/5 from 9 ratings');
    expect(html).not.toContain('Privacy Score');
    expect(html).not.toContain('Trust Level');
  });
  it('renders a name-only legacy publisher and tolerates an absent flag-off publisher', async () => {
    const legacy = await renderPage(makeListing());
    expect(legacy).toContain('Seller Co');
    expect(legacy).not.toMatch(/completed purchases|No ratings yet|Stripe connected/);
    const absent = await renderPage(makeListing({ publisher: undefined }));
    expect(absent).not.toMatch(/>Publisher<|completed purchases|No ratings yet|Stripe connected/);
  });

  it('titles the legacy license card License', async () => {
    document.body.innerHTML = await renderPage(makeListing());
    const page = within(document.body);
    const heading = page.getByRole('heading', { name: 'License', level: 3 });
    expect(within(heading.parentElement!).getByText('CC-BY-4.0')).toBeTruthy();
    expect(page.queryByRole('heading', { name: 'Trust Metrics' })).toBeNull();
  });

  it.each([null, ''])('omits the legacy license card when license is %s', async (license) => {
    document.body.innerHTML = await renderPage(makeListing({ license }));
    const page = within(document.body);
    expect(page.queryByRole('heading', { name: 'Trust Metrics' })).toBeNull();
    expect(page.queryByRole('heading', { name: 'License' })).toBeNull();
  });
});

describe('real public listing route sample composition', () => {
  beforeEach(() => {
    fetchPublicListing.mockReset();
    fetchListingVersions.mockReset();
    fetchListingAccessWindowDays.mockReset();
    composition.atAGlanceProps.mockClear();
    composition.sampleProps.mockClear();
    composition.enabled = true;
  });

  afterEach(() => {
    composition.enabled = false;
    document.body.innerHTML = '';
  });

  it.each(['normal', 'approved Workspace'] as const)(
    'shows published scan findings without the request hint on the %s listing',
    async (route) => {
      const listing = makeListing({ scan_findings: {
        publication_state: 'PUBLISHED',
        artifact_version: 'data-verification-public-artifact-v1',
        verification_series_id: 'series-1',
        epoch_id: 'epoch-1',
        listing_id: 'listing-1',
        title: 'Scan findings — 2026-08-23',
        scan_date_utc: '2026-08-23T12:00:00Z',
        scanned_at_utc: '2026-08-23T11:59:58Z',
        completed_at_utc: '2026-08-23T12:00:00Z',
        duration_ms: 2000,
        published_at_utc: '2026-08-23T12:01:00Z',
        spec: {
          id: 'spec-1', version: '1', hash: 'a'.repeat(64),
          depth_class: 'complete_standard_v1', canonicalization_version: 'python-json-sort-compact-v1',
        },
        execution: {
          agent_version: '1.0.0', connector_type: 'eolymp', connector_version: 'eolymp-v1',
          content_sha256_reference: 'b'.repeat(64),
        },
        methods: {
          row_count_algorithm_version: 'exact-v1', distinct_algorithm_version: 'hll-sha256-v1',
          histogram_version: 'fixed-buckets-v1', numeric_bucket_version: 'fixed-buckets-v1',
        },
        coverage: {
          objects_discovered: 0, objects_scanned: 0,
          objects_skipped_by_reason: { permission_denied: 0, unsupported_type: 0, timeout: 0 }, skipped: [],
        },
        deterministic_facts: [],
        fingerprint_hash: 'c'.repeat(64),
        narrative_state: 'grounded',
        seller_context_provided: false,
        preview_requested: false,
        attestation: 'Published scan attestation.',
        disclaimer: 'Point-in-time scan limitations.',
      } });
      if (route === 'approved Workspace') {
        const { createHash } = await import('node:crypto');
        const rendered_html = '<html><body><h1>Approved listing</h1></body></html>';
        listing.approved_presentation = {
          presentation_version: 'seller-listing-review-v2', rendered_html,
          render_hash: createHash('sha256').update(rendered_html).digest('hex'),
        };
      }

      document.body.innerHTML = await renderPage(listing);
      const page = within(document.body);
      const report = page.getByRole('region', { name: 'Scan findings — 2026-08-23' });
      expect(within(report).getByRole('link', { name: 'View full report' }).getAttribute('href'))
        .toBe('#scan-findings-full-report');
      expect(within(report).getByText('Published scan attestation.')).toBeTruthy();
      expect(page.queryByText('The seller can request a verified scan of this data.', { exact: true })).toBeNull();
      if (route === 'approved Workspace') {
        expect(page.getByTitle('Seller-approved listing')).toBeTruthy();
      }
    },
  );

  it.each(['normal', 'approved Workspace'] as const)(
    'passes includeSample=false and mounts one standalone sample after the actual schema on the %s listing',
    async (route) => {
      const listing = makeListing();
      if (route === 'approved Workspace') {
        const { createHash } = await import('node:crypto');
        const rendered_html = '<html><body><h1>Approved listing</h1></body></html>';
        listing.approved_presentation = {
          presentation_version: 'seller-listing-review-v2',
          rendered_html,
          render_hash: createHash('sha256').update(rendered_html).digest('hex'),
        };
      }

      // renderPage calls the imported app/listings/[slug]/page.tsx. Only the two
      // client boundaries become markers; the route and SchemaTable stay real.
      document.body.innerHTML = await renderPage(listing);
      expect(composition.atAGlanceProps).toHaveBeenCalledTimes(1);
      expect(composition.atAGlanceProps.mock.calls[0][0]).toEqual(expect.objectContaining({
        slug: listing.slug, listingId: listing.id, includeSample: false,
      }));
      expect(composition.sampleProps).toHaveBeenCalledTimes(1);
      expect(composition.sampleProps.mock.calls[0][0]).toEqual({
        slug: listing.slug, listingId: listing.id,
      });

      const page = within(document.body);
      expect(page.queryByText('Privacy Score', {exact: true})).toBeNull();
      expect(page.queryByText('Trust Level', {exact: true})).toBeNull();
      expect(page.getAllByText('The seller can request a verified scan of this data.', {exact: true})).toHaveLength(1);
      const schemaHeading = page.getByRole('heading', { name: 'Schema Information', level: 2 });
      const schemaBlock = schemaHeading.parentElement!;
      expect(within(schemaBlock).getByRole('table')).toBeTruthy();
      expect(within(schemaBlock).getByText('region', { exact: true })).toBeTruthy();
      expect(within(schemaBlock).getByText('10 rows', { exact: true })).toBeTruthy();
      const samples = document.body.querySelectorAll('[data-standalone-buyer-sample]');
      expect(samples).toHaveLength(1);
      expect(schemaBlock.contains(samples[0])).toBe(false);
      expect(schemaBlock.compareDocumentPosition(samples[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      if (route === 'approved Workspace') {
        expect(page.getByTitle('Seller-approved listing')).toBeTruthy();
      }
    },
  );
});

it('marks inherited listings unavailable and preserves seller licence provenance', async () => {
  const html = await renderPage(makeListing({
    license_status: 'pending_seller_terms',
    license_provenance: 'CC-BY-4.0',
    sample_files: [{ index: 0, key_basename: 'sample.csv', size: 12, binding: 'manifest', state: 'available', url: 'https://sample.example/sample.csv' }],
    at_a_glance: { profile: 'aim-listing-enrichment-profile-v2', sample_availability: {
      value: 'View sample', provenance: 'seller_entered', authority: 'seller_entered', source_reference: 'test', source_revision: '1',
    } },
  }));
  expect(html).toContain('Not yet available to buy');
  expect(html).toContain('seller previously indicated: CC-BY-4.0');
  expect(html).not.toContain('>Buy</button>');
  expect(html).not.toContain('sample.csv');
  expect(html).not.toContain('https://sample.example/');
  expect(html).not.toContain('View sample');
  expect(html).not.toContain('Sample availability');
  expect(html).not.toContain('Free sample:');
});

it('keeps inherited seller provenance visible after terms acceptance', async () => {
  const html = await renderPage(makeListing({
    license_status: 'bound', license_provenance: 'CC-BY-4.0',
    sample_files: [{ index: 0, key_basename: 'sample.csv', size: 12, binding: 'manifest', state: 'available', url: 'https://sample.example/sample.csv' }],
  }));
  expect(html).toContain('seller previously indicated: CC-BY-4.0');
  expect(html).not.toContain('Not yet available to buy');
  expect(html).toContain('https://sample.example/sample.csv');
});

describe('ListingDetailPage Dataset JSON-LD', () => {
  beforeEach(() => {
    fetchPublicListing.mockReset();
    fetchListingVersions.mockReset();
    fetchListingAccessWindowDays.mockReset();
    notFound.mockClear();
    buyButtonProps.mockClear();
  });

  it('server-renders exactly one Dataset JSON-LD script from the backend payload', async () => {
    const listing = makeListing();

    const html = await renderPage(listing);
    const scripts = extractJsonLdScripts(html);

    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0])).toEqual(listing.jsonld);
    expect(scripts[0]).not.toContain('</script>');
  });

  it('suppresses Dataset JSON-LD for noindex listings', async () => {
    const html = await renderPage(makeListing({ noindex: true }));

    expect(extractJsonLdScripts(html)).toHaveLength(0);
  });

  it('calls notFound and emits no script when the listing is missing', async () => {
    await expect(renderPage(null)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('keeps visible title and canonical URL aligned with the JSON-LD payload', async () => {
    const listing = makeListing();

    const html = await renderPage(listing);
    const payload = JSON.parse(extractJsonLdScripts(html)[0]);

    expect(html).toContain('Test Dataset');
    expect(payload.name).toBe(listing.title);
    expect(payload.url).toBe(`https://ai.market/listings/${listing.slug}`);
  });

  it('keeps legacy no-version listing markup pinned without a version selector', async () => {
    const html = await renderPage(makeListing());

    expect(html).not.toContain('Version');
    expect(html).not.toContain('Download window');
    expect(html).toMatchSnapshot();
  });

  it('threads known purchase facts through legacy and versioned purchase paths', async () => {
    const listing = makeListing({
      license: 'ODC-BY-1.0',
      data_format: 'json_lines',
      fulfillment_type: 'file_download',
    });

    await renderPage(listing);
    expect(buyButtonProps).toHaveBeenLastCalledWith(expect.objectContaining({
      license: 'ODC-BY-1.0',
      dataFormat: 'json_lines',
      fulfillmentType: 'file_download',
    }));

    buyButtonProps.mockClear();
    fetchListingAccessWindowDays.mockResolvedValueOnce(30);
    await renderPage(listing, [{
      version_id: 'version-1',
      version_label: '2026-Q3',
      published_at: '2026-08-01T00:00:00Z',
      object_count: 1,
      total_size_bytes: 1024,
      status: 'active',
    }]);
    expect(buyButtonProps).toHaveBeenLastCalledWith(expect.objectContaining({
      license: 'ODC-BY-1.0',
      dataFormat: 'json_lines',
      fulfillmentType: 'file_download',
    }));
  });

  it('shows the absent-findings advisory on a paid listing without disabling purchase', async () => {
    const html = await renderPage(makeListing({
      pricing: { price: 25, pricing_type: 'one_time', subscription_price_monthly: null },
      scan_findings: null,
      privacy_score: null,
      trust_level: 'L0',
    }));

    expect(html).not.toContain('Privacy Score');
    expect(html).not.toContain('Trust Level');
    expect(html).not.toContain('Not scored');
    expect(html).toContain('The seller can request a verified scan of this data.');
    expect(html).toContain('Review before buying');
    expect(html).toContain('No active scan findings are published for this listing');
    expect(html.toLowerCase()).not.toContain('quality score');
    expect(html).toContain('<button type="button">Buy</button>');
  });

  it('renders the backend withdrawal marker verbatim', async () => {
    const marker = 'Scan findings withdrawn by seller on 2026-08-23';
    const html = await renderPage(makeListing({
      scan_findings: {
        publication_state: 'WITHDRAWN',
        withdrawn_at_utc: '2026-08-23T12:00:00Z',
        marker,
      },
    }));

    expect(html).toContain(marker);
    expect(html).toContain('The seller can request a verified scan of this data.');
    expect(html).toContain('dateTime="2026-08-23T12:00:00Z"');
  });

  it('contains no numeric quality score or unqualified listing claim', async () => {
    const html = (await renderPage(makeListing())).toLowerCase();

    for (const forbidden of [
      'quality score',
      'certified accurate',
      'guaranteed accurate',
      'compliant data',
      'fit for purpose',
      'continuously monitored',
      'will match the scanned artifact',
    ]) {
      expect(html).not.toContain(forbidden);
    }
    expect(html).toContain('the seller can request a verified scan of this data.');
    expect(html.replace('the seller can request a verified scan of this data.', '')).not.toMatch(/\bverified\b/);
  });
});

describe('approved Workspace presentation',()=>{
  beforeEach(()=>{fetchPublicListing.mockReset();fetchListingVersions.mockReset();buyButtonProps.mockClear();});
  it.each(['seller-listing-review-v2','seller-listing-review-v3','seller-listing-review-v4'] as const)('uses the exact %s approved document in an inert frame',async(presentation_version)=>{
    const {createHash}=await import('node:crypto');
    const rendered_html='<!doctype html><html><body><h1>Approved title</h1><p>**literal text**</p></body></html>';
    const listing=makeListing({approved_presentation:{presentation_version,rendered_html,
      render_hash:createHash('sha256').update(rendered_html).digest('hex')}});
    const html=await renderPage(listing);
    expect(html).toContain('title="Seller-approved listing"');
    expect(html).toContain('sandbox=""');expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('**literal text**');expect(html).not.toContain('class="prose prose-sm');
  });
  it('rejects an unknown presentation version even with a valid digest',async()=>{
    const {createHash}=await import('node:crypto');
    const rendered_html='<p>Unknown version</p>';
    await expect(renderPage(makeListing({approved_presentation:{presentation_version:'seller-listing-review-v5' as never,rendered_html,render_hash:createHash('sha256').update(rendered_html).digest('hex')}}))).rejects.toThrow(/could not be verified/);
    expect(buyButtonProps).not.toHaveBeenCalled();
  });
  it.each(['seller-listing-review-v2','seller-listing-review-v3','seller-listing-review-v4'] as const)('does not render a purchasable page from a mismatched %s approved document',async(presentation_version)=>{
    await expect(renderPage(makeListing({approved_presentation:{presentation_version,
      rendered_html:'changed document',render_hash:'0'.repeat(64)}}))).rejects.toThrow(/could not be verified/);
    expect(buyButtonProps).not.toHaveBeenCalled();
  });
});

it('shows a paused Workspace offer without a purchase control',async()=>{
  const {createHash}=await import('node:crypto');buyButtonProps.mockClear();
  fetchPublicListing.mockReset();fetchListingVersions.mockReset();
  const rendered_html='<html><body>Approved listing</body></html>';
  const html=await renderPage(makeListing({purchasable:false,purchase_hold_reason:'workspace_sales_paused',approved_presentation:{
    presentation_version:'seller-listing-review-v2',rendered_html,render_hash:createHash('sha256').update(rendered_html).digest('hex')}}));
  expect(html).toContain('seller has paused new sales');expect(buyButtonProps).not.toHaveBeenCalled();
});


it('renders approved At a glance on the buyer route with a pinned present snapshot', async () => {
  const {summary} = await import('@/tests/summaryFixture');
  fetchPublicListing.mockReset(); fetchListingVersions.mockReset();
  const html = await renderPage(makeListing({at_a_glance: summary}));
  expect(html).toContain('At a glance');
  expect(html).toContain('One recorded sale');
  expect(html).toMatchSnapshot();
});

it('keeps empty and null summaries byte-identical to the legacy absent buyer route', async () => {
  const {emptySummaries} = await import('@/tests/summaryFixture');
  fetchPublicListing.mockReset(); fetchListingVersions.mockReset();
  const legacy = await renderPage(makeListing());
  for (const at_a_glance of [null, ...emptySummaries]) {
    const html = await renderPage(makeListing({at_a_glance}));
    expect(html).not.toContain('At a glance');
    expect(html).toBe(legacy);
  }
});

describe('fresh public payload transitions', () => {
  beforeEach(() => {
    fetchPublicListing.mockReset();
    fetchListingVersions.mockReset();
    fetchListingAccessWindowDays.mockReset();
    buyButtonProps.mockClear();
  });

  it('renders changed and removed At a glance values without carrying over an earlier render', async () => {
    const {field, summary} = await import('@/tests/summaryFixture');

    document.body.innerHTML = await renderPage(makeListing({at_a_glance: summary}));
    let page = within(document.body);
    expect(page.getByRole('region', {name: 'At a glance'})).toBeTruthy();
    expect(page.getByText('One recorded sale', {exact: true})).toBeTruthy();
    expect(page.getByText('Spain', {exact: true})).toBeTruthy();

    const changed = {
      ...summary,
      row_meaning: field('One current inventory record', 'allai_generated'),
      spatial_coverage: field('Portugal'),
    };
    document.body.innerHTML = await renderPage(makeListing({at_a_glance: changed}));
    page = within(document.body);
    expect(page.getByRole('region', {name: 'At a glance'})).toBeTruthy();
    expect(page.getByText('One current inventory record', {exact: true})).toBeTruthy();
    expect(page.getByText('Portugal', {exact: true})).toBeTruthy();
    expect(page.queryByText('One recorded sale', {exact: true})).toBeNull();
    expect(page.queryByText('Spain', {exact: true})).toBeNull();

    document.body.innerHTML = await renderPage(makeListing({
      description: 'Description after source change.',
      short_description: 'Description after source change.',
      at_a_glance: null,
    }));
    page = within(document.body);
    expect(page.getByText('Description after source change.', {exact: true})).toBeTruthy();
    expect(page.queryByRole('region', {name: 'At a glance'})).toBeNull();
    expect(page.queryByText('One recorded sale', {exact: true})).toBeNull();
    expect(page.queryByText('One current inventory record', {exact: true})).toBeNull();
    expect(fetchPublicListing).toHaveBeenCalledTimes(3);
    expect(fetchPublicListing.mock.calls).toEqual([
      ['test-dataset'], ['test-dataset'], ['test-dataset'],
    ]);
  });

  it('renders At a glance when a later render changes from absent to current', async () => {
    const {summary} = await import('@/tests/summaryFixture');

    document.body.innerHTML = await renderPage(makeListing({at_a_glance: null}));
    expect(within(document.body).queryByRole('region', {name: 'At a glance'})).toBeNull();

    document.body.innerHTML = await renderPage(makeListing({at_a_glance: summary}));
    const page = within(document.body);
    expect(page.getByRole('region', {name: 'At a glance'})).toBeTruthy();
    expect(page.getByText('One recorded sale', {exact: true})).toBeTruthy();
    expect(fetchPublicListing).toHaveBeenCalledTimes(2);
    expect(fetchPublicListing.mock.calls).toEqual([['test-dataset'], ['test-dataset']]);
  });

  it('replaces scan findings on a later render of the same slug', async () => {
    const first = 'Scan findings withdrawn by seller on 2026-09-18';
    const second = 'Scan findings withdrawn by seller on 2026-09-20';

    document.body.innerHTML = await renderPage(makeListing({scan_findings: {
      publication_state: 'WITHDRAWN', withdrawn_at_utc: '2026-09-18T00:00:00Z', marker: first,
    }}));
    expect(within(document.body).getByText(first, {exact: true})).toBeTruthy();

    document.body.innerHTML = await renderPage(makeListing({scan_findings: {
      publication_state: 'WITHDRAWN', withdrawn_at_utc: '2026-09-20T00:00:00Z', marker: second,
    }}));
    const page = within(document.body);
    expect(page.getByText(second, {exact: true})).toBeTruthy();
    expect(page.queryByText(first, {exact: true})).toBeNull();
    expect(fetchPublicListing).toHaveBeenCalledTimes(2);
    expect(fetchPublicListing.mock.calls).toEqual([['test-dataset'], ['test-dataset']]);
  });
});

it('renders the public listing page when legacy schema columns contain duplicates', async () => {
  fetchPublicListing.mockReset(); fetchListingVersions.mockReset();
  const html = await renderPage(makeListing({schema_summary: {
    columns: ['id', 'id'], column_count: 2, sample_types: {id: 'string'},
  }}));
  expect(html).toContain('Schema Information');
  expect(html.match(/>id<\/td>/g)).toHaveLength(2);
});

it.each([
  ['object', {length: 1, 0: 'id'}],
  ['string', 'id'],
  ['number', 7],
  ['null', null],
])('omits schema information when legacy schema columns are a non-array %s', async (_shape, columns) => {
  fetchPublicListing.mockReset(); fetchListingVersions.mockReset();
  const html = await renderPage(makeListing({
    row_count: null,
    schema_summary: {
      columns,
      column_count: 1,
      sample_types: {id: 'string'},
    } as never,
  }));
  expect(html).not.toContain('Schema Information');
});


describe('S1717 member_files and verification scope', () => {
  const scope = '7 data files scanned; 3 documentation files are not part of the data set';
  const sampleUrl = (index: number) => `/api/v1/public/listings/12345678-1234-4234-8234-123456789abc/sample/${index}`;

  async function memberFilesListing(route: 'local' | 'workspace'): Promise<ListingWithSamples> {
    const files = [
      { index: 0, key_basename: 'sales.csv', size: 1536, state: 'available' as const, url: sampleUrl(0) },
      { index: 1, key_basename: 'regions.json', size: 1048576, state: 'available' as const, url: sampleUrl(1) },
      { index: 2, key_basename: 'archive.csv', size: 0, state: 'unavailable' as const, url: sampleUrl(2) },
    ];
    if (route === 'local') {
      return makeListing({ sample_files: files.map(file => ({ ...file, binding: 'manifest' as const })) });
    }
    const { createHash } = await import('node:crypto');
    const rendered_html = '<html><body><h1>Approved member files</h1></body></html>';
    return makeListing({
      sample_files: null,
      approved_presentation: {
        presentation_version: 'seller-listing-review-v2', rendered_html,
        render_hash: createHash('sha256').update(rendered_html).digest('hex'),
        sample_files: files.map((file, index) => ({ ...file, binding: index === 0 ? 'etag_md5' : 'size_only' })),
      },
    });
  }

  beforeEach(() => {
    fetchPublicListing.mockReset();
    fetchListingVersions.mockReset();
    fetchListingAccessWindowDays.mockReset();
    buyButtonProps.mockClear();
  });

  for (const route of ['local', 'workspace'] as const) {
    it(`renders the gateway file breakdown under scope on the ${route} page`, async () => {
      const listing = await memberFilesListing(route);
      listing.verification_scope = '3 of 4 table files scanned; 2 other files are not scanned; 1 skipped as an unsupported type';
      listing.file_breakdown = [
        { format: 'csv', count: 1, size_bytes: 1200 },
        { format: 'tsv', count: 1, size_bytes: 34 },
        { format: 'jsonl', count: 1, size_bytes: 56 },
        { format: 'parquet', count: 1, size_bytes: 78 },
        { format: 'other', count: 2, size_bytes: 4096 },
      ];
      document.body.innerHTML = await renderPage(listing);
      const breakdown = within(document.body).getByRole('region', { name: 'File breakdown' });
      expect(breakdown.previousElementSibling?.textContent).toBe(listing.verification_scope);
      const rows = within(breakdown).getAllByRole('listitem').map(row => row.textContent);
      expect(rows).toEqual(['CSV tables: 1 file · 1.2 KB', 'TSV tables: 1 file · 34 B', 'JSONL tables: 1 file · 56 B', 'PARQUET tables: 1 file · 78 B', 'Other files: 2 files · 4.1 KB']);
      expect(within(document.body).getAllByRole('region', { name: 'File breakdown' })).toHaveLength(1);
    });

    it(`renders an all-other-files breakdown without scope on the ${route} page`, async () => {
      const listing = await memberFilesListing(route);
      listing.verification_scope = null;
      listing.file_breakdown = [{ format: 'other', count: 1, size_bytes: 0 }];
      document.body.innerHTML = await renderPage(listing);
      const breakdown = within(document.body).getByRole('region', { name: 'File breakdown' });
      expect(breakdown.textContent).toContain('Other files: 1 file · 0 B');
      expect(breakdown.textContent).not.toMatch(/CSV|PARQUET|scanned/);
    });

    it(`keeps absent, null and empty file breakdowns identical on the ${route} page`, async () => {
      const listing = await memberFilesListing(route);
      const absent = await renderPage(listing);
      for (const file_breakdown of [null, []]) {
        expect(await renderPage({ ...listing, file_breakdown })).toBe(absent);
      }
    });

    it(`renders the three-file ${route} member_files fixture with named download links`, async () => {
      const html = await renderPage(await memberFilesListing(route));
      document.body.innerHTML = html;
      const block = within(document.body).getByRole('region', { name: 'Free sample: 3 files' });
      const sample = within(block);
      expect(sample.getAllByRole('listitem')).toHaveLength(3);
      expect(sample.getByText('Sample files are part of the purchased set and free to download.')).toBeTruthy();
      expect(sample.getByText('1.54 KB')).toBeTruthy();
      expect(sample.getByText('1.05 MB')).toBeTruthy();
      expect(sample.getByText('0 B')).toBeTruthy();
      // The visible filename is also the accessible link name, not a generic Download label.
      for (const [index, name] of ['sales.csv', 'regions.json'].entries()) {
        const link = sample.getByRole('link', { name });
        expect(link.textContent).toBe(name);
        expect(link.getAttribute('href')).toBe(sampleUrl(index));
        expect(link.hasAttribute('download')).toBe(true);
      }
      expect(sample.getAllByRole('link')).toHaveLength(2);
      expect(sample.getByText('archive.csv')).toBeTruthy();
      expect(sample.getByText('(sample unavailable)')).toBeTruthy();
      expect(sample.queryByRole('link', { name: 'archive.csv' })).toBeNull();
      expect(html).not.toContain(sampleUrl(2));
      if (route === 'local') {
        expect(sample.getAllByText('verified: part of the published dataset')).toHaveLength(3);
      } else {
        expect(sample.getByText('checksum-matched copy')).toBeTruthy();
        expect(sample.getAllByText('copy provided by the seller')).toHaveLength(2);
      }
    });

    it(`keeps ${route} null carriers byte-identical to absent carriers`, async () => {
      const listing = await memberFilesListing(route);
      delete listing.sample_files;
      delete listing.approved_presentation?.sample_files;
      const absent = await renderPage(listing);
      listing.sample_files = null;
      listing.verification_scope = null;
      if (listing.approved_presentation) listing.approved_presentation.sample_files = null;
      const html = await renderPage(listing);
      expect(html).toBe(absent);
      expect(html).not.toContain('free-sample-heading');
      expect(html).not.toContain('free to download');
      expect(html).not.toContain('documentation files are not part of the data set');
    });

    it(`renders the exact scope sentence beside ${route} scan findings`, async () => {
      const listing = await memberFilesListing(route);
      listing.verification_scope = scope;
      listing.scan_findings = {
        publication_state: 'WITHDRAWN', withdrawn_at_utc: '2026-09-17T00:00:00Z',
        marker: 'Scan findings withdrawn by seller on 2026-09-17',
      };
      document.body.innerHTML = await renderPage(listing);
      const sentence = within(document.body).getByText(scope, { exact: true });
      expect(sentence.previousElementSibling?.textContent).toBe('The seller can request a verified scan of this data.');
      expect(sentence.previousElementSibling?.previousElementSibling?.tagName).toBe('ASIDE');
      expect(sentence.previousElementSibling?.previousElementSibling?.textContent).toBe(listing.scan_findings.marker);
    });

    it(`ignores extra private sample metadata on the ${route} carrier`, async () => {
      const listing = await memberFilesListing(route);
      const files = listing.sample_files ?? listing.approved_presentation?.sample_files;
      const clean = await renderPage(listing);
      for (const file of files!) {
        Object.assign(file, {
          storage_key: 'PRIVATE_STORAGE_KEY', asset_id: 'PRIVATE_ASSET_ID',
          connection_id: 'PRIVATE_CONNECTION_ID', source_version: 'PRIVATE_SOURCE_VERSION',
          source_file_path: '/private/source.csv', credential: 'PRIVATE_CREDENTIAL',
        });
      }
      expect(await renderPage(listing)).toBe(clean);
    });
  }

  it('renders scope without sample files or scan findings', async () => {
    const html = await renderPage(makeListing({ sample_files: null, scan_findings: null, verification_scope: scope }));
    expect(html).toContain(scope);
    expect(html).not.toContain('free-sample-heading');
  });
});

it.each([false,true])('shows one licence disclosure when seller terms are pending: %s',async pending=>{
 const license={code:'standard' as const,version:'1.0',params:{ai_training:true},summary:['Standard summary'],full_text_url:'/licenses/standard/1.0/ai-training',download_url:'/licenses/standard/1.0/ai-training?download=1',sha256:'a'.repeat(64),covenant_sha256:'b'.repeat(64),rider_sha256:null};
 const html=await renderPage(makeListing({license,license_status:pending?'pending_seller_terms':'bound'}));
 expect(html.match(/aria-label="Licence terms"/g)).toHaveLength(1);
});

it('uses the same UTC Published date in the header and version card near midnight',async()=>{
 const timestamp='2026-09-27T23:30:00Z';
 const html=await renderPage(makeListing({published_at:timestamp}),[{version_id:'v1',version_label:'v1',published_at:timestamp,object_count:1,total_size_bytes:1024,status:'active'}]);
 expect(html.match(/Published Sep 27, 2026/g)).toHaveLength(2);
});

it('renders the backend description instead of parsing buyer Markdown',async()=>{
  const buyer=document.createElement('div');
  buyer.innerHTML=await renderPage(makeListing({description:'🫨*! sales@acme*.io',description_html:'<p>Backend <strong>description</strong></p>'}));
  expect(buyer.querySelector('[dir="auto"]')?.innerHTML).toBe('<p>Backend <strong>description</strong></p>');
});

it.each([undefined,null,'<script>bad</script>'])('renders escaped pre-wrap buyer text for unavailable or invalid backend HTML: %s',async description_html=>{
  const source='🫨*! sales@acme*.io\n<script>literal</script> **literal**';
  const buyer=document.createElement('div');
  buyer.innerHTML=await renderPage(makeListing({description:source,description_html}));
  const description=buyer.querySelector('[dir="auto"]');
  expect(description?.textContent).toBe(source);
  expect(description?.classList.contains('whitespace-pre-wrap')).toBe(true);
  expect(description?.querySelector('script, strong')).toBeNull();
});

it('renders human category labels for primary, secondary and unknown categories', async () => {
  fetchPublicListing.mockReset(); fetchListingVersions.mockReset();
  document.body.innerHTML = await renderPage(makeListing({
    category: 'technology-web',
    secondary_categories: ['ai-machine-learning', 'consumer-retail', 'future-category'],
  }));
  const page = within(document.body);
  for (const label of ['Technology & Web', 'AI & Machine Learning', 'Consumer & Retail', 'Future Category']) {
    expect(page.getByText(label, {exact: true})).toBeTruthy();
  }
  expect(document.body.textContent).not.toMatch(/technology-web|ai-machine-learning|consumer-retail|future-category/);
});

it('renders 14,140,000,000 bytes identically in every public listing size display', async () => {
  const {field, summary} = await import('@/tests/summaryFixture');
  fetchPublicListing.mockReset(); fetchListingVersions.mockReset();
  const bytes = 14_140_000_000;
  document.body.innerHTML = await renderPage(makeListing({
    at_a_glance: {...summary, size_bytes: field(bytes)},
    sample_files: [{index: 0, key_basename: 'large.csv', size: bytes, binding: 'manifest', state: 'available', url: '/sample/0'}],
    file_breakdown: [{format: 'csv', count: 1, size_bytes: bytes}],
  }), [{version_id: 'v1', version_label: 'v1', published_at: '2026-06-01T00:00:00Z', object_count: 1, total_size_bytes: bytes, status: 'active'}]);
  const page = within(document.body);
  expect(within(page.getByRole('region', {name: 'At a glance'})).getByText('14.14 GB', {exact: true})).toBeTruthy();
  expect(page.getByTestId('version-v1').textContent).toContain('14.14 GB');
  expect(within(page.getByRole('region', {name: 'Free sample: 1 files'})).getByText('14.14 GB', {exact: true})).toBeTruthy();
  expect(page.getByRole('region', {name: 'File breakdown'}).textContent).toContain('14.14 GB');
  expect(document.body.textContent?.match(/14\.14 GB/g)).toHaveLength(4);
});


describe('USDC request placement on the public listing', () => {
  beforeEach(() => {
    fetchPublicListing.mockReset();
    fetchListingVersions.mockReset();
    buyButtonProps.mockClear();
    usdcRequestProps.mockClear();
  });

  it.each([false, true])('keeps existing Buy props unchanged with version panel=%s', async (versioned) => {
    const listing = makeListing({ pricing: { price: 10000, pricing_type: 'one_time', subscription_price_monthly: null } });
    const versions: ListingVersion[] = versioned ? [{ version_id: 'v1', version_label: 'v1', published_at: '2026-06-01T00:00:00Z', object_count: 1, total_size_bytes: 100, status: 'active' }] : [];
    fetchListingAccessWindowDays.mockResolvedValue(30);
    const html = await renderPage(listing, versions);
    expect(html).toContain('>Buy</button>');
    expect(html).toContain('$10,000.00');
    expect(buyButtonProps).toHaveBeenCalledOnce();
    expect(buyButtonProps.mock.calls[0][0]).toMatchObject({ listingId: listing.id, slug: listing.slug, price: 10000, pricingType: 'one_time', disabledReason: undefined });
    if (versioned) expect(html).toContain('Download window: 30 days after purchase.');
    expect(usdcRequestProps).toHaveBeenCalledWith({ listingId: listing.id, slug: listing.slug, title: listing.title, pricing: listing.pricing });
  });

  it.each(['listing_publication_unavailable', 'workspace_sales_paused'])('omits the request for hold %s', async (purchase_hold_reason) => {
    await renderPage(makeListing({ purchase_hold_reason, pricing: { price: 10000, pricing_type: 'one_time', subscription_price_monthly: null } }));
    expect(usdcRequestProps).not.toHaveBeenCalled();
  });

  it('omits the request while seller terms are pending', async () => {
    await renderPage(makeListing({ license_status: 'pending_seller_terms', pricing: { price: 10000, pricing_type: 'one_time', subscription_price_monthly: null } }));
    expect(usdcRequestProps).not.toHaveBeenCalled();
    expect(buyButtonProps).not.toHaveBeenCalled();
  });

  it('omits the request when an approved offer hides the purchase panel', async () => {
    const { createHash } = await import('node:crypto');
    const rendered_html = '<html><body>Approved listing</body></html>';
    await renderPage(makeListing({
      purchasable: false,
      pricing: { price: 10000, pricing_type: 'one_time', subscription_price_monthly: null },
      approved_presentation: {
        presentation_version: 'seller-listing-review-v2', rendered_html,
        render_hash: createHash('sha256').update(rendered_html).digest('hex'),
      },
    }));
    expect(usdcRequestProps).not.toHaveBeenCalled();
    expect(buyButtonProps).not.toHaveBeenCalled();
  });
});

describe('S1922 actual current public rendering',()=>{
  it.each([0,1,2])('renders backend correction template %s with platform title, original evidence and current label',async index=>{
    const {default:wire}=await import('@/tests/fixtures/s1922-backend-wire.json');
    const c=wire.public[index].corrected;
    const html=await renderPage(makeListing({id:c.listing_id,approved_presentation:c as ListingDetail['approved_presentation'],license:c.license_label,
      license_display:{license_label:c.license_label,provenance:c.provenance,correction_id:c.correction_id,correction_digest:c.correction_digest}} as Partial<ListingWithSamples>));
    const container=document.createElement('div');container.innerHTML=html;
    const frame=container.querySelector('iframe[title="Listing with platform-corrected licence display"]');
    expect(frame?.getAttribute('srcdoc')).toBe(c.rendered_html);
    expect(frame?.getAttribute('sandbox')).toBe('');
    expect(container.textContent).toContain('Platform-corrected licence display; original seller approval retained');
    expect(container.textContent).toContain('Original seller evidence');
    expect(container.querySelector('iframe[title="Seller-approved listing"]')).toBeNull();
  });
  it('refuses partial or foreign correction HTML before producing an iframe',async()=>{
    const {default:wire}=await import('@/tests/fixtures/s1922-backend-wire.json');
    const c=wire.public[2].corrected;
    for(const approved of [{...c,correction_digest:undefined},{...c,listing_id:'ffffffff-ffff-ffff-ffff-ffffffffffff'},{...c,rendered_html:'unsafe'}]){
      await expect(renderPage(makeListing({id:c.listing_id,approved_presentation:approved as ListingDetail['approved_presentation']}))).rejects.toThrow();
    }
  });
});

it('emits actual backend current JSON-LD alongside unchanged original summary evidence',async()=>{
 const {default:wire}=await import('@/tests/fixtures/s1922-backend-wire.json');
 const fixture=wire.public[2],c=fixture.corrected;
 const before=JSON.stringify(fixture.at_a_glance);
 const html=await renderPage(makeListing({id:c.listing_id,approved_presentation:c as ListingDetail['approved_presentation'],license:c.license_label,
   license_display:fixture.license_display,jsonld:fixture.jsonld,at_a_glance:fixture.at_a_glance} as Partial<ListingWithSamples>));
 const jsonld=JSON.parse(extractJsonLdScripts(html)[0]);
 expect(jsonld.license.name).toBe('ai.market Standard Data Licence v1.1');
 expect(jsonld.additionalProperty).toContainEqual(expect.objectContaining({name:'Licence display provenance',value:'Platform-corrected licence display; original seller approval retained',propertyID:c.correction_digest}));
 expect(fixture.at_a_glance.license.value).toBe('ai.market Standard Data Licence v1.0');
 expect(JSON.stringify(fixture.at_a_glance)).toBe(before);
 expect(html).toContain('Original approved summary evidence');
});
