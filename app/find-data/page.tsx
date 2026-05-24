import Link from 'next/link';
import type { Metadata } from 'next';
import { MarketplaceSearchExperience } from '@/components/search/MarketplaceSearchExperience';

export const metadata: Metadata = {
  title: 'Find data on ai.market',
  description:
    'Semantic search across the marketplace data catalog, or post a data request and let providers respond.',
  openGraph: {
    title: 'Find data on ai.market',
    description:
      'Semantic search across the marketplace data catalog, or post a data request and let providers respond.',
    url: 'https://ai.market/find-data',
    siteName: 'ai.market',
    images: ['/og/find-data.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Find data on ai.market',
    description:
      'Semantic search across the marketplace data catalog, or post a data request and let providers respond.',
    images: ['/og/find-data.png'],
  },
};

export const dynamic = 'force-dynamic';

const categories = [
  {
    name: 'Healthcare',
    slug: 'healthcare',
    description: 'Clinical, life sciences, population health, and care operations data.',
  },
  {
    name: 'Finance',
    slug: 'finance',
    description: 'Markets, risk, payments, insurance, and business intelligence datasets.',
  },
  {
    name: 'Technology',
    slug: 'technology',
    description: 'Software, infrastructure, AI systems, and digital product signals.',
  },
  {
    name: 'Retail',
    slug: 'retail',
    description: 'Commerce, merchandising, pricing, inventory, and consumer behavior data.',
  },
  {
    name: 'Real Estate',
    slug: 'real-estate',
    description: 'Property, location, mobility, construction, and market intelligence.',
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    description: 'Audience, advertising, brand, demand generation, and campaign signals.',
  },
  {
    name: 'Government',
    slug: 'government',
    description: 'Public sector, civic, regulatory, procurement, and open-data assets.',
  },
  {
    name: 'Other',
    slug: 'other',
    description: 'Specialized datasets that do not fit a single marketplace category.',
  },
];

export default function FindDataPage() {
  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              Find Data
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Find data, or post what you need.
            </h1>
            <p className="mt-5 text-lg leading-8 text-gray-600">
              Run a semantic search across the marketplace data catalog. Or describe what you are looking for and let providers come to you. Both paths are live.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Search marketplace data catalog">
        <MarketplaceSearchExperience mode="search" />
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                Cannot find what you need?
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
                Post a Data Request. Describe what you are looking for, set a budget range, and providers respond with matching datasets. The whole conversation happens on ai.market.
              </p>
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/requests/new"
                  className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
                >
                  Post a Data Request →
                </Link>
                <p className="text-sm leading-6 text-gray-600">
                  Or{' '}
                  <Link href="/requests" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
                    browse open requests
                  </Link>{' '}
                  to see what other buyers are asking for.
                </p>
              </div>
            </div>

            <aside className="rounded-2xl border border-[#D8EEE6] bg-[#F7FCFA] p-6 shadow-sm" aria-labelledby="agents-heading">
              <h2 id="agents-heading" className="text-xl font-bold tracking-tight text-gray-900">
                Building an AI agent?
              </h2>
              <p className="mt-4 text-sm leading-7 text-gray-600">
                ai.market exposes the marketplace via a standard MCP API. Your agent can search the catalog, purchase datasets, and stream data peer-to-peer.
              </p>
              <Link
                href="/protocol"
                className="mt-6 inline-flex items-center justify-center rounded-lg border border-[#0F6E56] px-4 py-2.5 text-sm font-semibold text-[#0F6E56] transition-colors hover:bg-[#E1F5EE] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
              >
                Read The Protocol →
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="category-browse-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              Browse by Category
            </p>
            <h2 id="category-browse-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
              Start with the market you know.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/listings?category=${category.slug}`}
                className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#C5CAE9] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
              >
                <h3 className="text-base font-semibold text-gray-900 group-hover:text-[#3F51B5]">
                  {category.name}
                </h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {category.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-12 sm:py-16" aria-label="Related marketplace paths">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600 shadow-sm">
            Not the right fit? You might want to{' '}
            <Link href="/sell-data" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Sell Data
            </Link>
            ,{' '}
            <Link href="/run-federated-learning" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Run Federated Learning
            </Link>
            , or check our{' '}
            <Link href="/partner" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Partner Program
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
