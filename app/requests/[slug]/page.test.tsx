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
  default: ({ initialRequest }: { initialRequest: DataRequestDetail }) => (
    <main>
      <h1>{initialRequest.title}</h1>
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
    owner_id: 'buyer-1',
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

  it('calls notFound when the request is missing', async () => {
    fetchDataRequest.mockResolvedValueOnce(null);
    const { default: DataRequestDetailPage } = await importPage();

    await expect(
      DataRequestDetailPage({ params: Promise.resolve({ slug: 'missing' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
