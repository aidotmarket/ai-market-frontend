import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataRequestDetail } from '@/types';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const fetchDataRequest = vi.fn();

vi.mock('next/navigation', () => ({
  notFound,
}));

vi.mock('@/lib/api', () => ({
  fetchDataRequest,
}));

vi.mock('./DataRequestDetailClient', () => ({
  default: ({
    slug,
    initialRequest,
    boardQuery,
  }: {
    slug: string;
    initialRequest: DataRequestDetail | null;
    boardQuery: string;
  }) => (
    <main data-slug={slug} data-has-initial-request={initialRequest !== null} data-board-query={boardQuery}>
      {initialRequest && <h1>{initialRequest.title}</h1>}
    </main>
  ),
}));

function makeRequest(overrides: Partial<DataRequestDetail> = {}): DataRequestDetail {
  return {
    id: 'request-1',
    slug: 'need-claims-data',
    title: 'Need Claims Data',
    description: 'Visible request description.',
    categories: ['healthcare'],
    urgency: 'high',
    price_range_min: 1000,
    price_range_max: 5000,
    currency: 'USD',
    status: 'open',
    response_count: 0,
    buyer_display_name: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    format_preferences: ['csv'],
    provenance_requirements: null,
    published_at: '2026-06-01T00:00:00Z',
    buyer_id: 'buyer-1',
    indexing: { index: true, robots: 'index, follow' },
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Demand',
      name: 'Need Claims Data',
      url: 'https://ai.market/requests/need-claims-data',
    },
    ...overrides,
  };
}

async function importPage() {
  vi.resetModules();
  return import('./page');
}

function extractJsonLdScripts(html: string): string[] {
  return Array.from(
    html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    (match) => match[1],
  );
}

describe('DataRequestDetailPage Demand JSON-LD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_ENABLE_REQUEST_JSONLD;
  });

  it('does not serialize a private draft or its proposed address into server HTML or metadata', async () => {
    const request = makeRequest({
      slug: null, status: 'draft', title: 'Synthetic private original',
      publication_preparation: { status: 'preparing' },
    });
    fetchDataRequest.mockResolvedValue(request);
    const { default: Page, generateMetadata } = await importPage();
    const props = { params: Promise.resolve({ slug: '00000000-0000-4000-8000-000000000001' }) };
    expect(await generateMetadata(props)).toEqual({ title: 'Data Request', robots: { index: false, follow: false } });
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain('data-has-initial-request="false"');
    expect(html).not.toContain('Synthetic private original');
    expect(extractJsonLdScripts(html)).toHaveLength(0);
  });

  it('server-renders exactly one Demand JSON-LD script from the backend payload', async () => {
    const request = makeRequest();
    fetchDataRequest.mockResolvedValueOnce(request);
    const { default: DataRequestDetailPage } = await importPage();

    const element = await DataRequestDetailPage({
      params: Promise.resolve({ slug: 'need-claims-data' }),
    });
    const html = renderToStaticMarkup(element);
    const scripts = extractJsonLdScripts(html);

    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0])).toEqual(request.jsonld);
    expect(html).toContain('Need Claims Data');
  });

  it('passes only the originating board filters to the detail client', async () => {
    fetchDataRequest.mockResolvedValueOnce(makeRequest());
    const { default: Page } = await importPage();

    const html = renderToStaticMarkup(await Page({
      params: Promise.resolve({ slug: 'need-claims-data' }),
      searchParams: Promise.resolve({ page: '3', category: 'retail', response_id: 'response-1' }),
    }));

    expect(html).toContain('data-board-query="page=3&amp;category=retail"');
  });

  it('suppresses Demand JSON-LD when the request flag is false', async () => {
    process.env.NEXT_PUBLIC_ENABLE_REQUEST_JSONLD = 'false';
    fetchDataRequest.mockResolvedValueOnce(makeRequest());
    const { default: DataRequestDetailPage } = await importPage();

    const element = await DataRequestDetailPage({
      params: Promise.resolve({ slug: 'need-claims-data' }),
    });

    expect(extractJsonLdScripts(renderToStaticMarkup(element))).toHaveLength(0);
  });

  it('suppresses Demand JSON-LD for noindex responses', async () => {
    fetchDataRequest.mockResolvedValueOnce(
      makeRequest({ indexing: { index: false, robots: 'noindex, nofollow' } }),
    );
    const { default: DataRequestDetailPage } = await importPage();

    const element = await DataRequestDetailPage({
      params: Promise.resolve({ slug: 'need-claims-data' }),
    });

    expect(extractJsonLdScripts(renderToStaticMarkup(element))).toHaveLength(0);
  });

  it('renders the client loader instead of calling notFound when the anonymous fetch misses', async () => {
    fetchDataRequest.mockResolvedValueOnce(null);
    const { default: DataRequestDetailPage } = await importPage();

    const element = await DataRequestDetailPage({
      params: Promise.resolve({ slug: 'draft-request' }),
    });
    const html = renderToStaticMarkup(element);

    expect(notFound).not.toHaveBeenCalled();
    expect(html).toContain('data-slug="draft-request"');
    expect(html).toContain('data-has-initial-request="false"');
  });

  it('returns neutral noindex metadata when the anonymous fetch misses', async () => {
    fetchDataRequest.mockResolvedValueOnce(null);
    const { generateMetadata } = await importPage();

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'draft-request' }),
    });

    expect(metadata).toEqual({
      title: 'Data Request',
      robots: { index: false, follow: false },
    });
  });
});
