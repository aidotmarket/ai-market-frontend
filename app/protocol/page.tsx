'use client';

import Link from 'next/link';

const howItWorks = [
  {
    eyebrow: 'List',
    title: 'Local Processing',
    description:
      "Sellers install AIM-Data (for datasets) or AIM-Node (for models and pipelines) on their own infrastructure. An embedded AI assistant profiles the asset locally — detecting PII, scoring quality, generating descriptions and metadata. Only the metadata is published to ai.market. Raw data and model weights never leave the seller's servers.",
  },
  {
    eyebrow: 'Discover',
    title: 'Marketplace Matching',
    description:
      "Buyers and AI agents search ai.market's catalog using semantic search, filters, and structured queries. Every listing includes AI-generated quality scores, schema previews, and sample metadata — enough to evaluate fit without exposing the underlying asset.",
  },
  {
    eyebrow: 'Transact',
    title: 'Platform Billing',
    description:
      'When a buyer commits, ai.market handles authentication, payment processing, and billing. The seller receives a cryptographically signed delivery token scoped to the specific transaction — time-limited, single-use, and auditable.',
  },
  {
    eyebrow: 'Deliver',
    title: 'Peer-to-Peer',
    description:
      "The buyer's system connects directly to the seller's AIM-Data or AIM-Node instance using the delivery token. Data flows point-to-point over an encrypted channel. ai.market never proxies, caches, or stores the payload.",
  },
];

const platformDoes = [
  {
    label: 'Discovery',
    description:
      'Semantic search, category browsing, and AI agent-accessible APIs for finding assets',
  },
  {
    label: 'Authentication',
    description: 'Identity verification, API key management, and OAuth for all participants',
  },
  {
    label: 'Trust',
    description:
      'Cryptographic delivery tokens, mutual verification between nodes, session-scoped access',
  },
  {
    label: 'Billing',
    description: 'Payment processing, usage metering, and seller payouts at 5% marketplace fee',
  },
  {
    label: 'Observability',
    description: 'Transaction traces, delivery confirmations, and audit logs',
  },
];

const platformDoesNot = [
  {
    label: 'Store data',
    description:
      'No raw datasets, model weights, or pipeline outputs ever transit ai.market servers',
  },
  {
    label: 'Proxy requests',
    description: 'Compute and data requests flow directly between buyer and seller nodes',
  },
  {
    label: 'Access payloads',
    description:
      'Delivery tokens are opaque to the platform — only the endpoints can decrypt them',
  },
  {
    label: 'Lock in sellers',
    description:
      'AIM-Data and AIM-Node are open, self-hosted tools — sellers own their infrastructure',
  },
];

const securitySections = [
  {
    label: 'DEVICE IDENTITY',
    description:
      "Every AIM-Data and AIM-Node instance generates an Ed25519 keypair locally during first setup. The private key is stored in a passphrase-protected keystore on the device — it never leaves the seller's infrastructure. The corresponding public key is registered with ai.market during device enrollment. All subsequent operations — publishing listings, signing delivery receipts, reporting traces — are authenticated by Ed25519 signatures verified against the registered public key.",
  },
  {
    label: 'TRUST CHANNEL',
    description:
      'Communication between nodes and the platform uses W3C Verifiable Credentials with Ed25519Signature2020 proofs. Every message in the trust channel is wrapped in a signed credential envelope containing the event payload, a cryptographic signature, a timestamp, and a replay-prevention nonce. The platform maintains an Ed25519 signing key and an X25519 key exchange key for secure bidirectional communication.',
  },
  {
    label: 'DATA AT REST',
    description:
      'API keys are encrypted using Fernet symmetric encryption (AES-128-CBC with HMAC-SHA256 authentication), with keys derived via HKDF from the platform secret. TOTP secrets for two-factor authentication use AES-256-GCM authenticated encryption. Passwords are hashed with bcrypt. No raw data payloads are ever stored on the platform.',
  },
  {
    label: 'TRANSPORT SECURITY',
    description:
      'All API traffic is served over HTTPS with TLS. Platform JWTs use HMAC-SHA256 signing for session tokens. Device-to-platform authentication uses Ed25519-signed JWTs — a separate, stronger signing mechanism than the platform session tokens. Key rotation is supported with a 24-hour grace period to prevent service interruption during rollover.',
  },
  {
    label: 'TRUST SCORING',
    description:
      'Each node maintains a dynamic trust score computed from uptime history, key rotation compliance, successful delivery confirmations, and behavioral signals over a rolling 30-day window. Trust scores are visible to buyers and influence search ranking.',
  },
];

const stackRows = [
  {
    component: 'ai.market',
    role: 'Discovery, auth, billing, trust tokens',
    operator: 'ai.market (cloud)',
  },
  {
    component: 'AIM-Data',
    role: 'Dataset management, local AI profiling, P2P delivery',
    operator: 'Sellers (self-hosted)',
  },
  {
    component: 'AIM-Node',
    role: 'Model/pipeline serving, compute metering, P2P execution',
    operator: 'Providers (self-hosted)',
  },
  {
    component: 'allAI',
    role: 'Embedded AI for metadata generation and quality scoring',
    operator: 'Runs inside AIM-Data/AIM-Node',
  },
];

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 shrink-0 text-[#0F6E56]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
    </svg>
  );
}

function DotIcon() {
  return <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F6E56]" />;
}

export default function ProtocolPage() {
  // Build a page with these sections:
  // Use the same decorative blurred circles as other pages for the hero background
  return (
    <div className="overflow-hidden bg-white">
      <section className="relative isolate bg-white">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-36 right-0 h-[26rem] w-[26rem] rounded-full bg-[#E1F5EE] opacity-80 blur-3xl" />
          <div className="absolute top-16 -left-20 h-[20rem] w-[20rem] rounded-full bg-[#D6F0E6] opacity-70 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-[18rem] w-[18rem] rounded-full bg-[#EAF8F2] opacity-90 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center rounded-full bg-[#E1F5EE] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">
              Non-Custodial Architecture
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              The ai.market Protocol
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
              A non-custodial marketplace protocol where data and compute assets are discovered
              centrally but delivered peer-to-peer. The platform never touches your payloads.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
              How It Works
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Central discovery, direct delivery
            </h2>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((card, index) => (
              <div
                key={card.eyebrow}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,110,86,0.06)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E1F5EE] text-sm font-bold text-[#0F6E56]">
                  {index + 1}
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
                  {card.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-gray-900">{card.title}</h3>
                <p className="mt-4 text-sm leading-7 text-gray-600">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-[#D8EEE6] bg-[#F7FCFA] p-8 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
              What the Platform Does
            </p>
            <div className="mt-8 space-y-5">
              {platformDoes.map((item) => (
                <div key={item.label} className="flex items-start gap-4">
                  <CheckIcon />
                  <p className="text-base leading-7 text-gray-600">
                    <span className="font-semibold text-gray-900">{item.label}:</span>{' '}
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
              What the Platform Does NOT Do
            </p>
            <div className="mt-8 space-y-5">
              {platformDoesNot.map((item) => (
                <div key={item.label} className="flex items-start gap-4">
                  <DotIcon />
                  <p className="text-base leading-7 text-gray-600">
                    <span className="font-semibold text-gray-900">{item.label}:</span>{' '}
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
              Encryption &amp; Security
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Security primitives designed for non-custodial delivery
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              The platform coordinates trust, authentication, and billing without taking custody
              of datasets, weights, or pipeline outputs.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {securitySections.map((section) => (
              <div
                key={section.label}
                className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
                  {section.label}
                </p>
                <p className="mt-4 text-sm leading-7 text-gray-600">{section.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
              The Stack
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Platform responsibilities are explicitly separated
            </h2>
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-gray-200">
            <table className="min-w-full border-separate border-spacing-0 text-left">
              <thead className="bg-[#E1F5EE]">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Component</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Role</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Who Runs It</th>
                </tr>
              </thead>
              <tbody>
                {stackRows.map((row, index) => (
                  <tr key={row.component} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                      {row.component}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{row.role}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{row.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6E56]">
            For Developers
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            API-first by design
          </h2>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            The protocol is API-first. Every interaction — listing, searching, purchasing,
            delivering — is available as a REST endpoint. AI agents can discover and transact
            with data and compute assets programmatically without human intervention.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/listings"
              className="inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0C5A47]"
            >
              Browse the Marketplace
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center justify-center rounded-lg border border-[#0F6E56] bg-white px-6 py-3 text-sm font-semibold text-[#0F6E56] transition-colors hover:bg-[#E1F5EE]"
            >
              Start Selling
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
