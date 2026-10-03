// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));
afterEach(cleanup);

const serverTerms = vi.hoisted(() => ({ getPublicTermsVersion: vi.fn().mockResolvedValue('1.1') }));
vi.mock('@/lib/publicTermsVersion', () => serverTerms);
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
    serverTerms.getPublicTermsVersion.mockResolvedValue('1.1');
    fetchPublicListings.mockResolvedValue({ items: [] });
    fetchFeaturedFeed.mockResolvedValue(null);
  });

  it('server-renders three genuine requests as live buyer demand', async () => {
    fetchDataRequests.mockResolvedValue({ items: [request('1'), request('2'), request('3')] });
    const { default: LandingPage } = await import('./page');

    const html = renderToStaticMarkup(await LandingPage());

    expect(html).toContain('We deduct 5% from the seller; the buyer pays any payment-provider costs and applicable tax shown at checkout.');
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

  it('keeps the homepage available when the request feed is unavailable', async () => {
    fetchDataRequests.mockRejectedValue(new Error('request feed unavailable'));
    const { default: LandingPage } = await import('./page');

    const html = renderToStaticMarkup(await LandingPage());

    expect(html).toContain('Tell the market what data you need');
    expect(html).not.toContain('Buyer demand, live now');
  });
});

describe('homepage final CTA', () => {
  it.each([false, true])('keeps buyer navigation and offers the seller destination when authenticated=%s', async (isAuthenticated) => {
    auth.isAuthenticated = isAuthenticated;
    fetchPublicListings.mockResolvedValue({ items: [] });
    fetchFeaturedFeed.mockResolvedValue(null);
    fetchDataRequests.mockResolvedValue({ items: [] });
    const { default: LandingPage } = await import('./page');

    render(await LandingPage());
    const section = screen.getByRole('heading', { name: 'Ready to get started?' }).closest('section')!;
    const cta = within(section);

    expect(cta.getByRole('link', { name: 'Find Data' }).getAttribute('href')).toBe('/find-data');
    expect(cta.getByText('Buyers search free. No account needed to look. Sellers list free and pay nothing until a sale clears.')).toBeTruthy();
    const sellerLink = cta.getByRole('link', { name: isAuthenticated ? 'Open Seller Workspace' : 'Create Your Account' });
    expect(sellerLink.getAttribute('href')).toBe(isAuthenticated ? '/dashboard/seller-workspace' : '/register');
    expect(sellerLink.className).toBe('inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0]');
    if (isAuthenticated) expect(cta.queryByRole('link', { name: 'Create Your Account' })).toBeNull();
  });
});

it('server-renders the 1.2 payout claim before client hydration', async () => {
  serverTerms.getPublicTermsVersion.mockResolvedValue('1.2');
  fetchPublicListings.mockResolvedValue({ items: [] });
  fetchFeaturedFeed.mockResolvedValue(null);
  fetchDataRequests.mockResolvedValue({ items: [] });
  const { default: LandingPage } = await import('./page');
  const html = renderToStaticMarkup(await LandingPage());
  expect(html).toContain("Buyers find your listing wherever they search, on ai.market or through their AI assistant. You&#x27;re paid through Stripe 48 hours after the buyer confirms delivery.");
  expect(html).not.toMatch(/90.day/);
  expect(html).not.toContain('Buyers find your listing wherever they search, on ai.market or through their AI assistant. Stripe handles the payout.');
});

it('server-renders seller-bears fees under 1.2 without buyer provider-cost claims', async () => {
  serverTerms.getPublicTermsVersion.mockResolvedValue('1.2');
  fetchPublicListings.mockResolvedValue({ items: [] });
  fetchFeaturedFeed.mockResolvedValue(null);
  fetchDataRequests.mockResolvedValue({ items: [] });
  const { default: LandingPage } = await import('./page');
  const html = renderToStaticMarkup(await LandingPage());
  expect(html).toContain('We deduct 5% and the card processing fee from the seller; the buyer pays the price shown plus any applicable tax.');
  expect(html).not.toMatch(/payment-provider|provider costs|transaction costs/i);
});
