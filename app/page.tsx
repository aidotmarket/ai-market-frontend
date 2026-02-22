import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ai.market — B2B Data Marketplace',
  description:
    'The marketplace where enterprise datasets become findable, queryable, and purchasable by AI systems. Think SEO — but for your data.',
};

const steps = [
  {
    number: '01',
    title: 'Process & Enrich',
    description:
      'Upload data to vectorAIz. AI automatically profiles, tags, and generates rich metadata for discoverability.',
    iconPath:
      'M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 0 1-1.59.659H9.06a2.25 2.25 0 0 1-1.591-.659L5 14.5m14 0-1.543-4.117A2.25 2.25 0 0 0 15.349 8.75H8.651a2.25 2.25 0 0 0-2.108 1.633L5 14.5',
  },
  {
    number: '02',
    title: 'Publish to Marketplace',
    description:
      'One-click publish with AI-optimized listing. Schema.org JSON-LD makes your data machine-readable instantly.',
    iconPath:
      'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.73-3.56',
  },
  {
    number: '03',
    title: 'Get Discovered by AI',
    description:
      'AI agents find, query, and purchase your data programmatically. You earn on every transaction.',
    iconPath: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  },
];

const valueProps = [
  {
    title: 'Privacy First',
    description: 'Data never leaves your infrastructure. Only metadata is shared on the marketplace.',
    iconPath:
      'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
  },
  {
    title: 'AI-Native Discovery',
    description: 'Schema.org + vector embeddings make your data findable by any AI system.',
    iconPath: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
  },
  {
    title: 'Automated Enrichment',
    description: 'AI generates titles, descriptions, tags, and compliance reports automatically.',
    iconPath:
      'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z',
  },
  {
    title: 'Non-Custodial',
    description: 'You host the data. We facilitate the transaction. 15% commission, no lock-in.',
    iconPath:
      'M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0 0 20.25 9.35m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72',
  },
  {
    title: 'Enterprise Grade',
    description: 'GDPR, CCPA, HIPAA compliance checks built into every listing automatically.',
    iconPath:
      'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z',
  },
  {
    title: 'Instant Payments',
    description: 'Stripe-powered payouts for every transaction. No invoicing, no delays.',
    iconPath:
      'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z',
  },
];

const stats = [
  { value: '2,400+', label: 'Datasets Listed' },
  { value: '180', label: 'Categories' },
  { value: '50+', label: 'AI Integrations' },
];

const LANDING_JSONLD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ai.market",
    "url": "https://ai.market",
    "description": "B2B Data Marketplace — Making enterprise data discoverable by AI systems",
    "sameAs": ["https://github.com/maxrobbins"]
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "ai.market",
    "url": "https://ai.market",
    "description": "The marketplace where enterprise datasets become findable, queryable, and purchasable by AI systems.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://ai.market/listings?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
];

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(LANDING_JSONLD) }}
      />
      <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative isolate">
        {/* Background grid pattern */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <svg
            className="absolute top-0 left-1/2 -translate-x-1/2 min-w-[64rem] opacity-[0.03]"
            width="1024"
            height="1024"
            aria-hidden="true"
          >
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M0 32V0h32" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
          {/* Gradient orbs */}
          <div className="absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-blue-100 opacity-40 blur-3xl" />
          <div className="absolute top-20 -left-20 h-[20rem] w-[20rem] rounded-full bg-indigo-100 opacity-30 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-32 sm:pb-32">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-wide text-blue-600 uppercase">
              The B2B Data Marketplace
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              Make Your Data{' '}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Discoverable by AI
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl">
              The marketplace where enterprise datasets become findable, queryable, and purchasable
              by AI systems. Think SEO — but for your data.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/listings"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Browse Marketplace
                <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Start Selling
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-gray-100 bg-gray-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold tracking-wide text-blue-600 uppercase">How It Works</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Three steps to monetize your data
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={step.iconPath} />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-400">{step.number}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold tracking-wide text-blue-600 uppercase">Why ai.market</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Built for the AI-first data economy
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {valueProps.map((prop) => (
              <div
                key={prop.title}
                className="group rounded-xl border border-gray-200 p-6 transition-all hover:border-blue-200 hover:shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={prop.iconPath} />
                  </svg>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-gray-900">{prop.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{prop.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats / Social Proof */}
      <section className="border-t border-gray-100 bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-bold tracking-tight text-gray-900">{stat.value}</p>
                <p className="mt-1 text-sm text-gray-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Ready to monetize your data?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            Join the marketplace where AI agents discover and purchase enterprise data.
            Get started in minutes.
          </p>
          <div className="mt-10">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Create Your Account
              <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
    </>
  );
}
