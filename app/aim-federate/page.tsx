import Link from 'next/link';
import type { Metadata } from 'next';

const title = 'AIM Federate — train models across organizations';
const description =
  'Private beta. Five orgs, one model, raw data never leaves the perimeter. Request access.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: 'https://ai.market/aim-federate',
    siteName: 'ai.market',
    images: ['/og/aim-federate.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og/aim-federate.png'],
  },
};

const AIM_FEDERATE_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'AIM Federate',
    serviceType: 'Federated machine learning marketplace coordination',
    url: 'https://ai.market/aim-federate',
    description,
    provider: {
      '@type': 'Organization',
      name: 'ai.market',
      url: 'https://ai.market',
    },
    areaServed: 'Global',
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
        name: 'AIM Federate',
        item: 'https://ai.market/aim-federate',
      },
    ],
  },
];

const howItWorks = [
  {
    title: 'Define the cohort.',
    description:
      'Five organizations or more, all needing a model on data they cannot pool. KYB and escrow checks happen before the campaign starts.',
  },
  {
    title: 'Set up the enclaves.',
    description:
      'Each organization runs the local aggregator in an AWS Nitro enclave with reproducible builds, signed manifest binding, two-key custody, and verifier CLI checks.',
  },
  {
    title: 'Train.',
    description:
      'Each organization trains locally on its own data. The aggregator coordinates rounds with participant events and coordinator quality scores.',
  },
  {
    title: 'Settle.',
    description:
      'ai.market handles escrow release when the cohort accepts the trained model. The cohort owns the model.',
  },
];

const claimMatrix = [
  {
    claim: 'Raw data does not leave the perimeter.',
    evidence: 'Enclave attestation and signed manifest with PCR8 binding.',
    forbidden: 'No generic “protect your data” claim without the attestation chain.',
  },
  {
    claim: 'The aggregator runs in a sealed enclave.',
    evidence: 'AWS Nitro Enclave plus reproducible build verifier CLI.',
    forbidden: 'ai.market does not host the aggregator; each organization runs it in its own AWS account.',
  },
  {
    claim: 'Only aggregated updates leave the enclave.',
    evidence: 'Cryptographic receipts plus dual-signal metering.',
    forbidden: 'No differential privacy claim unless a campaign explicitly opts into bounded DP parameters.',
  },
  {
    claim: 'The cohort owns the model.',
    evidence: 'Settlement contract and escrow release.',
    forbidden: 'ai.market does not take a model royalty after settlement.',
  },
  {
    claim: 'Lead gating requires KYB and escrow.',
    evidence: 'CRM review task and business-day SLA.',
    forbidden: 'ai.market does not provide KYB or legal, compliance, financial, or money-transmission services.',
  },
];

export default function AimFederatePage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(AIM_FEDERATE_JSONLD)}</script>
      <div className="bg-white">
        <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                Private beta
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
                Train models across organizations without moving the data.
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
                Five organizations, one model, raw data never leaves the perimeter. The aggregator
                runs in a sealed enclave; we provide the orchestration, the cohort owns the math.
              </p>
              <p className="mt-4 text-base italic leading-7 text-gray-700">Private beta — request access.</p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="#request-access"
                  className="inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
                >
                  Request access
                </Link>
                <Link
                  href="#claim-matrix"
                  className="inline-flex items-center justify-center rounded-lg border border-[#0F6E56] px-5 py-3 text-sm font-semibold text-[#0F6E56] transition-colors hover:bg-[#E1F5EE] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
                >
                  What is verifiable
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20" aria-labelledby="what-it-is-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                  What it is
                </p>
                <h2 id="what-it-is-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                  Federated training for organizations that cannot pool data.
                </h2>
                <p className="mt-4 text-base leading-7 text-gray-600">
                  AIM Federate is the marketplace function for training AI models across
                  organizations that cannot pool their data. Each organization runs training locally
                  on its own infrastructure. The aggregator runs in an AWS Nitro enclave with
                  reproducible builds, signed attestation, and verifier CLI checks before data flows.
                </p>
                <p className="mt-4 text-base leading-7 text-gray-600">
                  Each organization keeps custody of its data. The cohort owns the resulting model.
                  ai.market handles discovery, KYB checks, escrow, billing, and dispute resolution.
                </p>
              </div>

              <aside className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm leading-7 text-gray-600 shadow-sm">
                We do not host the aggregator. We do not provide legal, compliance, financial, or
                money-transmission advice or services. Leads engage their own KYB and compliance
                counsel.
              </aside>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-16 sm:py-20" aria-labelledby="wedge-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                Private beta wedge
              </p>
              <h2 id="wedge-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                Fintech fraud and AML.
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">
                Regulation makes it hard for banks, payment processors, and fintechs to pool
                transaction data for fraud detection. AIM Federate lets a cohort train a shared fraud
                model without anyone moving raw transaction data. We are starting with fintech. If
                you operate in a regulated industry with similar data-pooling pain, get in touch.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20" aria-labelledby="how-it-works-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                How it works
              </p>
              <h2 id="how-it-works-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                Cohort setup, enclave training, escrow settlement.
              </h2>
            </div>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2">
              {howItWorks.map((step, index) => (
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

        <section id="claim-matrix" className="bg-gray-50 py-16 sm:py-20" aria-labelledby="claim-matrix-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                What is verifiable
              </p>
              <h2 id="claim-matrix-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                The claims stay attached to evidence.
              </h2>
            </div>

            <div className="mt-10 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="grid gap-px bg-gray-200 md:grid-cols-3">
                <div className="bg-gray-50 p-4 text-sm font-semibold text-gray-900">Claim</div>
                <div className="bg-gray-50 p-4 text-sm font-semibold text-gray-900">Evidence</div>
                <div className="bg-gray-50 p-4 text-sm font-semibold text-gray-900">Forbidden statements</div>
                {claimMatrix.map((row) => (
                  <div key={row.claim} className="contents">
                    <div className="bg-white p-4 text-sm leading-6 text-gray-700">{row.claim}</div>
                    <div className="bg-white p-4 text-sm leading-6 text-gray-700">{row.evidence}</div>
                    <div className="bg-white p-4 text-sm leading-6 text-gray-700">{row.forbidden}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20" aria-labelledby="request-access">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
                  Request access
                </p>
                <h2 id="request-access" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                  Tell us what role you want in the cohort.
                </h2>
                <p className="mt-4 text-base leading-7 text-gray-600">
                  Submissions route to the public federate request-access endpoint when that backend
                  chunk is deployed. ai.market does not auto-create accounts from this form.
                </p>
                <p className="mt-4 rounded-2xl border border-[#D8EEE6] bg-[#F7FCFA] p-5 text-sm leading-7 text-gray-600">
                  Thanks. We will get back to you within 5 business days. If your access is approved,
                  we will reach out to the work email you provided to start the KYB and escrow setup.
                </p>
              </div>

              <form
                action="/api/v1/public/federate/request-access"
                method="post"
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <input type="text" name="hp_company_url" className="hidden" tabIndex={-1} autoComplete="off" />

                <label className="block text-sm font-semibold text-gray-900">
                  Role
                  <select name="role" required className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
                    <option value="">Select role</option>
                    <option value="lead">Lead</option>
                    <option value="seller">Seller</option>
                    <option value="both">Both</option>
                    <option value="observer">Observer</option>
                  </select>
                </label>

                <label className="mt-4 block text-sm font-semibold text-gray-900">
                  Use case category
                  <select name="use_case_category" required className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
                    <option value="">Select use case</option>
                    <option value="fraud">Fraud</option>
                    <option value="aml">AML</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="mt-4 block text-sm font-semibold text-gray-900">
                  Data category
                  <select name="data_category" className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
                    <option value="N/A-lead">N/A-lead</option>
                    <option value="transactions">Transactions</option>
                    <option value="identities">Identities</option>
                    <option value="behaviors">Behaviors</option>
                  </select>
                </label>

                <label className="mt-4 block text-sm font-semibold text-gray-900">
                  KYB tier self-claim
                  <select name="kyb_tier" required className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
                    <option value="">Select tier</option>
                    <option value="none">None</option>
                    <option value="tier1">Tier 1</option>
                    <option value="tier2">Tier 2</option>
                    <option value="tier3">Tier 3</option>
                  </select>
                </label>

                <label className="mt-4 block text-sm font-semibold text-gray-900">
                  Named contact
                  <input name="named_contact" required className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                </label>

                <label className="mt-4 block text-sm font-semibold text-gray-900">
                  Work email
                  <input name="work_email" type="email" required className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                </label>

                <div className="mt-4 grid gap-3 text-sm text-gray-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="aws_account_ready" value="yes" className="h-4 w-4 rounded border-gray-300 text-[#0F6E56]" />
                    AWS account ready
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="escrow_ready" value="yes" className="h-4 w-4 rounded border-gray-300 text-[#0F6E56]" />
                    Escrow ready
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="sponsor_endorsement_ready" value="yes" className="h-4 w-4 rounded border-gray-300 text-[#0F6E56]" />
                    Sponsor endorsement ready
                  </label>
                </div>

                <button
                  type="submit"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2"
                >
                  Request access
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 py-12 sm:py-16" aria-label="Related marketplace paths">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600 shadow-sm">
              Not running federated learning? You might want to{' '}
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
