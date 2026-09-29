import type { Metadata } from 'next';
import Link from 'next/link';

const description = 'Connect Claude to ai.market to view your account, find data listings, and read your activity and data requests.';

export const metadata: Metadata = {
  title: 'Use ai.market in Claude | ai.market',
  description,
  alternates: { canonical: '/docs/connector' },
  openGraph: {
    title: 'Use ai.market in Claude | ai.market',
    description,
    url: 'https://ai.market/docs/connector',
    siteName: 'ai.market',
    type: 'article',
  },
};

const tools = [
  ['Get my account', 'View your account, current organization, connection, and seller profile status.'],
  ['Search data listings', 'Find published data listings by search term or category.'],
  ['Inspect a data listing', 'View one published listing, including its public description and available preview.'],
  ['View my activity', 'View short summaries of your notifications and connector activity.'],
  ['List my data requests', 'View your data requests without exposing the requester identity.'],
];

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Use ai.market in Claude',
  description,
  url: 'https://ai.market/docs/connector',
  publisher: { '@type': 'Organization', name: 'ai.market', url: 'https://ai.market' },
};

export default function ConnectorDocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-700 lg:py-24">
      <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      <h1 className="text-3xl font-bold text-gray-900">Use ai.market in Claude</h1>
      <p className="mt-5 leading-7">
        You can use our connector to find listings and view your ai.market information in Claude.
        Access is currently limited to an early access allowlist. A connection may be unavailable
        until we enable it for your account.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">What you can do</h2>
        <p className="mt-3 leading-7">The Claude connector has these tools. Each one only reads information. None changes your account or a listing.</p>
        <ul className="mt-4 list-disc space-y-2 pl-6 leading-7">
          {tools.map(([name, detail]) => <li key={name}><strong>{name}:</strong> {detail}</li>)}
        </ul>
        <p className="mt-3 leading-7">Some tools may be unavailable during early access.</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">How to connect</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-6 leading-7">
          <li>In Claude, add a custom connector with the URL <code>https://connect.ai.market/mcp</code>.</li>
          <li>Sign in to your ai.market account when prompted.</li>
          <li>Review the requested permissions on our consent screen before you approve access.</li>
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">Permissions</h2>
        <p className="mt-3 leading-7">You choose whether to grant these permissions:</p>
        <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">
          <li><strong>View your account:</strong> See your account details, current organization, and activity.</li>
          <li><strong>Browse the marketplace:</strong> Search public listings, read listing details, and view your data requests.</li>
        </ul>
        <p className="mt-3 leading-7">The connector only receives access to the permissions you approve.</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">What the connector cannot do</h2>
        <p className="mt-3 leading-7">You cannot pay or move money in Claude. Checkout happens on ai.market. Buyers and sellers do not talk directly; allAI mediates their contact. Raw customer data does not pass through ai.market.</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">How to disconnect</h2>
        <p className="mt-3 leading-7">In ai.market, open Settings, then Connected apps, and revoke Claude&apos;s access. Also remove or revoke the connector in Claude.</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">Help and privacy</h2>
        <p className="mt-3 leading-7">Visit <Link className="text-[#3F51B5] underline" href="/support">Support</Link> or email <a className="text-[#3F51B5] underline" href="mailto:support@ai.market">support@ai.market</a>. Read our <Link className="text-[#3F51B5] underline" href="/legal/privacy">Privacy Notice</Link>.</p>
      </section>
    </main>
  );
}
