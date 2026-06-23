import Link from 'next/link';
import type { Metadata } from 'next';

const title = 'AIM Data — local-first publishing for the data marketplace';
const description =
  'AIM Data scans your data for PII, scores quality, writes the listing, and connects sellers, buyers, and builders through one local-first conduit.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: 'https://ai.market/aim-data',
    siteName: 'ai.market',
    images: ['/og/aim-data.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og/aim-data.png'],
  },
};

const AIM_DATA_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AIM Data',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Linux, macOS, Windows',
    url: 'https://ai.market/aim-data',
    description,
    provider: {
      '@type': 'Organization',
      name: 'ai.market',
      url: 'https://ai.market',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://ai.market',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'AIM Data',
        item: 'https://ai.market/aim-data',
      },
    ],
  },
];

const trustSignals = [
  {
    label: 'PII scan: passed',
    tone: 'border-[#B7E4CF] bg-[#F0FBF6] text-[#0F6E56]',
    backend: 'privacy_score is present and the trust service evaluates clean.',
    meaning: 'The seller ran AIM Data’s local PII scan and no detectable personal data was found.',
  },
  {
    label: 'PII scan: flagged',
    tone: 'border-[#F4D38D] bg-[#FFF8E8] text-[#8A5A00]',
    backend: 'privacy_score is present and the trust service flagged possible personal data.',
    meaning: 'The seller ran the scan, AIM Data found content that may be personal data, and the seller acknowledged the flag at publish time.',
  },
  {
    label: 'PII scan: not run',
    tone: 'border-gray-300 bg-gray-50 text-gray-700',
    backend: 'privacy_score is null.',
    meaning: 'The seller has not enabled the local PII scan on this listing. We do not fake a clean signal when it is missing.',
  },
  {
    label: 'Quality scan: graded',
    tone: 'border-[#B7E4CF] bg-[#F0FBF6] text-[#0F6E56]',
    backend: 'quality_score is present.',
    meaning: 'The seller ran AIM Data’s local quality grading. The numeric score surfaces alongside the badge.',
  },
  {
    label: 'Quality scan: not run',
    tone: 'border-gray-300 bg-gray-50 text-gray-700',
    backend: 'quality_score is null.',
    meaning: 'The seller has not enabled local quality grading on this listing.',
  },
];

const steps = [
  {
    title: 'Install AIM Data.',
    description: 'Python or Docker. Local-first. Nothing leaves your machine during install.',
  },
  {
    title: 'Prepare with allAI.',
    description:
      'AIM Data profiles structure, detects PII, scores quality, and prepares listing metadata on your infrastructure.',
  },
  {
    title: 'Review and publish.',
    description:
      'You review the generated metadata and listing copy. Only the listing goes live; raw data stays with you.',
  },
  {
    title: 'Deliver peer-to-peer.',
    description:
      'When a buyer purchases, ai.market issues a signed delivery token that your AIM Data instance honors.',
  },
];

const developerSteps = [
  {
    title: 'Install for your surface.',
    description:
      'Use the non-dev GUI for seller workflows, or run AIM Data through the CLI, SDK, MCP server, or Docker for application integrations.',
  },
  {
    title: 'Enroll local identity.',
    description:
      'Each AIM Data instance generates an Ed25519 keypair locally. The private key stays on your infrastructure.',
  },
  {
    title: 'Search and transact.',
    description:
      'Query ai.market by capability, schema, license, price, and quality score, then connect catalog access to your user workflows.',
  },
  {
    title: 'Open the P2P channel.',
    description:
      'Present the signed delivery token and connect directly over an encrypted peer-to-peer channel. Payloads never touch ai.market.',
  },
];

const developerSurfaces = [
  {
    title: 'CLI',
    description:
      'Script installs, local enrollment, listing preparation, catalog queries, and delivery checks from terminal workflows.',
  },
  {
    title: 'SDK',
    description:
      'Embed AIM Data workflows inside your own product for search, authorization, listing, and transaction handoff.',
  },
  {
    title: 'MCP server',
    description:
      'Expose catalog search and marketplace workflows to AI agents through a local server controlled by your infrastructure.',
  },
  {
    title: 'P2P delivery',
    description:
      'Keep raw payload movement between buyer and seller endpoints with signed tokens and encrypted peer-to-peer transfer.',
  },
];

const developerRequirements = [
  {
    title: 'Python 3.11+ or Docker',
    description: 'Use a Python-native install path or containerized deployment for local control-plane operation.',
  },
  {
    title: '4 GB RAM minimum',
    description: 'Enough for local scans, integration workflows, and peer-to-peer connectivity.',
  },
  {
    title: 'Network access',
    description: 'Outbound access to the ai.market API plus peer-to-peer connectivity for delivery sessions.',
  },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="rounded-lg bg-gray-950 px-4 py-3">
      <code className="block overflow-x-auto whitespace-nowrap text-sm text-gray-100">{children}</code>
    </div>
  );
}

export default function AimDataPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(AIM_DATA_JSONLD)}</script>
      <div className="bg-white">
        <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                AIM Data
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
                AIM Data: the local-first companion that gets your data listed.
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
                AIM Data runs on your own infrastructure. It profiles your data, scans for PII,
                scores quality, writes the listing for you, and gives builders a local developer
                surface for catalog search, transaction handoff, and peer-to-peer delivery. You
                review, you publish, and your raw data stays where it is.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="#install"
                  className="inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
                >
                  Install AIM Data
                </Link>
                <Link
                  href="#developer-surface"
                  className="inline-flex items-center justify-center rounded-lg border border-[#0F6E56] px-5 py-3 text-sm font-semibold text-[#0F6E56] transition-colors hover:bg-[#E1F5EE] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
                >
                  Developer surface
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="trust-signals" className="bg-white py-16 sm:py-20" aria-labelledby="trust-signals-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                Trust signals
              </p>
              <h2 id="trust-signals-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                Buyers see what actually ran.
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">
                AIM Data listings use nullable privacy and quality scores. A missing score means the
                scan did not run, and the marketplace says that plainly.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {trustSignals.map((signal) => (
                <article key={signal.label} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${signal.tone}`}>
                    {signal.label}
                  </span>
                  <p className="mt-4 text-sm font-semibold text-gray-900">{signal.backend}</p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{signal.meaning}</p>
                </article>
              ))}
            </div>

            <p className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm leading-7 text-gray-600">
              “Not run” is an honest buyer signal. The seller has not yet enabled the local PII scan
              on this listing. AIM Data offers a one-click scan that runs on the seller’s own
              machine. We do not run it for them, and we do not fake a clean signal when it is
              missing.
            </p>
          </div>
        </section>

        <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="how-it-works-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                How it works
              </p>
              <h2 id="how-it-works-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                From local scan to live listing.
              </h2>
            </div>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2">
              {steps.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE] text-sm font-bold text-[#0F6E56]">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="developer-surface" className="bg-white py-16 sm:py-20" aria-labelledby="developer-surface-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                  Developer surface
                </p>
                <h2 id="developer-surface-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                  One conduit for GUI users and builders.
                </h2>
                <p className="mt-5 text-base leading-7 text-gray-600">
                  AIM Data is the local control point for sellers, buyers, and partner platforms. The same local-first conduit supports the non-dev GUI and the developer surface: CLI, SDK, MCP server, and encrypted peer-to-peer delivery.
                </p>
                <blockquote className="mt-8 rounded-2xl border border-[#D8EEE6] bg-[#F7FCFA] p-6 text-base font-semibold leading-7 text-gray-900 shadow-sm">
                  ai.market coordinates discovery, billing, delivery tokens, and transaction records. AIM Data keeps private keys, raw data, queries, results, and payload movement under endpoint control.
                </blockquote>
              </div>

              <div>
                <ol className="grid gap-4 sm:grid-cols-2">
                  {developerSteps.map((step, index) => (
                    <li key={step.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start gap-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE] text-sm font-bold text-[#0F6E56]">
                          {index + 1}
                        </span>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {developerSurfaces.map((surface) => (
                    <article key={surface.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="text-base font-semibold text-gray-900">{surface.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-gray-600">{surface.description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="install">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                Install
              </p>
              <h2 id="install" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                Install AIM Data.
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">
                Download the AIM Data desktop app when the installer link is available, run it on
                the machine that can reach your data, then configure the connection locally. Current
                command-line install paths are below and may require Docker Desktop or OrbStack.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">macOS and Linux</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Run the installer from a terminal, then follow the local setup prompts.
                </p>
                <div className="mt-5">
                  <CodeBlock>curl -fsSL https://get.ai.market/aim-data | bash</CodeBlock>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">Windows</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Run from PowerShell, then configure your local data connection.
                </p>
                <div className="mt-5">
                  <CodeBlock>irm https://get.ai.market/aim-data/windows | iex</CodeBlock>
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {developerRequirements.map((item) => (
                <article key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
                </article>
              ))}
            </div>

            <p className="mt-6 text-sm leading-6 text-gray-600">
              Full documentation is being consolidated with the AIM Data release process. Until then,
              keep the setup local: install the app or developer surface, connect the data source,
              enroll the local Ed25519 identity, run scans, review the generated listing, then
              publish or connect peer-to-peer.
            </p>
          </div>
        </section>

        <section className="bg-white py-12 sm:py-16" aria-label="Related marketplace paths">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600 shadow-sm">
              Not a seller? You might want{' '}
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
