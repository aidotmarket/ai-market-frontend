// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browseResponse, conflictingShortDescription, listingSummaryCases, markdownDescription } from '@/tests/listingSummaryFixture';

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

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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

describe('homepage listing grid', () => {
  it.each(listingSummaryCases())('renders the browse excerpt for $state', async ({ summary }) => {
    const listing = { ...browseResponse.items[0], summary };
    const withMarkdown = {
      ...listing, id: '26ab5022-cfcb-41a6-b1ee-2260ac308980', slug: 'dataset-with-markdown',
      title: 'Dataset with extra Markdown', description: markdownDescription,
    };
    const response = { ...browseResponse, items: [listing, withMarkdown], pagination: { ...browseResponse.pagination, total: 2 } };
    fetchPublicListings.mockResolvedValue(await Response.json(response).json());
    fetchFeaturedFeed.mockResolvedValue(null);
    fetchDataRequests.mockResolvedValue({ items: [] });
    const { default: LandingPage } = await import('./page');

    render(await LandingPage());
    for (const item of [listing, withMarkdown]) {
      const card = screen.getByRole('heading', { name: item.title }).closest('a')!;
      expect(card.getAttribute('href')).toBe(`/listings/${item.slug}`);
      expect(within(card).getByRole('paragraph').textContent)
        .toBe(summary === undefined ? conflictingShortDescription : summary ?? '');
    }
  });
});

describe('homepage buyer requests', () => {
  it('renders request Markdown as plain card text without changing its source', async () => {
    const item = { ...request('markdown'), title: '**Title: Request for _retail_ data**', description: '## Needs\n- **Sales** and [regions](https://example.com)' };
    fetchDataRequests.mockResolvedValue({ items: [item, request('2'), request('3')] });
    const { default: LandingPage } = await import('./page');
    render(await LandingPage());
    const card = screen.getByRole('heading', { name: 'Request for retail data' }).closest('a')!;
    expect(card.getAttribute('href')).toBe('/requests/request-markdown');
    expect(within(card).getByText('Needs Sales and regions')).toBeTruthy();
    expect(within(card).queryByRole('link', { name: 'regions' })).toBeNull();
    expect(item.title).toBe('**Title: Request for _retail_ data**');
  });

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

describe('homepage hero and descriptions', () => {
  const summary = 'Businesses buy and sell data on ai.market. Sellers keep their data in storage they control. Buyers download purchased files directly from the seller.';

  beforeEach(() => {
    fetchPublicListings.mockResolvedValue({ items: [] });
    fetchFeaturedFeed.mockResolvedValue(null);
    fetchDataRequests.mockResolvedValue({ items: [] });
  });

  it('explains how businesses buy and sell data in the hero and structured data', async () => {
    const { default: LandingPage } = await import('./page');
    const { container } = render(await LandingPage());
    const hero = within(screen.getByRole('heading', { level: 1 }).closest('section')!);

    expect(hero.getByText('Data marketplace for businesses')).toBeTruthy();
    expect(hero.getByText(`${summary} Buyers can search for data or post a request. AI agents can help search and draft requests.`)).toBeTruthy();

    const structuredData = container.querySelector('script[type="application/ld+json"]')!;
    expect(JSON.parse(structuredData.textContent!)).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'ai.market',
        url: 'https://ai.market',
        description: summary,
        sameAs: ['https://github.com/maxrobbins'],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'ai.market',
        url: 'https://ai.market',
        description: summary,
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://ai.market/find-data?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
    ]);
    expect(container.textContent).not.toMatch(/non-custodial B2B (?:data )?marketplace/i);
  });

  it('uses a consistent, cloud-first description for search and social', async () => {
    const { metadata } = await import('./page');
    const description = `${summary} Sellers can list from their own AWS S3 or Cloudflare R2 bucket, or host files on their own servers with the AIM Data Gateway. Buyers can search for data or post a request.`;

    expect(metadata.description).toBe(description);
    expect(metadata.openGraph?.description).toBe(description);
    expect(metadata.twitter?.description).toBe(description);
    expect(metadata.title).toEqual({ absolute: 'ai.market — Sell data without giving it away' });
    expect(metadata.alternates?.canonical).toBe('/');
  });

  it('keeps search, buyer requests, and seller information at their existing destinations', async () => {
    const { default: LandingPage } = await import('./page');
    render(await LandingPage());
    const hero = within(screen.getByRole('heading', { level: 1 }).closest('section')!);

    fireEvent.change(hero.getByRole('searchbox'), { target: { value: '  US retail sales  ' } });
    fireEvent.click(hero.getByRole('button', { name: 'Search' }));
    expect(push).toHaveBeenLastCalledWith('/find-data?q=US%20retail%20sales');
    expect(hero.getByRole('link', { name: 'Browse Data' }).getAttribute('href')).toBe('/listings');
    expect(hero.getByRole('link', { name: 'Post a Request' }).getAttribute('href')).toBe('/requests');
    expect(screen.getByRole('link', { name: 'Post a Buyer Request' }).getAttribute('href')).toBe('/requests/new');
    expect(screen.getByRole('link', { name: 'Sell Data' }).getAttribute('href')).toBe('/sell-data');
  });
});
