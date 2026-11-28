import { plainTextExcerpt } from '@/lib/plainTextExcerpt';
import { formatMarketplaceCategoryName } from '@/lib/marketplaceCategories';
import GeneratedSampleCard from '@/components/listings/GeneratedSampleCard';
import { generatedSampleState } from '@/lib/generatedSample';
import { formatPrice } from '@/lib/format';
import Link from 'next/link';
import SellDataCta from '@/components/SellDataCta';
import { getPublicTermsVersion } from '@/lib/publicTermsVersion';
import VersionedTermsCopy, { TermsVersionProvider } from '@/components/legal/VersionedTermsCopy';
import { CARD_HOME_FEES, CARD_HOME_PAYOUT } from '@/components/legal/terms12Copy';
import type { Metadata } from 'next';
import {
  fetchDataRequests,
  fetchFeaturedFeed,
  fetchPublicListings,
  type FeaturedItem,
  type PaginatedListings,
} from '@/lib/api';
import { HomepageActivityTickerBeacons } from '@/components/HomepageActivityTickerBeacons';
import { HeroSearch } from '@/components/HeroSearch';
import type { DataRequestListItem } from '@/types';

const marketplaceSummary =
  'Businesses buy and sell data on ai.market. Sellers keep their data in storage they control. Buyers download purchased files directly from the seller.';
const homepageTitle = 'ai.market — SEO for data';
const heroSubhead = 'Where AI search finds data.';
const heroFee = 'Free to list; 5% only when it sells.';
const homepageDescription = `${heroSubhead} ${heroFee}`;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  title: { absolute: homepageTitle },
  description: homepageDescription,
  openGraph: {
    title: homepageTitle,
    description: homepageDescription,
    url: 'https://ai.market',
    siteName: 'ai.market',
    images: ['/og/home.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: homepageTitle,
    description: homepageDescription,
    images: ['/og/home.png'],
  },
};

const LANDING_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ai.market',
    url: 'https://ai.market',
    description: marketplaceSummary,
    sameAs: ['https://github.com/maxrobbins'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ai.market',
    url: 'https://ai.market',
    description: marketplaceSummary,
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://ai.market/find-data?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  },
];

const FEATURED_CARDS = 4;
// Over-fetch so exclusions and duplicate removal still leave a full row.
const FEATURED_CANDIDATES = 12;
// Held back from the homepage until Mars clears them (T-2026-001227 duplicate pair).
const FEATURED_EXCLUDED_LISTING_IDS = new Set([
  'a4d5cff6-fb1c-4906-8450-e719a5048b13',
  '801f3189-ba34-4397-be11-c02c9952c731',
]);

const categoryBadge: Record<string, string> = {
  dataset: 'bg-[#E1F5EE] text-[#0F6E56]',
};

const defaultBadge = 'bg-[#F0F0F0] text-[#666666]';

const activitySourceLabel: Record<FeaturedItem['source'], string> = {
  curated: 'Featured',
  just_listed: 'Just listed',
  recently_sold: 'Recently sold',
  trending: 'Trending',
  cold_start: 'Featured',
};

function interleaveFeaturedItems(items: FeaturedItem[]) {
  const justListed = items.filter((item) => item.source === 'just_listed');
  const recentlySold = items.filter((item) => item.source === 'recently_sold');
  const rest = items.filter((item) => item.source !== 'just_listed' && item.source !== 'recently_sold');
  const ordered: FeaturedItem[] = [];
  const maxLength = Math.max(justListed.length, recentlySold.length, rest.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (justListed[index]) ordered.push(justListed[index]);
    if (recentlySold[index]) ordered.push(recentlySold[index]);
    if (rest[index]) ordered.push(rest[index]);
  }

  return ordered;
}

function formatFeaturedPrice(item: FeaturedItem) {
  const label = item.price.label;
  const semanticLabel = label.toLowerCase();
  const amount = item.price.amount;
  const currency = item.price.currency ?? 'USD';
  const amountLabel = amount == null
    ? null
    : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  if (item.price.on_request || semanticLabel === 'on_request') return 'On request';
  if (semanticLabel === 'from') return amountLabel ? `from ${amountLabel}` : 'from price';
  if (semanticLabel === 'firm') return amountLabel ?? 'Price listed';

  return label;
}

function metricEndpoint(path: string) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '';
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function ActivityTicker({ items, locale }: { items: FeaturedItem[]; locale: string }) {
  if (items.length === 0) return null;

  const tickerItems = interleaveFeaturedItems(items);
  const repeatedItems = tickerItems.length > 1 ? [...tickerItems, ...tickerItems] : tickerItems;

  return (
    <section
      className="homepage-activity-strip min-h-[92px] border-b border-[#E8E8E8] bg-[#FAFAFA]"
      aria-labelledby="homepage-activity-heading"
    >
      <h2 id="homepage-activity-heading" className="sr-only">
        Marketplace activity
      </h2>
      <div className="mx-auto flex min-h-[92px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <p className="hidden shrink-0 text-xs font-bold uppercase tracking-wider text-[#3F51B5] sm:block">
          Marketplace activity
        </p>
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <ul className={`${tickerItems.length > 1 ? 'homepage-activity-marquee' : ''} flex w-max items-center gap-3 py-3 ${tickerItems.length > 1 ? '' : 'md:w-full'}`}>
            {repeatedItems.map((item, index) => {
              const isDuplicate = index >= tickerItems.length;
              const isSold = item.source === 'recently_sold';

              return (
                <li
                  key={`${item.listing_id}-${index}`}
                  className={isDuplicate ? 'homepage-activity-duplicate' : undefined}
                  aria-hidden={isDuplicate}
                >
                  <a
                    href={item.canonical_url}
                    data-featured-listing-id={item.listing_id}
                    data-featured-slot={item.slot}
                    data-featured-placement-id={item.placement_id ?? undefined}
                    className="group flex h-14 min-w-[280px] max-w-[360px] items-center gap-3 rounded-lg border border-[#E8E8E8] bg-white px-4 text-left shadow-sm transition-colors hover:border-[#3F51B5] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2 sm:min-w-[340px]"
                  >
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                        isSold ? 'bg-[#E1F5EE] text-[#0F6E56]' : 'bg-[#E8EAF6] text-[#3F51B5]'
                      }`}
                    >
                      {activitySourceLabel[item.source]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#1A1A1A] group-hover:text-[#303F9F]">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-[#666666]">{formatFeaturedPrice(item)}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <HomepageActivityTickerBeacons
        items={tickerItems.map((item) => ({
          listingId: item.listing_id,
          slot: item.slot,
          placementId: item.placement_id,
        }))}
        locale={locale}
        impressionEndpoint={metricEndpoint('/featured-listings/impressions')}
        clickEndpointBase={metricEndpoint('/featured-listings')}
      />
    </section>
  );
}

const howItWorks = [
  {
    title: 'Connect your data.',
    description:
      'Connect your AWS S3 or Cloudflare R2 bucket with a read-only key. If your data has to stay on your own servers, run our open-source AIM Data gateway instead.',
  },
  {
    title: 'Let allAI build your listing.',
    description:
      'allAI drafts the description from your file names and your notes. You check it, set the price and license, and publish.',
    extra: <>Prefer your own AI? <Link href="/docs/claude" className="text-[#3F51B5] hover:underline">Connect</Link> Claude or ChatGPT and list from the chat.</>,
  },
  {
    title: 'Get paid.',
    description:
      'Buyers find your listing wherever they search, on ai.market or through their own AI assistant. Stripe pays you 48 hours after the buyer confirms delivery. Sellers paid internationally in USDC on Solana are paid at least 30 days after the buyer confirms delivery.',
  },
];

export default async function LandingPage() {
  const termsVersion = await getPublicTermsVersion();
  const [listingsData, featuredFeed, requestData]: [
    PaginatedListings | null,
    Awaited<ReturnType<typeof fetchFeaturedFeed>>,
    Awaited<ReturnType<typeof fetchDataRequests>>,
  ] =
    await Promise.all([
      fetchPublicListings({
        per_page: FEATURED_CANDIDATES,
        sort: 'newest',
      }),
      fetchFeaturedFeed(),
      fetchDataRequests({ per_page: 3 }).catch(() => null),
    ]);
  const seenFeaturedPairs = new Set<string>();
  const featuredListings = (listingsData?.items ?? []).filter((listing) => {
    if (FEATURED_EXCLUDED_LISTING_IDS.has(listing.id)) return false;
    // Public-source references have no label on this card; the catalog shows them.
    if (listing.fulfillment_type === 'reference' || listing.purchase_hold_reason === 'public_source_reference') return false;
    const { publisher, title } = listing;
    const displayName = publisher?.display_name;
    if (!displayName?.trim() || !title?.trim()) return true;

    const pair = JSON.stringify([displayName, title]);
    if (seenFeaturedPairs.has(pair)) return false;
    seenFeaturedPairs.add(pair);
    return true;
  }).slice(0, FEATURED_CARDS);
  const activityItems = featuredFeed?.items ?? [];
  const activityItemList = featuredFeed?.item_list ?? null;
  const buyerRequests: DataRequestListItem[] = Array.isArray(requestData)
    ? requestData
    : requestData?.items ?? [];
  const showLiveDemand = buyerRequests.length >= 3;

  return (
    <TermsVersionProvider initialVersion={termsVersion}>
      <script type="application/ld+json">{JSON.stringify(LANDING_JSONLD)}</script>
      {activityItemList ? (
        <script type="application/ld+json">{JSON.stringify(activityItemList)}</script>
      ) : null}
      <div className="overflow-hidden">
        <ActivityTicker items={activityItems} locale={featuredFeed?.locale ?? 'en'} />

        {/* HERO */}
        <section className="relative isolate bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
            <div className="max-w-3xl">
              <div>
                <span className="inline-flex items-center rounded-full bg-[#E1F5EE] px-3 py-1 text-xs font-semibold text-[#0F6E56]">
                  Data marketplace for businesses
                </span>
                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-5xl lg:text-6xl">
                  SEO{' '}
                  <span className="text-[#3F51B5]">for data.</span>
                </h1>
                <p className="mt-6 text-lg leading-8 text-[#4A4A4A] max-w-xl">
                  {heroSubhead}
                </p>
                <p className="mt-3 max-w-xl text-sm font-semibold text-[#0F6E56]">
                  {heroFee}
                </p>
                <HeroSearch />
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/listings"
                    className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0]"
                  >
                    Browse Data
                  </Link>
                  <Link
                    href="/requests"
                    className="inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-4 py-2.5 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6]"
                  >
                    Post a Request
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURED LISTINGS */}
        <section className="border-t border-[#E8E8E8] bg-white pt-20 pb-10 sm:pt-24 sm:pb-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#3F51B5]">Featured</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                  Live on the marketplace
                </h2>
              </div>
              <Link href="/listings" className="text-sm font-semibold text-[#3F51B5] hover:text-[#3545a0]">View All →</Link>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featuredListings.length > 0 ? (
                featuredListings.map((l) => generatedSampleState(l) !== 'ordinary' ? (
                  <GeneratedSampleCard key={l.id} listing={l} />
                ) : (
                  <Link
                    key={l.id}
                    href={`/listings/${l.slug}`}
                    prefetch={false}
                    className="card-texture rounded-2xl border border-[#E8E8E8] bg-white p-5 flex flex-col hover:border-[#3F51B5] hover:shadow-sm transition-all"
                  >
                    <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${categoryBadge[l.category] ?? defaultBadge}`}>
                      {formatMarketplaceCategoryName(l.category)}
                    </span>
                    <h3 className="mt-4 text-base font-bold leading-snug text-[#1A1A1A]">{l.title ?? 'Untitled'}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#666666] line-clamp-2">
                      {'summary' in l ? l.summary ?? '' : l.short_description ?? ''}
                    </p>
                    <div className="flex-1" />
                    <div className="mt-5 pt-4 border-t border-[#F0F0F0] flex items-center justify-between text-xs">
                      <span className="text-[#888888]">{formatMarketplaceCategoryName(l.category)}</span>
                      {l.price != null && (
                        <span className="font-semibold text-[#1A1A1A]">
                          {l.price === 0 ? 'Free' : formatPrice(l.price, { omitTrailingZeros: true })}
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              ) : (
                <p className="col-span-full text-center text-sm text-[#888888]">
                  No listings yet.{' '}
                  <Link href="/sell-data" className="font-semibold text-[#3F51B5] hover:text-[#3545a0]">
                    Be the first to publish.
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* BUYER REQUESTS */}
        <section className="bg-white pt-10 pb-20 sm:pt-12 sm:pb-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {showLiveDemand ? (
              <>
                <div className="flex items-end justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#0F6E56]">Buyer Requests</p>
                    <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                      Buyer demand, live now
                    </h2>
                    <p className="mt-3 text-lg text-[#666666]">
                      See what email-verified buyers need and respond with a relevant listing.
                    </p>
                  </div>
                  <Link href="/requests" className="text-sm font-semibold text-[#3F51B5] hover:text-[#3545a0]">
                    View All Buyer Requests →
                  </Link>
                </div>
                <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
                  {buyerRequests.slice(0, 3).map((request) => (
                    <Link
                      key={request.id}
                      href={`/requests/${request.slug}`}
                      className="rounded-2xl border border-[#E8E8E8] bg-white p-6 transition-all hover:border-[#3F51B5] hover:shadow-sm"
                    >
                      <div className="flex flex-wrap gap-2">
                        {request.categories.slice(0, 3).map((category) => (
                          <span key={category} className="rounded-md bg-[#E1F5EE] px-2 py-1 text-xs font-medium text-[#0F6E56]">
                            {category}
                          </span>
                        ))}
                      </div>
                      <h3 className="mt-4 text-lg font-bold leading-snug text-[#1A1A1A]">
                        {plainTextExcerpt(request.title) || 'Buyer data request'}
                      </h3>
                      {request.is_sample === true && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 shrink-0">
                          (SAMPLE)
                        </span>
                      )}
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#666666]">
                        {plainTextExcerpt(request.description)}
                      </p>
                      <p className="mt-5 text-sm font-semibold text-[#3F51B5]">Review request →</p>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0F6E56]">Buyer Requests</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                  Tell the market what data you need
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-[#666666]">
                  Publish a requirement once. Relevant sellers can find it and respond with matching data.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    href="/requests/new"
                    className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-6 py-3 text-sm font-semibold text-white hover:bg-[#3545a0]"
                  >
                    Post a Buyer Request
                  </Link>
                  <Link
                    href="/requests"
                    className="inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-6 py-3 text-sm font-semibold text-[#3F51B5] hover:bg-[#E8EAF6]"
                  >
                    Browse Buyer Requests
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SELLERS: benefits, non-custodial delivery, listing marketing */}
        <section className="border-t border-[#E8E8E8] bg-[#FAFAFA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#0F6E56]">Sell Data</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                  How non-custodial actually works
                </h2>
                <div className="mt-8">
                  <p className="text-sm leading-6 text-[#666666]">
                    allAI does the work, your files never leave your storage, and you get paid.
                  </p>
                  <p className="mt-4 text-sm leading-6 text-[#666666]">
                    <VersionedTermsCopy legacy="We deduct 5% from the seller; the buyer pays any payment-provider costs and applicable tax shown at checkout." terms12={CARD_HOME_FEES} />
                  </p>
                </div>
                <h3 className="mt-10 text-xl font-bold text-[#1A1A1A]">
                  Your listing is marketing you don&apos;t pay for.
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#4A4A4A]">
                  Every listing is published in the formats AI assistants and search engines read. Structured metadata, machine-readable manifests, all of it, on every listing, automatically.
                </p>
                <p className="mt-3 text-sm leading-6 text-[#4A4A4A]">
                  Companies pay real money for that kind of reach. Here it comes with the listing. Free.
                </p>
              </div>
              <div className="card-texture rounded-2xl bg-white border border-[#E8E8E8] p-8">
                <p className="text-base leading-7 text-[#1A1A1A]">
                  Your listings are published in formats AI agents and AI search can read, so buyers can find you.
                </p>
                <div className="my-6 h-px bg-[#E8E8E8]" />
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F6E56]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">Data stays on your infrastructure.</p>
                      <p className="text-sm text-[#666666]">You can separately choose to publish a public sample.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#3F51B5]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">Direct buyer downloads.</p>
                      <p className="text-sm text-[#666666]">Purchased files go straight from the seller to the buyer.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#14B8A6]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">Found in AI search.</p>
                      <p className="text-sm text-[#666666]">
                        Listings are open to AI search and agents. A buyer&apos;s agent can find data and start a purchase;
                        the buyer confirms and pays in the browser.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-t border-[#E8E8E8] bg-[#FAFAFA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#3F51B5]">How it works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                Three steps to get discovered
              </h2>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3 lg:grid-cols-3">
              {howItWorks.map((step, idx) => (
                <div key={step.title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3F51B5] text-white text-sm font-bold">{idx + 1}</div>
                  <h3 className="mt-4 text-lg font-bold text-[#1A1A1A]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#666666]"><VersionedTermsCopy legacy={step.description} terms12={step.title === 'Get paid.' ? CARD_HOME_PAYOUT : step.description} /></p>
                  {step.extra && <p className="mt-2 text-sm leading-6 text-[#666666]">{step.extra}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
              Ready to get started?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[#666666]">
              Buyers search free. No account needed to look. Sellers list free and pay nothing until a sale clears.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <Link
                href="/find-data"
                className="inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-8 py-3.5 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6]"
              >
                Find Data
              </Link>
              <SellDataCta variant="homepage" />
            </div>
          </div>
        </section>

        {/* CROSS-LINKS */}
        <section className="border-t border-[#E8E8E8] bg-[#FAFAFA] py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm leading-6 text-[#666666]">
              Looking for something else? Check our{' '}
              <Link href="/partner" className="font-semibold text-[#3F51B5] hover:text-[#3545a0]">
                Partner Program
              </Link>
              , read{' '}
              <Link href="/protocol" className="font-semibold text-[#3F51B5] hover:text-[#3545a0]">
                The Protocol
              </Link>
              , or browse the{' '}
              <Link href="/blog" className="font-semibold text-[#3F51B5] hover:text-[#3545a0]">
                Blog
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </TermsVersionProvider>
  );
}
