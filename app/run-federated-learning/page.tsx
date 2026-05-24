import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Run federated learning on ai.market with AIM Federate',
  description: 'Train models across organizations without moving the data. Private beta.',
  openGraph: {
    title: 'Run federated learning on ai.market with AIM Federate',
    description: 'Train models across organizations without moving the data. Private beta.',
    url: 'https://ai.market/run-federated-learning',
    siteName: 'ai.market',
    images: ['/og/aim-federate.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Run federated learning on ai.market with AIM Federate',
    description: 'Train models across organizations without moving the data. Private beta.',
    images: ['/og/aim-federate.png'],
  },
};

const RUN_FEDERATED_LEARNING_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'AIM Federate',
    serviceType: 'Federated learning orchestration',
    url: 'https://ai.market/run-federated-learning',
    description: 'Train models across organizations without moving the data. Private beta.',
    provider: {
      '@type': 'Organization',
      name: 'ai.market',
      url: 'https://ai.market',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'ai.market',
        item: 'https://ai.market',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Run federated learning',
        item: 'https://ai.market/run-federated-learning',
      },
    ],
  },
];

export default function RunFederatedLearningPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(RUN_FEDERATED_LEARNING_JSONLD)}</script>
      <div className="bg-white">
        <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3F51B5]">
                Run Federated Learning
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
                Train across organizations without moving the data.
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
                AIM Federate coordinates private beta training workflows where each participant keeps raw data inside its own environment.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <a
                  href="mailto:support@ai.market?subject=AIM%20Federate%20Private%20Beta"
                  className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
                >
                  Request access
                </a>
                <Link
                  href="/partner"
                  className="inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-5 py-3 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
                >
                  Partner with ai.market
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20" aria-labelledby="federated-learning-fit-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3F51B5]">
                  Private beta
                </p>
                <h2 id="federated-learning-fit-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                  Built for multi-party model training.
                </h2>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold tracking-tight text-gray-900">Keep data local</h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  Participants train from their own controlled environments instead of sending raw datasets to a central party.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold tracking-tight text-gray-900">Coordinate the cohort</h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  ai.market helps organize access, participation, and training workflow coordination for approved beta partners.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-12 sm:py-16" aria-label="Related marketplace paths">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600 shadow-sm">
              Not the right fit? You might want to{' '}
              <Link href="/find-data" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
                Find Data
              </Link>
              ,{' '}
              <Link href="/sell-data" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
                Sell Data
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
    </>
  );
}
