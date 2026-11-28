// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browseResponse, conflictingShortDescription, listingSummaryCases, markdownDescription } from '@/tests/listingSummaryFixture';

const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));
afterEach(cleanup);
vi.mock('next/link', () => import('@/tests/listingLinkPrefetchMock'));

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
  function listing(slug: string, displayName: string | null, title: string) {
    return {
      ...browseResponse.items[0],
      id: slug,
      slug,
      title,
      publisher: displayName === null ? null : { display_name: displayName },
    };
  }

  async function featuredCardLinks(items: ReturnType<typeof listing>[]) {
    fetchPublicListings.mockResolvedValueOnce({ ...browseResponse, items });
    fetchFeaturedFeed.mockResolvedValueOnce(null);
    fetchDataRequests.mockResolvedValueOnce({ items: [] });
    const { default: LandingPage } = await import('./page');
    render(await LandingPage());

    const featured = screen.getByRole('heading', { name: 'Live on the marketplace' }).closest('section')!;
    return within(featured).getAllByRole('heading', { level: 3 }).map(
      (heading) => heading.closest('a')?.getAttribute('href'),
    );
  }

  it('keeps the newest card for each publisher and title pair in response order', async () => {
    const newest = { ...listing('newest', 'Publisher A', 'Sales'), published_at: '2026-11-26T00:00:00Z' };
    const items = [
      newest,
      listing('other-publisher', 'Publisher B', 'Sales'),
      { ...newest, id: 'older', slug: 'older', published_at: '2026-11-19T00:00:00Z' },
      { ...listing('other-title', 'Publisher A', 'Returns'), published_at: '2026-11-18T00:00:00Z' },
    ];

    expect(await featuredCardLinks(items)).toEqual([
      '/listings/newest', '/listings/other-publisher', '/listings/other-title',
    ]);
  });

  it.each([
    { publisher: null, title: 'Sales' },
    { publisher: '', title: 'Sales' },
    { publisher: ' ', title: 'Sales' },
    { publisher: 'Publisher A', title: '' },
    { publisher: 'Publisher A', title: ' ' },
  ])('keeps both cards when the pair is incomplete (%j)', async ({ publisher, title }) => {
    expect(await featuredCardLinks([listing('first', publisher, title), listing('second', publisher, title)]))
      .toEqual(['/listings/first', '/listings/second']);
  });

  it('leaves out the held-back APEX pair and shows at most four cards', async () => {
    const items = [
      listing('a4d5cff6-fb1c-4906-8450-e719a5048b13', 'APEX ENTERPRISE', 'APEX Enterprise'),
      listing('801f3189-ba34-4397-be11-c02c9952c731', 'APEX ENTERPRISE', 'APEX Enterprise (team)'),
      ...['one', 'two', 'three', 'four', 'five'].map((slug) => listing(slug, 'Publisher A', `Dataset ${slug}`)),
    ];

    expect(await featuredCardLinks(items)).toEqual([
      '/listings/one', '/listings/two', '/listings/three', '/listings/four',
    ]);
  });

  it('keeps distinct pairs that would collide when joined with a delimiter', async () => {
    expect(await featuredCardLinks([listing('first', 'A:B', 'C'), listing('second', 'A', 'B:C')]))
      .toEqual(['/listings/first', '/listings/second']);
  });

  it('requests newest data listings and leaves unlabelled public source references off the homepage', async () => {
    const listing = {
      ...browseResponse.items[0], slug: 'synthetic-reference', title: 'Synthetic public source dataset',
      fulfillment_type: 'reference', price: 0,
    };
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url, 'https://example.test').searchParams;
      const items = params.getAll('fulfillment_type').includes(listing.fulfillment_type) ? [listing] : [];
      return Response.json({ ...browseResponse, items });
    });
    const api = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    fetchPublicListings.mockImplementationOnce(api.fetchPublicListings);
    fetchFeaturedFeed.mockResolvedValue(null);
    fetchDataRequests.mockResolvedValue({ items: [] });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { default: LandingPage } = await import('./page');
      render(await LandingPage());
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(
        /\/api\/v1\/public\/listings\?per_page=12&sort=newest&fulfillment_type=ai_queryable&fulfillment_type=file_download&fulfillment_type=reference$/,
      ), { cache: 'no-store' });
      expect(screen.queryByRole('heading', { name: listing.title })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

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
      expect(card.getAttribute('data-prefetch')).toBe('false');
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
  expect(nonCustodial.getByRole('heading', { level: 3, name: "Your listing is marketing you don't pay for." })).toBeTruthy();
  expect(nonCustodial.getByText('Data stays on your infrastructure.')).toBeTruthy();
  expect(nonCustodial.getByText('Direct buyer downloads.')).toBeTruthy();
  expect(nonCustodial.getByText('Found in AI search.')).toBeTruthy();

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

  expect(screen.queryByRole('heading', { name: 'Two ways to participate' })).toBeNull();
});

describe('homepage hero and descriptions', () => {
  const summary = 'Businesses buy and sell data on ai.market. Sellers keep their data in storage they control. Buyers download purchased files directly from the seller.';

  beforeEach(() => {
    fetchPublicListings.mockResolvedValue({ items: [] });
    fetchFeaturedFeed.mockResolvedValue(null);
    fetchDataRequests.mockResolvedValue({ items: [] });
  });

  it('renders the homepage hero copy and marketplace structured data', async () => {
    const { default: LandingPage } = await import('./page');
    const { container } = render(await LandingPage());
    const hero = within(screen.getByRole('heading', { level: 1 }).closest('section')!);

    expect(hero.getByText('Data marketplace for businesses')).toBeTruthy();
    expect(hero.getByRole('heading', { level: 1, name: 'SEO for data.' }).textContent).toBe('SEO for data.');
    expect(hero.getByText('Where AI search finds data.')).toBeTruthy();
    expect(hero.getByText('Free to list; 5% only when it sells.')).toBeTruthy();
    expect(hero.queryByText('Found in AI search.')).toBeNull();
    const sellers = within(screen.getByRole('heading', { name: 'How non-custodial actually works' }).closest('section')!);
    expect(sellers.getByText('Your listings are published in formats AI agents and AI search can read, so buyers can find you.')).toBeTruthy();
    expect(sellers.getByText("Listings are open to AI search and agents. A buyer's agent can find data and start a purchase; the buyer confirms and pays in the browser.")).toBeTruthy();

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

  it('uses the homepage hero messaging for search and social metadata', async () => {
    const { metadata } = await import('./page');
    const title = 'ai.market — SEO for data';
    const description = 'Where AI search finds data. Free to list; 5% only when it sells.';

    expect(metadata.description).toBe(description);
    expect(metadata.openGraph?.description).toBe(description);
    expect(metadata.twitter?.description).toBe(description);
    expect(metadata.title).toEqual({ absolute: title });
    expect(metadata.openGraph?.title).toBe(title);
    expect(metadata.twitter?.title).toBe(title);
    expect(metadata.alternates?.canonical).toBe('/');
  });

  it('keeps search, buyer requests, and seller information at their existing destinations', async () => {
    const { default: LandingPage } = await import('./page');
    render(await LandingPage());
    const hero = within(screen.getByRole('heading', { level: 1 }).closest('section')!);

    const search = hero.getByRole('searchbox');
    expect(search.getAttribute('placeholder')).toBe('Search datasets by topic, industry, or use case');
    fireEvent.change(search, { target: { value: '  US retail sales  ' } });
    fireEvent.click(hero.getByRole('button', { name: 'Search' }));
    expect(push).toHaveBeenLastCalledWith('/find-data?q=US%20retail%20sales');
    expect(hero.getByRole('link', { name: 'Browse Data' }).getAttribute('href')).toBe('/listings');
    expect(hero.getByRole('link', { name: 'Post a Request' }).getAttribute('href')).toBe('/requests');
    expect(screen.getByRole('link', { name: 'Post a Buyer Request' }).getAttribute('href')).toBe('/requests/new');
    expect(screen.getByRole('link', { name: 'Be the first to publish.' }).getAttribute('href')).toBe('/sell-data');
  });
});

describe('homepage block order', () => {
  it('shows listings and buyer demand before the seller story and the steps', async () => {
    fetchPublicListings.mockResolvedValue({ items: [] });
    fetchFeaturedFeed.mockResolvedValue(null);
    fetchDataRequests.mockResolvedValue({ items: [request('1'), request('2'), request('3')] });
    const { default: LandingPage } = await import('./page');

    const html = renderToStaticMarkup(await LandingPage());
    const order = [
      'SEO', 'Browse Data', 'Live on the marketplace', 'Buyer demand, live now',
      'How non-custodial actually works', 'Three steps to get discovered', 'Ready to get started?',
    ].map((text) => html.indexOf(text));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(html).not.toContain('Two ways to participate');
  });
});

describe('homepage featured holdback', () => {
  const held = ['a4d5cff6-fb1c-4906-8450-e719a5048b13', '801f3189-ba34-4397-be11-c02c9952c731'];

  function feedItem(listingId: string, slug: string) {
    return {
      listing_id: listingId, seller_id: 'seller', slug, title: `Feed ${slug}`,
      canonical_url: `https://ai.market/listings/${slug}`, source: 'just_listed', slot: 1,
      placement_id: null, price: { label: 'firm', amount: 10, currency: 'USD', on_request: false },
    };
  }

  beforeEach(() => {
    fetchDataRequests.mockResolvedValue({ items: [] });
  });

  it('keeps held listings out of the activity ticker and its structured data, after the hero', async () => {
    fetchPublicListings.mockResolvedValue({ items: [] });
    fetchFeaturedFeed.mockResolvedValue({
      locale: 'en',
      items: [feedItem(held[0], 'apex-a'), feedItem(held[1], 'apex-b'), feedItem('ordinary', 'ordinary')],
      item_list: { '@type': 'ItemList', itemListElement: [{ url: 'https://ai.market/listings/apex-a' }] },
    });
    const { default: LandingPage } = await import('./page');

    const html = renderToStaticMarkup(await LandingPage());
    expect(html).not.toContain('apex-a');
    expect(html).not.toContain('apex-b');
    expect(html).not.toContain('"ItemList"');
    expect(html).toContain('href="https://ai.market/listings/ordinary"');
    expect(html.indexOf('SEO')).toBeLessThan(html.indexOf('Marketplace activity'));
  });

  it('leaves held-for-reference listings off the homepage', async () => {
    const listing = { ...browseResponse.items[0], slug: 'held-reference', title: 'Held reference', purchase_hold_reason: 'public_source_reference' };
    fetchPublicListings.mockResolvedValue({ ...browseResponse, items: [listing] });
    fetchFeaturedFeed.mockResolvedValue(null);
    const { default: LandingPage } = await import('./page');

    const html = renderToStaticMarkup(await LandingPage());
    expect(html).not.toContain('Held reference');
    expect(html).not.toContain('No listings yet.');
    expect(html).toContain('View All');
  });
});

