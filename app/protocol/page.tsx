'use client';

import Link from 'next/link';

const howItWorks = [
  {
    title: 'List',
    subtitle: 'Local Processing',
    body:
      "Sellers install AIM-Data (for datasets) or AIM-Node (for models and pipelines) on their own infrastructure. An embedded AI assistant profiles the asset locally — detecting PII, scoring quality, generating descriptions and metadata. Only the metadata is published to ai.market. Raw data and model weights never leave the seller's servers.",
  },
  {
    title: 'Discover',
    subtitle: 'Marketplace Matching',
    body:
      "Buyers and AI agents search ai.market's catalog using semantic search, filters, and structured queries. Every listing includes AI-generated quality scores, schema previews, and sample metadata — enough to evaluate fit without exposing the underlying asset.",
  },
  {
    title: 'Transact',
    subtitle: 'Platform Billing',
    body:
      'When a buyer commits, ai.market handles authentication, payment processing, and billing. The seller receives a cryptographically signed delivery token scoped to the specific transaction — time-limited, single-use, and auditable.',
  },
  {
    title: 'Deliver',
    subtitle: 'Peer-to-Peer',
    body:
      "The buyer's system connects directly to the seller's AIM-Data or AIM-Node instance using the delivery token. Data flows point-to-point over an encrypted channel. ai.market never proxies, caches, or stores the payload.",
  },
];

const platformDoes = [
  'Discovery: Semantic search, category browsing, and AI agent-accessible APIs for finding assets',
  'Authentication: Identity verification, API key management, and OAuth for all participants',
  'Trust: Cryptographic delivery tokens, mutual verification between nodes, session-scoped access',
  'Billing: Payment processing, usage metering, and seller payouts at 5% marketplace fee',
  'Observability: Transaction traces, delivery confirmations, and audit logs',
];

const platformDoesNot = [
  'Store data: No raw datasets, model weights, or pipeline outputs ever transit ai.market servers',
  'Proxy requests: Compute and data requests flow directly between buyer and seller nodes',
  'Access payloads: Delivery tokens are opaque to the platform — only the endpoints can decrypt them',
  'Lock in sellers: AIM-Data and AIM-Node are open, self-hosted tools — sellers own their infrastructure',
];

const encryptionSections = [
  {
    label: 'DEVICE IDENTITY',
    body:
      "Every AIM-Data and AIM-Node instance generates an Ed25519 keypair locally during first setup. The private key is stored in a passphrase-protected keystore on the device — it never leaves the seller's infrastructure. The corresponding public key is registered with ai.market during device enrollment. All subsequent operations — publishing listings, signing delivery receipts, reporting traces — are authenticated by Ed25519 signatures verified against the registered public key.",
  },
  {
    label: 'TRUST CHANNEL',
    body:
      'Communication between nodes and the platform uses W3C Verifiable Credentials with Ed25519Signature2020 proofs. Every message in the trust channel is wrapped in a signed credential envelope containing the event payload, a cryptographic signature, a timestamp, and a replay-prevention nonce. The platform maintains an Ed25519 signing key and an X25519 key exchange key for secure bidirectional communication.',
  },
  {
    label: 'DATA AT REST',
    body:
      'API keys are encrypted using Fernet symmetric encryption (AES-128-CBC with HMAC-SHA256 authentication), with keys derived via HKDF from the platform secret. TOTP secrets for two-factor authentication use AES-256-GCM authenticated encryption. Passwords are hashed with bcrypt. No raw data payloads are ever stored on the platform.',
  },
  {
    label: 'TRANSPORT SECURITY',
    body:
      'All API traffic is served over HTTPS with TLS. Platform JWTs use HMAC-SHA256 signing for session tokens. Device-to-platform authentication uses Ed25519-signed JWTs — a separate, stronger signing mechanism than the platform session tokens. Key rotation is supported with a 24-hour grace period to prevent service interruption during rollover.',
  },
  {
    label: 'TRUST SCORING',
    body:
      'Each node maintains a dynamic trust score computed from uptime history, key rotation compliance, successful delivery confirmations, and behavioral signals over a rolling 30-day window. Trust scores are visible to buyers and influence search ranking.',
  },
];

const stackRows = [
  {
    component: 'ai.market',
    role: 'Discovery, auth, billing, trust tokens',
    runner: 'ai.market (cloud)',
  },
  {
    component: 'AIM-Data',
    role: 'Dataset management, local AI profiling, P2P delivery',
    runner: 'Sellers (self-hosted)',
  },
  {
    component: 'AIM-Node',
    role: 'Model/pipeline serving, compute metering, P2P execution',
    runner: 'Providers (self-hosted)',
  },
  {
    component: 'allAI',
    role: 'Embedded AI for metadata generation and quality scoring',
    runner: 'Runs inside AIM-Data/AIM-Node',
  },
];

function CheckIcon() {
  return (
    <svg
      className="h-6 w-6 flex-shrink-0 text-[#0F6E56]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="h-6 w-6 flex-shrink-0 text-red-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function ProtocolPage() {
  return (
    <div className="bg-white">
      {/* HERO */}
      <section className="relative overflow-hidden bg-[#E1F5EE]">
        {/* Decorative blurred circles */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[#0F6E56]/20 blur-3xl" />
          <div className="absolute top-20 right-0 h-80 w-80 rounded-full bg-[#0F6E56]/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#0F6E56]/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 lg:px-8 py-24 sm:py-32 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight">
            The ai.market Protocol
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            A non-custodial marketplace protocol where data and compute assets are discovered
            centrally but delivered peer-to-peer. The platform never touches your payloads.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
            How It Works
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((card, idx) => (
              <div
                key={card.title}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-[#E1F5EE] text-[#0F6E56] font-bold">
                  {idx + 1}
                </div>
                <h3 className="mt-4 text-xl font-bold text-gray-900">{card.title}</h3>
                <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-[#0F6E56]">
                  {card.subtitle}
                </p>
                <p className="mt-4 text-sm text-gray-600 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT THE PLATFORM DOES */}
      <section className="bg-gray-50 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
            What the Platform Does
          </h2>
          <ul className="mt-12 space-y-5">
            {platformDoes.map((item) => {
              const [label, rest] = item.split(/: (.+)/);
              return (
                <li key={label} className="flex items-start gap-4">
                  <CheckIcon />
                  <p className="text-base text-gray-600 leading-relaxed">
                    <span className="font-semibold text-gray-900">{label}:</span> {rest}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* WHAT THE PLATFORM DOES NOT DO */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
            What the Platform Does NOT Do
          </h2>
          <ul className="mt-12 space-y-5">
            {platformDoesNot.map((item) => {
              const [label, rest] = item.split(/: (.+)/);
              return (
                <li key={label} className="flex items-start gap-4">
                  <XIcon />
                  <p className="text-base text-gray-600 leading-relaxed">
                    <span className="font-semibold text-gray-900">{label}:</span> {rest}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ENCRYPTION AND SECURITY */}
      <section className="bg-gray-50 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
            Encryption and Security
          </h2>
          <div className="mt-12 space-y-10">
            {encryptionSections.map((section) => (
              <div key={section.label}>
                <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#0F6E56]">
                  {section.label}
                </p>
                <p className="mt-3 text-base text-gray-600 leading-relaxed">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE STACK */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
            The Stack
          </h2>
          <div className="mt-12 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-[#E1F5EE]">
                <tr>
                  <th className="px-6 py-4 text-sm font-bold text-gray-900">Component</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-900">Role</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-900">Who Runs It</th>
                </tr>
              </thead>
              <tbody>
                {stackRows.map((row, idx) => (
                  <tr
                    key={row.component}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                      {row.component}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{row.role}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{row.runner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FOR DEVELOPERS */}
      <section className="bg-gray-50 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">For Developers</h2>
          <p className="mt-6 text-lg text-gray-600 leading-relaxed">
            The protocol is API-first. Every interaction — listing, searching, purchasing,
            delivering — is available as a REST endpoint. AI agents can discover and transact
            with data and compute assets programmatically without human intervention.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/listings"
              className="inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0c5a47] transition-colors"
            >
              Browse the Marketplace
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center justify-center rounded-lg border-2 border-[#0F6E56] px-6 py-3 text-sm font-semibold text-[#0F6E56] hover:bg-[#E1F5EE] transition-colors"
            >
              Start Selling
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
