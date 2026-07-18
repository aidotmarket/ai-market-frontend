import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchFeaturedFeed, fetchPublicListings, type FeaturedItem, type PaginatedListings } from '@/lib/api';
import { HomepageActivityTickerBeacons } from '@/components/HomepageActivityTickerBeacons';
import { HeroSearch } from '@/components/HeroSearch';

export const metadata: Metadata = {
  title: { absolute: 'ai.market — Sell data without giving it away' },
  description:
    'Non-custodial B2B data marketplace. List with AIM Data, find with semantic search and data requests.',
  openGraph: {
    title: 'ai.market — Sell data without giving it away',
    description:
      'Non-custodial B2B data marketplace. List with AIM Data, find with semantic search and data requests.',
    url: 'https://ai.market',
    siteName: 'ai.market',
    images: ['/og/home.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ai.market — Sell data without giving it away',
    description:
      'Non-custodial B2B data marketplace. List with AIM Data, find with semantic search and data requests.',
    images: ['/og/home.png'],
  },
};

const LANDING_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ai.market',
    url: 'https://ai.market',
    description: 'Non-custodial B2B data marketplace.',
    sameAs: ['https://github.com/maxrobbins'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ai.market',
    url: 'https://ai.market',
    description:
      'The non-custodial B2B data marketplace.',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://ai.market/find-data?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  },
];

const ArrowIcon = ({ className = 'ml-2 h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
);

type Offering = {
  name: string;
  subtitle: string;
  description: string[];
  tags: string[];
  cta: string;
  href: string;
  accent: 'indigo' | 'teal' | 'orange';
  iconPath: string;
};

const offerings: Offering[] = [
  {
    name: 'Find Data',
    subtitle: 'Search the catalog or post a request',
    description: [
      'Every listing is scanned for PII, scored for quality and described in a structure your tools can read. Run a semantic search, or describe what you need and let providers respond.',
    ],
    tags: ['Semantic search', 'Data Requests', 'Live'],
    cta: 'Find Data',
    href: '/find-data',
    accent: 'orange',
    iconPath: 'M12 4.5v15m7.5-7.5h-15',
  },
  {
    name: 'Sell Data',
    subtitle: 'List with AIM Data',
    description: [
      'Install AIM Data on your own infrastructure. It helps you describe what you have, scans for PII and publishes a listing buyers can find. Your raw data stays put.',
    ],
    tags: ['AIM Data', 'Stays on your infra', 'Auto-metadata'],
    cta: 'Sell Data',
    href: '/sell-data',
    accent: 'teal',
    iconPath: 'M4 7v10c0 2 3.5 3 8 3s8-1 8-3V7M4 7c0-2 3.5-3 8-3s8 1 8 3M4 7c0 2 3.5 3 8 3s8-1 8-3m0 5c0 2-3.5 3-8 3s-8-1-8-3',
  },
];

const accentStyles = {
  indigo: {
    icon: 'bg-[#E8EAF6] text-[#3F51B5]',
    tag: 'bg-[#E8EAF6] text-[#3F51B5]',
    btn: 'bg-[#3F51B5] hover:bg-[#3545a0] text-white',
  },
  teal: {
    icon: 'bg-[#E1F5EE] text-[#0F6E56]',
    tag: 'bg-[#E1F5EE] text-[#0F6E56]',
    btn: 'bg-[#0F6E56] hover:bg-[#0c5a47] text-white',
  },
  orange: {
    icon: 'bg-[#FFF0E0] text-[#BF5C00]',
    tag: 'bg-[#FFF0E0] text-[#BF5C00]',
    btn: 'bg-[#BF5C00] hover:bg-[#9f4c00] text-white',
  },
} as const;

const categoryBadge: Record<string, string> = {
  dataset: 'bg-[#E1F5EE] text-[#0F6E56]',
  model: 'bg-[#E8EAF6] text-[#3F51B5]',
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
    title: 'Install AIM Data.',
    description:
      'Python or Docker. Runs locally on your infrastructure.',
  },
  {
    title: 'Publish your listing.',
    description:
      'AIM Data scans for PII, scores quality, and writes the metadata. You review and click publish.',
  },
  {
    title: 'Get paid.',
    description:
      'Buyers find your listing wherever they search, on ai.market or through their AI assistant. Stripe handles the payout.',
  },
];

export default async function LandingPage() {
  const [listingsData, featuredFeed]: [PaginatedListings | null, Awaited<ReturnType<typeof fetchFeaturedFeed>>] =
    await Promise.all([
      fetchPublicListings({
        per_page: 4,
        sort: 'newest',
      }),
      fetchFeaturedFeed(),
    ]);
  const featuredListings = listingsData?.items ?? [];
  const activityItems = featuredFeed?.items ?? [];
  const activityItemList = featuredFeed?.item_list ?? null;

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(LANDING_JSONLD)}</script>
      {activityItemList ? (
        <script type="application/ld+json">{JSON.stringify(activityItemList)}</script>
      ) : null}
      <div className="overflow-hidden">
        <ActivityTicker items={activityItems} locale={featuredFeed?.locale ?? 'en'} />

        {/* HERO */}
        <section className="relative isolate bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left */}
              <div>
                <span className="inline-flex items-center rounded-full bg-[#E1F5EE] px-3 py-1 text-xs font-semibold text-[#0F6E56]">
                  Non-Custodial Protocol
                </span>
                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-5xl lg:text-6xl">
                  Sell data without{' '}
                  <span className="text-[#3F51B5]">giving it away.</span>
                </h1>
                <p className="mt-6 text-lg leading-8 text-[#4A4A4A] max-w-xl">
                  ai.market is a non-custodial B2B marketplace. Your data stays on your
                  infrastructure. Buyers and AI agents find it through search or post a request,
                  and the bytes move peer-to-peer the moment a deal closes.
                </p>
                <HeroSearch />
                <div className="mt-5 rounded-xl border border-[#E8E8E8] bg-[#FAFAFA] p-4">
                  <p className="text-sm leading-6 text-[#4A4A4A]">
                    Buying? Search the catalog or tell us what you need and let providers come to you.
                  </p>
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

              {/* Right - trust visual card */}
              <div className="card-texture rounded-2xl border border-[#E8E8E8] bg-[#FAFAFA] p-8">
                <p className="text-base leading-7 text-[#1A1A1A]">
                  Your datasets become discoverable by AI agents and visible in AI-powered
                  search, so buyers find you, not the other way around.
                </p>
                <div className="my-6 h-px bg-[#E8E8E8]" />
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F6E56]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">Data stays on your infrastructure.</p>
                      <p className="text-sm text-[#666666]">Only metadata is published.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#3F51B5]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">Peer-to-peer transactions.</p>
                      <p className="text-sm text-[#666666]">ai.market never touches payloads.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#14B8A6]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">Found everywhere.</p>
                      <p className="text-sm text-[#666666]">Listings surface in AI search worldwide, and buyers&apos; agents can transact directly.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* HOW NON-CUSTODIAL WORKS */}
        <section className="border-t border-[#E8E8E8] bg-[#FAFAFA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#3F51B5]">How it works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                How non-custodial actually works
              </h2>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3F51B5] text-sm font-bold text-white">1</div>
                <p className="mt-4 text-sm leading-6 text-[#666666]">
                  You list. The data stays put. AIM Data runs on your servers and publishes a description of what you have. We see the description, never the data.
                </p>
              </div>
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3F51B5] text-sm font-bold text-white">2</div>
                <p className="mt-4 text-sm leading-6 text-[#666666]">
                  allAI handles the middle. Questions, negotiation and checkout run through our AI. Buyers get answers fast. You never chase a lead or hand out your contact details.
                </p>
              </div>
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3F51B5] text-sm font-bold text-white">3</div>
                <p className="mt-4 text-sm leading-6 text-[#666666]">
                  Delivery is peer-to-peer. When a deal closes, the bytes move encrypted from your infrastructure straight to the buyer. Stripe moves the money. We deduct 5% from the seller; the buyer pays any payment-provider costs and applicable tax shown at checkout.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* LISTING MARKETING */}
        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
              Your listing is marketing you don&apos;t pay for.
            </h2>
            <div className="mt-6 space-y-5 text-lg leading-8 text-[#4A4A4A]">
              <p>
                Every listing is published in the formats AI assistants and search engines read. Structured metadata, machine-readable manifests, all of it, on every listing, automatically.
              </p>
              <p>
                So when a buyer anywhere in the world asks their AI for data like yours, your listing is built to be the answer. They don&apos;t need to know ai.market exists. They don&apos;t need to visit us. Your data shows up where buyers already ask.
              </p>
              <p>
                Companies pay real money for that kind of reach. Here it comes with the listing. Free.
              </p>
            </div>
          </div>
        </section>

        {/* OFFERINGS */}
        <section className="border-t border-[#E8E8E8] bg-[#FAFAFA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#3F51B5]">Products</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                Two ways to participate
              </h2>
              <p className="mt-3 text-lg text-[#666666]">
                Find data or sell data without moving raw datasets.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
              {offerings.map((o) => {
                const styles = accentStyles[o.accent];
                return (
                  <div
                    key={o.name}
                    className="card-texture rounded-2xl border border-[#E8E8E8] bg-white p-7 flex flex-col"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${styles.icon}`}>
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={o.iconPath} />
                      </svg>
                    </div>
                    <h3 className="mt-5 text-xl font-bold text-[#1A1A1A]">{o.name}</h3>
                    <p className="text-sm font-semibold text-[#666666]">{o.subtitle}</p>
                    <div className="mt-3 space-y-3 text-sm leading-6 text-[#4A4A4A]">
                      {o.description.map((paragraph) => (
                        <p key={paragraph} className={paragraph === 'Private beta. Request access.' ? 'italic' : undefined}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {o.tags.map((t) => (
                        <span key={t} className={`rounded-md px-2.5 py-1 text-xs font-medium ${styles.tag}`}>{t}</span>
                      ))}
                    </div>
                    <div className="flex-1" />
                    <Link
                      href={o.href}
                      className={`mt-7 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${styles.btn}`}
                    >
                      {o.cta}
                      <ArrowIcon />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FEATURED LISTINGS */}
        <section className="bg-white py-20 sm:py-24">
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
                featuredListings.map((l) => (
                  <Link
                    key={l.id}
                    href={`/listings/${l.slug}`}
                    className="card-texture rounded-2xl border border-[#E8E8E8] bg-white p-5 flex flex-col hover:border-[#3F51B5] hover:shadow-sm transition-all"
                  >
                    <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${categoryBadge[l.category] ?? defaultBadge}`}>
                      {l.category}
                    </span>
                    <h3 className="mt-4 text-base font-bold leading-snug text-[#1A1A1A]">{l.title ?? 'Untitled'}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#666666] line-clamp-2">{l.short_description ?? ''}</p>
                    <div className="flex-1" />
                    <div className="mt-5 pt-4 border-t border-[#F0F0F0] flex items-center justify-between text-xs">
                      <span className="text-[#888888]">{l.category}</span>
                      <span className="font-semibold text-[#1A1A1A]">{l.price === 0 ? 'Free' : `$${l.price}`}</span>
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
                  <p className="mt-2 text-sm leading-6 text-[#666666]">{step.description}</p>
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
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0]"
              >
                Create Your Account
              </Link>
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
    </>
  );
}
