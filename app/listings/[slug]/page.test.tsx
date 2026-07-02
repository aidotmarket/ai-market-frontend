import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListingDetail } from '@/types';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

const fetchPublicListing = vi.fn();
const fetchListingVersions = vi.fn();
const fetchListingAccessWindowDays = vi.fn();
const resolveListingUUID = vi.fn();

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
  default: () => <button type="button">Buy</button>,
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

async function renderPage(listing: ListingDetail | null): Promise<string> {
  fetchPublicListing.mockResolvedValueOnce(listing);
  fetchListingVersions.mockResolvedValueOnce([]);
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
});
