// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('next/navigation', () => ({
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
    return <button type="button">Buy</button>;
  },
}));

vi.mock('@/components/InquiryWidget', () => ({
  default: () => <div />,
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('rehype-sanitize', () => ({
  default: {},
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
    }));

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
    expect(html).not.toMatch(/\bverified\b/);
  });
});

describe('approved Workspace presentation',()=>{
  beforeEach(()=>{fetchPublicListing.mockReset();fetchListingVersions.mockReset();buyButtonProps.mockClear();});
  it('uses the exact approved document in an inert frame',async()=>{
    const {createHash}=await import('node:crypto');
    const rendered_html='<!doctype html><html><body><h1>Approved title</h1><p>**literal text**</p></body></html>';
    const listing=makeListing({approved_presentation:{presentation_version:'seller-listing-review-v2',rendered_html,
      render_hash:createHash('sha256').update(rendered_html).digest('hex')}});
    const html=await renderPage(listing);
    expect(html).toContain('title="Seller-approved listing"');
    expect(html).toContain('sandbox=""');expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('**literal text**');expect(html).not.toContain('class="prose prose-sm');
  });
  it('does not render a purchasable page from a mismatched approved document',async()=>{
    await expect(renderPage(makeListing({approved_presentation:{presentation_version:'seller-listing-review-v2',
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
    it(`renders the three-file ${route} member_files fixture with named download links`, async () => {
      const html = await renderPage(await memberFilesListing(route));
      document.body.innerHTML = html;
      const block = within(document.body).getByRole('region', { name: 'Free sample: 3 files' });
      const sample = within(block);
      expect(sample.getAllByRole('listitem')).toHaveLength(3);
      expect(sample.getByText('Sample files are part of the purchased set and free to download.')).toBeTruthy();
      expect(sample.getByText('1.5 KiB')).toBeTruthy();
      expect(sample.getByText('1 MiB')).toBeTruthy();
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
      expect(sentence.previousElementSibling?.tagName).toBe('ASIDE');
      expect(sentence.previousElementSibling?.textContent).toBe(listing.scan_findings.marker);
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
