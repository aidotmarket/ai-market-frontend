import type { Metadata } from 'next';
import SellDataCta from '@/components/SellDataCta';

const description = 'AIM Data is an open-source Docker gateway that lists files on your own infrastructure. Confirm each file before sharing its structural description with ai.market.';

export const metadata: Metadata = {
  title: 'AIM Data gateway | ai.market',
  description,
  openGraph: {
    title: 'AIM Data gateway | ai.market',
    description,
    url: 'https://ai.market/aim-data',
    siteName: 'ai.market',
    images: ['/og/aim-data.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AIM Data gateway | ai.market',
    description,
    images: ['/og/aim-data.png'],
  },
};

const AIM_DATA_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AIM Data gateway',
    url: 'https://ai.market/aim-data',
    description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Linux (Docker)',
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    codeRepository: 'https://github.com/aidotmarket/aim-data-gateway',
    provider: { '@type': 'Organization', name: 'ai.market', url: 'https://ai.market' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai.market/' },
      { '@type': 'ListItem', position: 2, name: 'Sell Data', item: 'https://ai.market/sell-data' },
      { '@type': 'ListItem', position: 3, name: 'AIM Data gateway', item: 'https://ai.market/aim-data' },
    ],
  },
];

export default function AimDataPage() {
  return (
    <main className="bg-white">
      <script type="application/ld+json">{JSON.stringify(AIM_DATA_JSONLD)}</script>
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#0F6E56]">Sell Data</p>
        <h1 className="mt-3 text-4xl font-bold text-gray-900">AIM Data gateway</h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">
          AIM Data is a small open-source gateway you run with Docker on your own infrastructure.
          It lists your files where they are. Buyers download purchased files directly from
          your gateway, without routing file bytes through ai.market.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900">You choose what to describe</h2>
            <p className="mt-3 leading-7 text-gray-600">
              The gateway automatically sends opaque file IDs, keyed content commitments, file size,
              media type, and timestamps. It sends your display alias only if you set one; otherwise
              it uses a neutral name. Confirm each file before it sends
              column names, types, row count, bucketed null rates and distinct counts, and its
              raw SHA-256. No data values go to ai.market in these messages. You can separately
              publish a public sample on your listing. The gateway sends delivery receipts and
              signed audit entries for every outbound message.
            </p>
          </section>
          <section className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900">Locked down by design</h2>
            <p className="mt-3 leading-7 text-gray-600">
              The gateway refuses to start as root or the wrong user, with a writable root filesystem,
              any capability, no-new-privileges off, or a mounted socket. You must allow outbound
              access only to api.ai.market:443 using a restricted proxy or firewall and DNS. Its egress
              canary reports open access, which blocks publishing and new permissions. Images are
              signed and reproducible.
            </p>
          </section>
        </div>

        <section className="mt-10 rounded-2xl bg-[#F7FCFA] p-6">
          <h2 className="text-xl font-semibold text-gray-900">Set up your gateway</h2>
          <p className="mt-3 leading-7 text-gray-600">
            In Sell Data, open Gateways and choose Add a gateway. You get a one-time pairing code
            and a Docker Compose file. Manage listings, prices, licences, and payouts on the website.
          </p>
          <SellDataCta variant="self-hosted" className="mt-6" />
        </section>

        <p className="mt-8 text-sm leading-6 text-gray-600">
          The gateway source and image build are available on{' '}
          <a href="https://github.com/aidotmarket/aim-data-gateway" className="font-semibold text-[#0F6E56] underline">GitHub</a>.
        </p>
      </section>
    </main>
  );
}
