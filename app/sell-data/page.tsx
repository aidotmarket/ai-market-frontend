import type { ReactNode } from 'react';
import { getPublicTermsVersion } from '@/lib/publicTermsVersion';
import VersionedTermsCopy, { TermsVersionProvider } from '@/components/legal/VersionedTermsCopy';
import { CARD_SELL_PAYOUT, CARD_SELL_SUMMARY } from '@/components/legal/terms12Copy';
import Link from 'next/link';
import type { Metadata } from 'next';
import SellDataCta from '@/components/SellDataCta';

const hostingOptions =
  'Keep your files in your own AWS S3 bucket, your own Cloudflare R2 bucket, or on your own infrastructure with the self-hosted AIM Data Gateway.';
const sellDataDescription = `allAI guides you through listing data and helps handle buyer questions, negotiation, and checkout. ${hostingOptions}`;

export const metadata: Metadata = {
  alternates: { canonical: '/sell-data' },
  title: { absolute: 'Sell data on ai.market' },
  description: sellDataDescription,
  openGraph: {
    title: 'Sell data on ai.market',
    description: sellDataDescription,
    url: 'https://ai.market/sell-data',
    siteName: 'ai.market',
    images: ['/og/sell-data.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sell data on ai.market',
    description: sellDataDescription,
    images: ['/og/sell-data.png'],
  },
};

const SELL_DATA_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Sell data on ai.market',
  url: 'https://ai.market/sell-data',
  description: sellDataDescription,
  provider: {
    '@type': 'Organization',
    name: 'ai.market',
    url: 'https://ai.market',
  },
};

const steps = [
  {
    title: 'Help buyers find your data',
    description:
      'allAI prepares your listing for AI search so buyers can find it when they ask an AI assistant for data.',
  },
  {
    title: 'Review before you publish',
    description:
      'You choose which files to list and review the listing before it goes live.',
  },
  {
    title: 'Let allAI handle buyer questions',
    description:
      'allAI answers questions about your data around the clock, handles negotiation, and runs checkout.',
  },
];

const features = [
  {
    title: 'Manage your listings.',
    description:
      'Use Seller Workspace to manage your listings and set prices and licenses.',
  },
  {
    title: 'AI-assisted listings.',
    description:
      'allAI drafts your listing description and adds tags to help buyers and AI assistants find it.',
  },
  {
    title: 'Share an optional sample.',
    description:
      'If you use the AIM Data Gateway, you can choose to publish a public sample alongside your listing.',
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
  description: ReactNode;
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
  description: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold tracking-tight text-gray-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
    </div>
  );
}

export default async function SellDataPage() {
  const termsVersion = await getPublicTermsVersion();
  return (
    <TermsVersionProvider initialVersion={termsVersion}>
      <script type="application/ld+json">{JSON.stringify(SELL_DATA_JSONLD)}</script>
      <div className="bg-white">
      <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              Sell Data
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Sell your data with help from allAI
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
              allAI walks you through creating a listing and helps handle buyer questions, negotiation, and checkout.
            </p>
            <SellDataCta variant="hero" />
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="hosting-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="hosting-heading" className="text-3xl font-extrabold tracking-tight text-gray-900">
            Choose where to keep your data
          </h2>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
            {hostingOptions}
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="cloud-heading">
              <h3 id="cloud-heading" className="text-xl font-bold tracking-tight text-gray-900">
                Connect your cloud storage
              </h3>
              <p className="mt-4 text-base leading-7 text-gray-600">
                Connect your AWS S3 or Cloudflare R2 bucket in Seller Workspace with read-only access.
                There is nothing to install. Choose the files to list, and allAI drafts a listing from
                your description and the selected file names and sizes. You review, approve, and publish it.
              </p>
              <p className="mt-4 mb-6 text-base leading-7 text-gray-600">
                Buyers purchase on ai.market and download directly from your bucket through
                time-limited links. ai.market never stores your data.
              </p>
              <SellDataCta variant="cloud" className="mt-auto self-start" />
            </article>
            <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="self-hosted-heading">
              <h3 id="self-hosted-heading" className="text-xl font-bold tracking-tight text-gray-900">
                Set up AIM Data for self-hosting
              </h3>
              <p className="mt-4 text-base leading-7 text-gray-600">
                Install the open-source AIM Data Gateway using Docker. It automatically sends limited
                information to identify your files. You confirm each file before it shares a description
                of what the file contains. These messages contain no data values. You can also choose to
                publish a public sample.
              </p>
              <p className="mt-4 mb-6 text-base leading-7 text-gray-600">
                After purchase, buyers download the files directly through your gateway.{' '}
                <Link href="/aim-data" className="font-semibold text-[#3F51B5] underline hover:text-[#303F9F]">
                  Technical details for your IT team
                </Link>
              </p>
              <SellDataCta variant="self-hosted" className="mt-auto self-start" />
            </article>
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
              Tools to run your data sales
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                title={feature.title}
                description={<VersionedTermsCopy legacy={feature.description} terms12={feature.title === 'Stripe payouts.' ? CARD_SELL_PAYOUT : feature.description} />}
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
                <VersionedTermsCopy legacy="Sellers list free and pay nothing until a buyer pays. Stripe handles the payout." terms12={CARD_SELL_SUMMARY} />
              </p>
              <SellDataCta variant="inline" />
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
          <SellDataCta
            variant="final"
            finalCopy={{
              heading: 'List your data',
              description: 'allAI helps you get your first listing ready. List free and pay nothing until a sale clears.',
            }}
          />
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
    </TermsVersionProvider>
  );
}
