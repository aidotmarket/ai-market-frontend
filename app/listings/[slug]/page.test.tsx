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
    publisher: { name: 'Seller Co', id: 'seller-1' },
    pricing: {
      price: 0,
      pricing_type: 'one_time',
      subscription_price_monthly: null,
    },
    license: 'CC-BY-4.0',
    category: 'Business',
    secondary_categories: null,
    tags: ['test'],
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
    quality_score: 90,
    searchability_score: 80,
    compliance_status: 'low_risk',
    compliance_frameworks: [],
    trust_level: 'L1',
    verification_status: 'verified',
    is_accessible_for_free: true,
    view_count: 1,
    inquiry_count: 0,
    noindex: false,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    published_at: '2026-06-01T00:00:00Z',
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
      access_window_days: 30,
    });

    await renderPage(listing);
    expect(buyButtonProps).toHaveBeenLastCalledWith(expect.objectContaining({
      license: 'ODC-BY-1.0',
      dataFormat: 'json_lines',
      fulfillmentType: 'file_download',
    }));

    buyButtonProps.mockClear();
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

  it('shows advisory signals on a paid weak-signal listing without disabling purchase', async () => {
    const html = await renderPage(makeListing({
      pricing: { price: 25, pricing_type: 'one_time', subscription_price_monthly: null },
      compliance_status: 'not_checked',
      quality_score: 0,
      verification_status: 'unverified',
      trust_level: 'L0',
    }));

    expect(html).toContain('Review before buying');
    expect(html).toContain('Compliance not checked');
    expect(html).toContain('Quality score: 0/100');
    expect(html).toContain('Verification status: Unverified');
    expect(html).toContain('Trust level: New');
    expect(html).toContain('advisory, not a purchase block');
    expect(html).toContain('<button type="button">Buy</button>');
  });
});
