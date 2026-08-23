import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListingDetail, ListingVersion } from '@/types';

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

function makeListing(overrides: Partial<ListingDetail> = {}): ListingDetail {
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
