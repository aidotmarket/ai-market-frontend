import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sell Data',
  description:
    'Install AIM Data on your own infrastructure and sell data through ai.market without giving it away.',
};

const steps = [
  {
    title: 'Install AIM Data.',
    description:
      'Python or Docker. Local-first. Nothing leaves your machine during install.',
    reference: 'release cadence + Cloudflare Worker installer at get.ai.market/aim-data.',
    href: 'https://github.com/aidotmarket/runbooks/blob/main/aim-data-release-process.md',
    linkLabel: 'aim-data-release-process.md',
  },
  {
    title: 'Prepare with allAI.',
    description:
      'allAI scans your data, profiles structure, detects PII, scores quality, and writes the listing metadata. All on your infrastructure.',
  },
  {
    title: 'Publish.',
    description:
      'Review what allAI prepared. Click publish. Only metadata and the listing description go live. The raw data stays with you.',
  },
  {
    title: 'Deliver securely.',
    description:
      'When a buyer purchases, ai.market issues a signed delivery token. Your AIM Data instance honors it and opens the encrypted peer-to-peer channel. Direct, end-to-end.',
    reference: 'AIM/1.0 frame types and delivery handshake.',
    href: 'https://github.com/aidotmarket/runbooks/blob/main/aim-node.md',
    linkLabel: 'aim-node.md §Wire protocol + §Session lifecycle',
  },
];

const features = [
  {
    title: 'Local-first processing.',
    description:
      'Your data never leaves your infrastructure. Profiling, PII scanning, and quality scoring all run on your own machine.',
    reference:
      'release path demonstrates local-first install ethos via Docker multi-arch image + Cloudflare Worker installer + local container execution.',
    href: 'https://github.com/aidotmarket/runbooks/blob/main/aim-data-release-process.md',
    linkLabel: 'aim-data-release-process.md',
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
    note: 'See §4.5 AIM Data trust signals.',
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
  reference,
  href,
  linkLabel,
}: {
  step: number;
  title: string;
  description: string;
  reference?: string;
  href?: string;
  linkLabel?: string;
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
          {href && reference && linkLabel ? (
            <p className="mt-3 text-xs leading-5 text-gray-500">
              Operational reference:{' '}
              <a
                href={href}
                className="font-semibold text-[#3F51B5] hover:text-[#303F9F]"
                rel="noreferrer"
                target="_blank"
              >
                {linkLabel}
              </a>{' '}
              — {reference}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function FeatureCard({
  title,
  description,
  reference,
  href,
  linkLabel,
  note,
}: {
  title: string;
  description: string;
  reference?: string;
  href?: string;
  linkLabel?: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold tracking-tight text-gray-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
      {href && reference && linkLabel ? (
        <p className="mt-4 text-xs leading-5 text-gray-500">
          Operational reference:{' '}
          <a
            href={href}
            className="font-semibold text-[#3F51B5] hover:text-[#303F9F]"
            rel="noreferrer"
            target="_blank"
          >
            {linkLabel}
          </a>{' '}
          — {reference}
        </p>
      ) : null}
      {note ? <p className="mt-4 text-xs leading-5 text-gray-500">{note}</p> : null}
    </div>
  );
}

export default function SellDataPage() {
  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              Sell Data
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Sell your data without giving it away.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
              Install AIM Data on your own infrastructure. Your raw data stays put. We handle discovery, payments, and delivery tokens. Bytes move peer-to-peer the moment a buyer purchases.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/aim-data#install"
                className="inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
              >
                Install AIM Data →
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
              Four steps from install to delivery.
            </h2>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {steps.map((step, index) => (
              <StepCard
                key={step.title}
                step={index + 1}
                title={step.title}
                description={step.description}
                reference={step.reference}
                href={step.href}
                linkLabel={step.linkLabel}
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
              The listing workflow stays local-first.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                title={feature.title}
                description={feature.description}
                reference={feature.reference}
                href={feature.href}
                linkLabel={feature.linkLabel}
                note={feature.note}
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
                Platform fee details are moving to the pricing page.
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
                For the v1 launch, use support for pricing questions while the dedicated pricing page ships.
              </p>
              <Link
                href="/support"
                className="mt-6 inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-5 py-3 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
              >
                Contact Support →
              </Link>
            </div>

            <aside className="rounded-2xl border border-[#D8EEE6] bg-[#F7FCFA] p-6 shadow-sm" aria-labelledby="agents-heading">
              <h2 id="agents-heading" className="text-xl font-bold tracking-tight text-gray-900">
                Selling to AI agents?
              </h2>
              <p className="mt-4 text-sm leading-7 text-gray-600">
                AI agents discover and purchase data through ai.market&apos;s MCP API. Your AIM Data listing is automatically agent-discoverable. No extra integration work needed on your side.
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
              Start with AIM Data.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
              Install AIM Data on your own infrastructure, prepare the listing locally, and publish when you are ready.
            </p>
            <Link
              href="/aim-data#install"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
            >
              Install AIM Data →
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
            ,{' '}
            <Link href="/run-federated-learning" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Run Federated Learning
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
  );
}
