import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchDataRequests = vi.fn();
const fetchFeaturedFeed = vi.fn();
const fetchPublicListings = vi.fn();

vi.mock('@/lib/api', () => ({
  fetchDataRequests,
  fetchFeaturedFeed,
  fetchPublicListings,
}));

vi.mock('@/components/HomepageActivityTickerBeacons', () => ({
  HomepageActivityTickerBeacons: () => null,
}));

vi.mock('@/components/HeroSearch', () => ({
  HeroSearch: () => <div>Search</div>,
}));

function request(id: string) {
  return {
    id,
    slug: `request-${id}`,
    title: `Request ${id}`,
    description: `Description ${id}`,
    categories: ['manufacturing'],
    urgency: 'normal',
    price_range_min: null,
    price_range_max: null,
    currency: 'USD',
    status: 'open',
    response_count: 0,
    buyer_display_name: null,
    created_at: '2026-08-29T00:00:00Z',
    updated_at: null,
  };
}

describe('homepage buyer requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPublicListings.mockResolvedValue({ items: [] });
    fetchFeaturedFeed.mockResolvedValue(null);
  });

  it('server-renders three genuine requests as live buyer demand', async () => {
    fetchDataRequests.mockResolvedValue({ items: [request('1'), request('2'), request('3')] });
    const { default: LandingPage } = await import('./page');

    const html = renderToStaticMarkup(await LandingPage());

    expect(html).toContain('Buyer demand, live now');
    expect(html).toContain('Request 1');
    expect(html).toContain('href="/requests/request-3"');
    expect(fetchDataRequests).toHaveBeenCalledWith({ per_page: 3 });
  });

  it('shows an invitation without claiming live demand below three requests', async () => {
    fetchDataRequests.mockResolvedValue({ items: [request('1'), request('2')] });
    const { default: LandingPage } = await import('./page');

    const html = renderToStaticMarkup(await LandingPage());

    expect(html).toContain('Tell the market what data you need');
    expect(html).not.toContain('Buyer demand, live now');
    expect(html).not.toContain('Request 1');
  });
});
