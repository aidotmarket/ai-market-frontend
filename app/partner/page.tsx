import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Partner with ai.market' },
  description:
    'Data partners and Technology partners. Integrate AIM Node, list datasets, co-sell.',
  openGraph: {
    title: 'Partner with ai.market',
    description:
      'Data partners and Technology partners. Integrate AIM Node, list datasets, co-sell.',
    url: 'https://ai.market/partner',
    siteName: 'ai.market',
    images: ['/og/partner.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Partner with ai.market',
    description:
      'Data partners and Technology partners. Integrate AIM Node, list datasets, co-sell.',
    images: ['/og/partner.png'],
  },
};

const PARTNER_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ai.market Partner Program',
  url: 'https://ai.market/partner',
  description:
    'Data partners and Technology partners. Integrate AIM Node, list datasets, co-sell.',
  parentOrganization: {
    '@type': 'Organization',
    name: 'ai.market',
    url: 'https://ai.market',
  },
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
    title: 'Install AIM Data',
    description:
      'Run AIM Data with the CLI, SDK, MCP server, or Docker inside the environment that will connect your platform to ai.market.',
  },
  {
    title: 'Authenticate',
    description:
      'Each instance uses its own Ed25519 keypair. The private key never leaves the machine.',
  },
  {
    title: 'Search the catalog',
    description:
      'Query ai.market by capability, schema, license, price, and quality score through AIM Data’s developer surface.',
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
    node: 'Programmatic catalog access from your platform through AIM Data and the MCP API.',
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
    market: 'Does not receive raw payloads during AIM Data peer-to-peer delivery.',
    node: 'Keeps raw data movement inside the encrypted P2P channel between peers.',
  },
];

const requirements = ['Python 3.11+ or Docker', '4 GB RAM minimum', 'Outbound network access to ai.market API + P2P connectivity'];

const specialistTypes = [
  {
    title: 'Listing specialists.',
    description:
      "You take a company's data and get it ready to sell. Profiling, cleanup, the right metadata, sensible pricing and licensing. You make data that buyers and AI agents can actually find and trust.",
  },
  {
    title: 'Vertical specialists.',
    description:
      'You own a niche. Energy, health, finance, geospatial, whatever you know cold. You understand what buyers in that space need and which sellers have it. You become the trusted name for data in your category, and for sensitive data you are the one who can vouch for it.',
  },
  {
    title: 'Deployment specialists.',
    description:
      'You install and run AIM Data and vectorAIz for clients. You wire up their data sources, get them listed, and keep it running. Setup plus managed service, billed your way.',
  },
  {
    title: 'Sourcing specialists.',
    description:
      'You work for the buyers. AI teams and funds need the right data and do not have time to hunt for it. You find it, you vet it, you handle the buying.',
  },
];

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
    <>
      <script type="application/ld+json">{JSON.stringify(PARTNER_JSONLD)}</script>
      <div className="bg-white">
      <section className="bg-gradient-to-b from-[#F7FCFA] to-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">Partners</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">Partner with ai.market.</h1>
            <p className="mt-5 text-lg leading-8 text-gray-600">
              ai.market works with three kinds of partners. Data partners list datasets on the marketplace. Technology partners build integrations that connect their platform to ai.market&apos;s catalog, requests, and delivery flows. Specialists build a business inside the market itself.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:max-w-6xl lg:grid-cols-3">
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
                Connect your platform to ai.market through AIM Data and marketplace APIs.
              </p>
            </Link>

            <Link
              href="#specialists"
              className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[#C5CAE9] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0F6E56]">Specialists</p>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-gray-900 group-hover:text-[#3F51B5]">I want to build a business</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Help people transact on ai.market, or build and list data products of your own.
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
              AIM Data connects your platform to ai.market.
            </h2>
            <p className="mt-5 text-lg leading-8 text-gray-600">
              You operate a platform that needs ai.market access. AIM Data is the single conduit.
            </p>
            <blockquote className="mt-8 rounded-2xl border border-[#D8EEE6] bg-white p-6 text-base font-semibold leading-7 text-gray-900 shadow-sm">
              AIM Data is the local integration layer for partner platforms. It authenticates an instance, exposes a developer surface with CLI, SDK, MCP server, and P2P flows, searches ai.market, and coordinates encrypted peer-to-peer delivery so raw payloads move directly between peers.
            </blockquote>
            <p className="mt-5 text-sm leading-6 text-gray-600">
              Technical runbook:{' '}
              <a
                href="https://github.com/aidotmarket/runbooks/blob/main/aim-data.md"
                className="font-semibold text-[#3F51B5] hover:text-[#303F9F]"
                rel="noreferrer"
                target="_blank"
              >
                AIM Data runbook
              </a>
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              <h3 className="text-2xl font-bold tracking-tight text-gray-900">AIM Data integration</h3>
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
                  href="/aim-data"
                  className="inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-5 py-3 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
                >
                  Install AIM Data →
                </Link>
              </div>
            </aside>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-5 sm:px-8">
              <h3 className="text-2xl font-bold tracking-tight text-gray-900">What ai.market handles vs. AIM Data handles</h3>
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
                      AIM Data handles
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

      <section id="specialists" className="bg-white py-16 sm:py-20" aria-labelledby="specialists-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">Specialists</p>
              <h2 id="specialists-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">
                Build a business on ai.market.
              </h2>
              <p className="mt-6 text-base leading-7 text-gray-600">
                Some of the best partners are not bringing their own data and are not plugging in their own product. They want to make a living working inside the market itself. They know data, they know buyers, and they are good at getting deals done. We want more of them.
              </p>
              <p className="mt-5 text-base leading-7 text-gray-600">
                A specialist earns by helping other people transact on ai.market, or by building and listing data products of their own. allAI does the heavy lifting on metadata, classification and listing quality, so a specialist spends their time where it counts, on the relationships and the judgment that turn raw data into something that sells. You set your own prices. We take 5% when something sells and nothing else.
              </p>
              <a
                href="mailto:support@ai.market?subject=Specialist%20Inquiry"
                className="mt-8 inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
              >
                Talk to us
              </a>
            </div>

            <div>
              <div className="rounded-2xl border border-[#D8EEE6] bg-[#F7FCFA] p-6 shadow-sm sm:p-8">
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">Start with public data.</h3>
                <p className="mt-4 text-base leading-7 text-gray-600">
                  Here is one of the best ways in, and it does not need a single client. A huge amount of valuable data is technically public and a real pain to actually use. It is scattered, badly formatted, out of date, and there is nobody to call when it breaks. If you can find it, clean it up, package it so a buyer or an AI agent can actually use it, and keep it current, that is a product. You list it and you charge a fair convenience fee for the work you saved everyone. We have talked to people in bioscience who tell us getting public data is a nightmare and they would gladly pay a fair rate if someone just made it easy. That gap is the opportunity.
                </p>
              </div>

              <div className="mt-8">
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">Here is the kind of specialist we are looking for:</h3>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {specialistTypes.map((item) => (
                    <article key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h4 className="text-base font-semibold text-gray-900">{item.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">Why do this on ai.market?</h3>
                <p className="mt-4 text-base leading-7 text-gray-600">
                  The model is simple. You set your own pricing and keep what you earn, and we take 5% only when a deal closes. No listing fees. So your incentive and ours are the same, more good data changing hands. The rails are non-custodial, so raw data never touches us, and it never touches you unless your client wants it to. allAI does the grunt work so you can focus on the part only a person can do.
                </p>
                <p className="mt-5 text-base font-semibold leading-7 text-gray-900">Want in? Talk to us.</p>
              </div>
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
              A partner can list with <Link href="#data-partner" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">AIM Data</Link>, integrate <Link href="#technology-partner" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">AIM Data</Link>, or work as a <Link href="#specialists" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">Specialist</Link>{' '}
              at the same time. That path works well for platforms that want to sell their own datasets while also giving their customers programmatic access to the broader ai.market catalog.
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
            , or{' '}
            <Link href="/sell-data" className="font-semibold text-[#3F51B5] hover:text-[#303F9F]">
              Sell Data
            </Link>
            .
          </p>
        </div>
      </section>
      </div>
    </>
  );
}
