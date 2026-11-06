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
  it.each([true, false, undefined, 'true', 1, null])('tags only an explicit sample flag (%s) next to its buyer demand title', async is_sample => {
    const extra = is_sample === undefined ? {} : { is_sample };
    fetchDataRequests.mockResolvedValue({ items: [{ ...request('1'), ...extra }, { ...request('2'), title: 'Synthetic data request' }, request('3')] });
    const { default: LandingPage } = await import('./page');
    render(await LandingPage());
    const heading = screen.getByRole('heading', { name: 'Request 1' });
    const card = heading.closest('a')!;
    expect(card.getAttribute('href')).toBe('/requests/request-1');
    const badge = within(card).queryByText('(SAMPLE)');
    expect(badge !== null).toBe(is_sample === true);
    if (badge) expect(heading.nextElementSibling).toBe(badge);
    expect(screen.queryAllByText('(SAMPLE)')).toHaveLength(is_sample === true ? 1 : 0);
    expect(screen.getByRole('link', { name: /Synthetic data request/ }).getAttribute('href')).toBe('/requests/request-2');
  });

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

it('server-renders the 1.2 payout claim and international exception before client hydration', async () => {
  serverTerms.getPublicTermsVersion.mockResolvedValue('1.2');
  fetchPublicListings.mockResolvedValue({ items: [] });
  fetchFeaturedFeed.mockResolvedValue(null);
  fetchDataRequests.mockResolvedValue({ items: [] });
  const { default: LandingPage } = await import('./page');
  const html = renderToStaticMarkup(await LandingPage());
  expect(html).toContain("Buyers find your listing wherever they search, on ai.market or through their AI assistant. You&#x27;re paid through Stripe 48 hours after the buyer confirms delivery. Sellers on international payout (USDC on Solana) are paid at least 30 days after the buyer confirms delivery.");
  expect(html).not.toMatch(/90.day/);
  expect(html).not.toContain('Buyers find your listing wherever they search, on ai.market or through their own AI assistant. Stripe pays you 48 hours after the buyer confirms delivery. Sellers paid internationally in USDC on Solana are paid at least 30 days after the buyer confirms delivery.');
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

it.each(['1.1', '1.2'])('renders the cloud-first homepage copy under terms %s', async (version) => {
  serverTerms.getPublicTermsVersion.mockResolvedValue(version);
  fetchPublicListings.mockResolvedValue({ items: [] });
  fetchFeaturedFeed.mockResolvedValue(null);
  fetchDataRequests.mockResolvedValue({ items: [] });
  const { default: LandingPage } = await import('./page');
  render(await LandingPage());

  const nonCustodial = within(screen.getByRole('heading', { name: 'How non-custodial actually works' }).closest('section')!);
  expect(nonCustodial.getByText('allAI does the work, your files never leave your storage, and you get paid.')).toBeTruthy();
  expect(nonCustodial.getByText(version === '1.2'
    ? 'We deduct 5% and the card processing fee from the seller; the buyer pays the price shown plus any applicable tax.'
    : 'We deduct 5% from the seller; the buyer pays any payment-provider costs and applicable tax shown at checkout.')).toBeTruthy();
  expect(nonCustodial.getAllByRole('paragraph')).toHaveLength(3);

  const steps = within(screen.getByRole('heading', { name: 'Three steps to get discovered' }).closest('section')!);
  expect(steps.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
    'Connect your data.',
    'Let allAI build your listing.',
    'Get paid.',
  ]);
  expect(steps.getByText('Connect your AWS S3 or Cloudflare R2 bucket with a read-only key. If your data has to stay on your own servers, run our open-source AIM Data gateway instead.')).toBeTruthy();
  expect(steps.getByText('allAI drafts the description from your file names and your notes. You check it, set the price and license, and publish.')).toBeTruthy();
  expect(steps.getByText(version === '1.2'
    ? "Buyers find your listing wherever they search, on ai.market or through their AI assistant. You're paid through Stripe 48 hours after the buyer confirms delivery. Sellers on international payout (USDC on Solana) are paid at least 30 days after the buyer confirms delivery."
    : 'Buyers find your listing wherever they search, on ai.market or through their own AI assistant. Stripe pays you 48 hours after the buyer confirms delivery. Sellers paid internationally in USDC on Solana are paid at least 30 days after the buyer confirms delivery.')).toBeTruthy();

  const connect = steps.getByRole('link', { name: 'Connect' });
  expect(connect.getAttribute('href')).toBe('/docs/claude');
  expect(connect.className).toBe('text-[#3F51B5] hover:underline');
  expect(connect.parentElement?.textContent).toBe('Prefer your own AI? Connect Claude or ChatGPT and list from the chat.');
  expect(connect.parentElement?.className).toBe('mt-2 text-sm leading-6 text-[#666666]');

  const sellData = within(screen.getByRole('heading', { name: 'Sell Data' }).parentElement!);
  expect(sellData.getByText('List from your own cloud storage or servers')).toBeTruthy();
  for (const tag of ['S3 or R2', 'AIM Data gateway', 'Direct download']) {
    expect(sellData.getByText(tag)).toBeTruthy();
  }
  expect(sellData.queryByText('Your infrastructure')).toBeNull();
  expect(sellData.queryByText('You confirm each file')).toBeNull();
  expect(sellData.getByText('Connect your S3 or R2 bucket, or run the open-source AIM Data gateway. Buyers download directly from your storage.')).toBeTruthy();
});

it('uses the cloud-first description in homepage metadata', async () => {
  const { metadata } = await import('./page');
  const description = 'Non-custodial B2B data marketplace. List from your S3 or R2 bucket, or from your own servers with AIM Data. Find data with semantic search and data requests.';
  expect(metadata.description).toBe(description);
  expect(metadata.openGraph?.description).toBe(description);
  expect(metadata.twitter?.description).toBe(description);
});
