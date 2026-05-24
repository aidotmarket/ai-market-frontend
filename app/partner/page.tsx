import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partner with ai.market',
  description: 'Partner with ai.market as a data partner listing datasets or as a technology partner integrating AIM Node.',
};

const dataPartnerSteps = [
  {
    title: 'Talk to us',
    description:
      'Share the datasets you want to bring to market, the buyers you already serve, and the data access model that works for your business.',
  },
  {
    title: 'List with AIM Data',
    description:
      'Package your datasets for marketplace discovery with clear metadata, availability, licensing, and commercial terms.',
  },
  {
    title: 'Get discovered',
    description:
      'Buyers and AI agents can find your listings through marketplace search, requests, and catalog workflows.',
  },
  {
    title: 'Get paid via Stripe payouts',
    description:
      'ai.market handles marketplace checkout and routes approved partner earnings through Stripe payouts.',
  },
];

const technologyPartnerSteps = [
  {
    title: 'Install AIM Node',
    description:
      'Run AIM Node with pip or Docker inside the environment that will connect your platform to ai.market.',
  },
  {
    title: 'Authenticate',
    description:
      'Each instance uses its own Ed25519 keypair. The private key never leaves the machine.',
  },
  {
    title: 'Search the catalog',
    description:
      'Use the MCP API to search marketplace listings, inspect matching data products, and connect catalog access to your user workflows.',
  },
  {
    title: 'Connect peer-to-peer',
    description:
      'Delivery uses a signed delivery token and an encrypted P2P channel. Payloads never touch ai.market.',
  },
];

const comparisonRows = [
  {
    area: 'Discovery and search',
    market: 'Catalog indexing, marketplace search, listing pages, and request matching.',
    node: 'Programmatic catalog access from your platform through AIM Node and the MCP API.',
  },
  {
    area: 'Authentication',
    market: 'Account, partner, and transaction authorization for marketplace workflows.',
    node: 'Per-instance Ed25519 identity, signed requests, and local private-key custody.',
  },
  {
    area: 'Billing and payouts',
    market: 'Checkout, marketplace billing records, partner accounting, and Stripe payouts.',
    node: 'Transaction handoff and local entitlement checks after marketplace authorization.',
  },
  {
    area: 'Delivery channel',
    market: 'Signed delivery token issuance and delivery coordination.',
    node: 'Encrypted peer-to-peer transfer between buyer and provider infrastructure.',
  },
  {
    area: 'Dispute resolution',
    market: 'Marketplace records, support process, and partner escalation path.',
    node: 'Local logs and delivery evidence from the integration environment.',
  },
  {
    area: 'Raw data and payloads',
    market: 'Does not receive raw payloads during AIM Node peer-to-peer delivery.',
    node: 'Keeps raw data movement inside the encrypted P2P channel between peers.',
  },
];

const requirements = ['Python 3.11+ or Docker', '4 GB RAM minimum', 'Outbound network access to ai.market API + P2P connectivity'];

function StepCard({
  step,
  title,
  description,
}: { step: number; title: string; description: string }) {
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8EAF6] text-sm font-bold text-[#3F51B5]">
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

export default function PartnerPage() {
  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">Partners</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">Partner with ai.market.</h1>
            <p className="mt-5 text-lg leading-8 text-gray-600">
              ai.market works with two kinds of partners. Data partners list datasets on the marketplace. Technology partners build integrations that connect their platform to ai.market&apos;s catalog, requests, and federated training.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:max-w-4xl">
            <Link
              href="#data-partner"
              className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[#C5CAE9] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0F6E56]">Data Partners</p>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-gray-900 group-hover:text-[#3F51B5]">I want to list data</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Bring datasets into the marketplace and make them discoverable to buyers and agents.
              </p>
            </Link>

            <Link
              href="#technology-partner"
              className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[#C5CAE9] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0F6E56]">Technology Partners</p>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-gray-900 group-hover:text-[#3F51B5]">I want to integrate</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Connect your platform to ai.market through AIM Node and marketplace APIs.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section id="data-partner" className="bg-white py-16 sm:py-20" aria-labelledby="data-partner-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">Data Partners</p>
              <h2 id="data-partner-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                How it works for data partners
              </h2>
              <blockquote className="mt-6 border-l-4 border-[#0F6E56] pl-5 text-lg font-semibold leading-8 text-gray-900">
                You have datasets. Your customers want them. ai.market makes them discoverable.
              </blockquote>
              <p className="mt-6 text-base leading-7 text-gray-600">
                Data partners use ai.market as a marketplace channel for packaged, commercial datasets. The partner workflow keeps the listing process clear while giving buyers a consistent way to evaluate and buy data.
              </p>
              <a
                href="mailto:support@ai.market?subject=Data%20Partner%20Inquiry"
                className="mt-8 inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
              >
                Talk to a Data Partner manager →
              </a>
            </div>

            <ol className="grid gap-4 sm:grid-cols-2">
              {dataPartnerSteps.map((item, index) => (
                <StepCard key={item.title} step={index + 1} title={item.title} description={item.description} />
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="technology-partner" className="bg-gray-50 py-16 sm:py-20" aria-labelledby="technology-partner-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">Technology Partners</p>
            <h2 id="technology-partner-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
              AIM Node connects your platform to ai.market.
            </h2>
            <p className="mt-5 text-lg leading-8 text-gray-600">
              You operate a platform that needs ai.market access. AIM Node is the integration.
            </p>
            <blockquote className="mt-8 rounded-2xl border border-[#D8EEE6] bg-white p-6 text-base font-semibold leading-7 text-gray-900 shadow-sm">
              AIM Node is the local integration layer for partner platforms. It authenticates an instance, searches ai.market through the MCP API, and coordinates encrypted peer-to-peer delivery so raw payloads move directly between peers.
            </blockquote>
            <p className="mt-5 text-sm leading-6 text-gray-600">
              Technical runbook:{' '}
              <a
                href="https://github.com/aidotmarket/runbooks/blob/main/aim-node.md"
                className="font-semibold text-[#3F51B5] hover:text-[#303F9F]"
                rel="noreferrer"
                target="_blank"
              >
                AIM Node runbook
              </a>
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              <h3 className="text-2xl font-bold tracking-tight text-gray-900">AIM Node integration</h3>
              <ol className="mt-6 grid gap-4 sm:grid-cols-2">
                {technologyPartnerSteps.map((item, index) => (
                  <StepCard key={item.title} step={index + 1} title={item.title} description={item.description} />
                ))}
              </ol>
            </div>

            <aside className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" aria-labelledby="requirements-heading">
              <h3 id="requirements-heading" className="text-xl font-bold tracking-tight text-gray-900">
                Requirements
              </h3>
              <ul className="mt-5 space-y-4">
                {requirements.map((requirement) => (
                  <li key={requirement} className="flex gap-3 text-sm leading-6 text-gray-600">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0F6E56]" />
                    <span>{requirement}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3">
                <a
                  href="mailto:support@ai.market?subject=Technology%20Partner%20Inquiry"
                  className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
                >
                  Talk to a Technology Partner manager →
                </a>
                <Link
                  href="/aim-node"
                  className="inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-5 py-3 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
                >
                  Install AIM Node →
                </Link>
              </div>
            </aside>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-5 sm:px-8">
              <h3 className="text-2xl font-bold tracking-tight text-gray-900">What ai.market handles vs. AIM Node handles</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-sm font-semibold text-gray-900 sm:px-8">
                      Area
                    </th>
                    <th scope="col" className="px-6 py-4 text-sm font-semibold text-gray-900">
                      ai.market handles
                    </th>
                    <th scope="col" className="px-6 py-4 text-sm font-semibold text-gray-900">
                      AIM Node handles
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {comparisonRows.map((row) => (
                    <tr key={row.area}>
                      <th scope="row" className="px-6 py-5 align-top text-sm font-semibold text-gray-900 sm:px-8">
                        {row.area}
                      </th>
                      <td className="px-6 py-5 align-top text-sm leading-6 text-gray-600">{row.market}</td>
                      <td className="px-6 py-5 align-top text-sm leading-6 text-gray-600">{row.node}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20" aria-labelledby="co-sell-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#D8EEE6] bg-[#F7FCFA] p-6 shadow-sm sm:p-8">
            <h2 id="co-sell-heading" className="text-2xl font-bold tracking-tight text-gray-900">
              Some partners do both.
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-7 text-gray-600">
              A partner can list with AIM Data and integrate AIM Node at the same time. That path works well for platforms that want to sell their own datasets while also giving their customers programmatic access to the broader ai.market catalog.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-12 sm:py-16" aria-label="Related marketplace paths">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600 shadow-sm">
            Not a partner candidate? You might want{' '}
            <Link href="/find-data" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Find Data
            </Link>
            ,{' '}
            <Link href="/sell-data" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Sell Data
            </Link>
            , or{' '}
            <Link href="/run-federated-learning" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Run Federated Learning
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
