import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ai.market — B2B Data Marketplace',
  description:
    'The non-custodial B2B marketplace for AI data, models, and pipelines. We make your assets discoverable by AI — think SEO, but for AI systems.',
};

const LANDING_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ai.market',
    url: 'https://ai.market',
    description: 'Non-custodial B2B marketplace for AI data, models, and pipelines',
    sameAs: ['https://github.com/maxrobbins'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ai.market',
    url: 'https://ai.market',
    description:
      'The non-custodial B2B marketplace for AI data, models, and pipelines.',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://ai.market/listings?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  },
];

const ArrowIcon = ({ className = 'ml-2 h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
);

const DownloadIcon = ({ className = 'ml-2 h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

type Offering = {
  name: string;
  subtitle: string;
  description: string;
  tags: string[];
  cta: string;
  href: string;
  ctaIcon: 'arrow' | 'download';
  accent: 'indigo' | 'teal' | 'orange';
  iconPath: string;
};

const offerings: Offering[] = [
  {
    name: 'AIM-Node',
    subtitle: 'Models & Pipelines',
    description:
      'Serve models and pipelines from your own infrastructure. Buyers call them peer-to-peer — payloads never touch ai.market.',
    tags: ['Models', 'Pipelines', 'P2P Compute'],
    cta: 'Download AIM-Node',
    href: '/download/aim-node',
    ctaIcon: 'download',
    accent: 'indigo',
    iconPath: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z',
  },
  {
    name: 'AIM-Data',
    subtitle: 'Data Management',
    description:
      'List datasets with AI-generated metadata, compliance reports, and Schema.org markup. Data stays on your infra.',
    tags: ['Datasets', 'Auto-Enrichment', 'Schema.org'],
    cta: 'Download AIM-Data',
    href: '/download/aim-data',
    ctaIcon: 'download',
    accent: 'teal',
    iconPath: 'M4 7v10c0 2 3.5 3 8 3s8-1 8-3V7M4 7c0-2 3.5-3 8-3s8 1 8 3M4 7c0 2 3.5 3 8 3s8-1 8-3m0 5c0 2-3.5 3-8 3s-8-1-8-3',
  },
  {
    name: 'I Need Data / Models',
    subtitle: 'Post Requirements',
    description:
      'Describe what you need. Providers bid with matching datasets, models, and pipelines. Budget-controlled, outcome-driven.',
    tags: ['Requests', 'Matching', 'Budget Control'],
    cta: 'Post a Request',
    href: '/requests',
    ctaIcon: 'arrow',
    accent: 'orange',
    iconPath: 'M12 4.5v15m7.5-7.5h-15',
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

type Listing = {
  type: 'Dataset' | 'Model' | 'Request';
  title: string;
  description: string;
  meta: string;
  price: string;
};

const listings: Listing[] = [
  {
    type: 'Dataset',
    title: 'US Real Estate Transactions 2020–2025',
    description: '42M property transactions with sale prices, geo-coordinates, and attributes.',
    meta: 'Updated 2d ago',
    price: '$0.08/record',
  },
  {
    type: 'Dataset',
    title: 'Global Supply Chain Disruption Signals',
    description: 'Real-time shipping delays, port congestion, and commodity price feeds.',
    meta: 'Updated 6h ago',
    price: '$2,400/mo',
  },
  {
    type: 'Model',
    title: 'Medical NER v3 — Clinical Entity Extraction',
    description: 'Fine-tuned biomedical NER. HIPAA-compliant, runs on your infra via AIM-Node.',
    meta: 'AIM-Node',
    price: '$0.002/call',
  },
  {
    type: 'Request',
    title: 'European SME Financial Benchmarks',
    description: 'Looking for revenue, headcount & growth metrics for EU SMEs by sector.',
    meta: '3 offers',
    price: 'Budget: $5k',
  },
];

const typeBadge = {
  Dataset: 'bg-[#E1F5EE] text-[#0F6E56]',
  Model: 'bg-[#E8EAF6] text-[#3F51B5]',
  Request: 'bg-[#FFF0E0] text-[#BF5C00]',
} as const;

const howItWorks = [
  {
    title: 'Install',
    description:
      'Download AIM-Node or AIM-Data and connect to your private infrastructure.',
  },
  {
    title: 'Enrich & Index',
    description:
      'AI auto-generates metadata, tags, compliance reports, and Schema.org markup.',
  },
  {
    title: 'Publish',
    description:
      'One-click publish. Your listing becomes discoverable by AI agents and search.',
  },
  {
    title: 'Earn',
    description:
      'AI agents discover and transact with your assets. Stripe-powered instant payouts.',
  },
];

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(LANDING_JSONLD)}</script>
      <div className="overflow-hidden">
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
                  Your data never touches{' '}
                  <span className="text-[#3F51B5]">the market.</span>
                </h1>
                <p className="mt-6 text-lg leading-8 text-[#4A4A4A] max-w-xl">
                  The non-custodial B2B marketplace for AI data, models, and pipelines. We make
                  your assets discoverable by AI — think SEO, but for AI systems.
                </p>
                <div className="mt-8">
                  <Link
                    href="/listings"
                    className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-6 py-3 text-sm font-semibold text-white hover:bg-[#3545a0] transition-colors"
                  >
                    Explore Marketplace
                    <ArrowIcon />
                  </Link>
                </div>
              </div>

              {/* Right — trust visual card */}
              <div className="card-texture rounded-2xl border border-[#E8E8E8] bg-[#FAFAFA] p-8">
                <p className="text-base leading-7 text-[#1A1A1A]">
                  Your data, models & pipelines become discoverable by AI agents and visible in
                  AI-powered search — so buyers find you, not the other way around.
                </p>
                <div className="my-6 h-px bg-[#E8E8E8]" />
                <ul className="space-y-5">
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F6E56]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">
                        Data stays on your infra
                      </p>
                      <p className="text-sm text-[#666666]">Only metadata is published</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#3F51B5]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">
                        Peer-to-peer transactions
                      </p>
                      <p className="text-sm text-[#666666]">ai.market never touches payloads</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#14B8A6]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">Agentic First</p>
                      <p className="text-sm text-[#666666]">
                        AI Agents can process transactions directly
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* THREE OFFERINGS */}
        <section className="border-t border-[#E8E8E8] bg-[#FAFAFA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#3F51B5]">Products</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                Three ways to participate
              </h2>
              <p className="mt-3 text-lg text-[#666666]">
                List assets, find data, or run compute — all non-custodial, all AI-discoverable.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
              {offerings.map((o) => {
                const styles = accentStyles[o.accent];
                return (
                  <div
                    key={o.name}
                    className="card-texture rounded-2xl border border-[#E8E8E8] bg-white p-7 flex flex-col"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${styles.icon}`}
                    >
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.75}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={o.iconPath} />
                      </svg>
                    </div>
                    <h3 className="mt-5 text-xl font-bold text-[#1A1A1A]">{o.name}</h3>
                    <p className="text-sm font-semibold text-[#666666]">{o.subtitle}</p>
                    <p className="mt-3 text-sm leading-6 text-[#4A4A4A]">{o.description}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {o.tags.map((t) => (
                        <span
                          key={t}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${styles.tag}`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="flex-1" />
                    <Link
                      href={o.href}
                      className={`mt-7 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${styles.btn}`}
                    >
                      {o.cta}
                      {o.ctaIcon === 'arrow' ? <ArrowIcon /> : <DownloadIcon />}
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
                <p className="text-xs font-bold uppercase tracking-wider text-[#3F51B5]">
                  Featured
                </p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                  Live on the marketplace
                </h2>
              </div>
              <Link
                href="/listings"
                className="text-sm font-semibold text-[#3F51B5] hover:text-[#3545a0]"
              >
                View All →
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {listings.map((l) => (
                <div
                  key={l.title}
                  className="card-texture rounded-2xl border border-[#E8E8E8] bg-white p-5 flex flex-col"
                >
                  <span
                    className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${typeBadge[l.type]}`}
                  >
                    {l.type}
                  </span>
                  <h3 className="mt-4 text-base font-bold leading-snug text-[#1A1A1A]">
                    {l.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#666666]">{l.description}</p>
                  <div className="flex-1" />
                  <div className="mt-5 pt-4 border-t border-[#F0F0F0] flex items-center justify-between text-xs">
                    <span className="text-[#888888]">{l.meta}</span>
                    <span className="font-semibold text-[#1A1A1A]">{l.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-t border-[#E8E8E8] bg-[#FAFAFA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#3F51B5]">
                How it works
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
                Four steps from install to earn
              </h2>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {howItWorks.map((step, idx) => (
                <div key={step.title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3F51B5] text-white text-sm font-bold">
                    {idx + 1}
                  </div>
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
              Ready to get discovered?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[#666666]">
              Join the non-custodial marketplace where AI agents discover and transact with your
              data, models, and pipelines.
            </p>
            <div className="mt-10">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-8 py-3.5 text-sm font-semibold text-white hover:bg-[#3545a0] transition-colors"
              >
                Create Your Account
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
