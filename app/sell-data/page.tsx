import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sell data on ai.market with AIM Data',
  description:
    'Install AIM Data on your infrastructure. List your datasets without giving up custody. Stripe payouts on every transaction.',
  openGraph: {
    title: 'Sell data on ai.market with AIM Data',
    description:
      'Install AIM Data on your infrastructure. List your datasets without giving up custody. Stripe payouts on every transaction.',
    url: 'https://ai.market/sell-data',
    siteName: 'ai.market',
    images: ['/og/sell-data.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sell data on ai.market with AIM Data',
    description:
      'Install AIM Data on your infrastructure. List your datasets without giving up custody. Stripe payouts on every transaction.',
    images: ['/og/sell-data.png'],
  },
};

const SELL_DATA_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AIM Data',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Linux, macOS',
  url: 'https://ai.market/sell-data',
  description:
    'Install AIM Data on your infrastructure. List your datasets without giving up custody. Stripe payouts on every transaction.',
  provider: {
    '@type': 'Organization',
    name: 'ai.market',
    url: 'https://ai.market',
  },
};

const steps = [
  {
    title: 'THE MARKETING IS INCLUDED',
    description:
      'Getting a data product in front of buyers normally costs a marketing budget. Here it is part of the listing. allAI writes your metadata in the formats AI search reads, publishes it everywhere agents look, and answers buyer questions for you around the clock. You pay nothing until a sale clears, and then it is 5%.',
  },
  {
    title: 'YOUR DATA NEVER LEAVES',
    description:
      'Install AIM Data on your own infrastructure. It profiles what you have, scans it for PII, scores the quality and writes the listing. You review and click publish. The data itself stays exactly where it is, and when a sale closes it moves peer-to-peer, encrypted, straight to the buyer.',
  },
  {
    title: "YOU DON'T CHASE LEADS",
    description:
      "allAI sits between you and every buyer. It answers questions about your data, handles the negotiation and runs checkout. You see the sale, not the busywork.",
  },
];

const features = [
  {
    title: 'Local-first processing.',
    description:
      'Your data never leaves your infrastructure. Profiling, PII scanning, and quality scoring all run on your own machine.',
  },
  {
    title: 'AI-assisted listings.',
    description:
      'allAI writes the metadata, generates the listing description, and tags the data for discovery by buyers and AI agents.',
  },
  {
    title: 'Honest PII signals.',
    description:
      'PII scans surface to buyers as one of three states: passed, flagged, or not run. We do not fake clean scans for unscanned data.',
  },
  {
    title: 'Stripe payouts.',
    description:
      'When a buyer purchases, the payment flows through ai.market and Stripe pays you out. We take a marketplace fee and you get the rest.',
  },
];

function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE] text-sm font-bold text-[#0F6E56]">
          {step}
        </span>
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
        </div>
      </div>
    </li>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold tracking-tight text-gray-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
    </div>
  );
}

export default function SellDataPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(SELL_DATA_JSONLD)}</script>
      <div className="bg-white">
      <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              Sell Data
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              List once. Get found everywhere.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
              Your data stays on your infrastructure. Your listing travels the world. Every listing is built to be found by AI assistants and search engines globally, so buyers discover your data without ever visiting ai.market.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
              >
                Create Your Account
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-lg border border-[#0F6E56] px-5 py-3 text-sm font-semibold text-[#0F6E56] transition-colors hover:bg-[#E1F5EE] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
              >
                How it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-16 sm:py-20" aria-labelledby="how-it-works-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              How it works
            </p>
            <h2 id="how-it-works-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
              Three reasons to list.
            </h2>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {steps.map((step, index) => (
              <StepCard
                key={step.title}
                step={index + 1}
                title={step.title}
                description={step.description}
              />
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="features-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              What you get
            </p>
            <h2 id="features-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
              The listing workflow stays local.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20" aria-labelledby="pricing-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                Pricing
              </p>
              <h2 id="pricing-heading" className="mt-3 text-2xl font-bold tracking-tight text-gray-900">
                List free. Pay 5% when a sale clears.
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
                Sellers list free and pay nothing until a buyer pays. Stripe handles the payout.
              </p>
              <Link
                href="/register"
                className="mt-6 inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-5 py-3 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
              >
                Create Your Account
              </Link>
            </div>

            <aside className="rounded-2xl border border-[#D8EEE6] bg-[#F7FCFA] p-6 shadow-sm" aria-labelledby="agents-heading">
              <h2 id="agents-heading" className="text-xl font-bold tracking-tight text-gray-900">
                Built for AI search
              </h2>
              <p className="mt-4 text-sm leading-7 text-gray-600">
                Every listing is built to be found by AI assistants and search engines. Buyers can discover your data where they already ask.
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

      <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="final-cta-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#D8EEE6] bg-white p-6 shadow-sm sm:p-8">
            <h2 id="final-cta-heading" className="text-2xl font-bold tracking-tight text-gray-900">
              Create Your Account
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
              Start as a seller. List free and pay nothing until a sale clears.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
            >
              Create Your Account
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white py-12 sm:py-16" aria-label="Related marketplace paths">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600 shadow-sm">
            Not selling data? You might be looking for{' '}
            <Link href="/find-data" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Find Data
            </Link>
            , or our{' '}
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
