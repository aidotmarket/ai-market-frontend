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

export default function AimDataPage() {
  return (
    <main className="bg-white">
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#0F6E56]">Sell Data</p>
        <h1 className="mt-3 text-4xl font-bold text-gray-900">AIM Data gateway</h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">
          AIM Data is a small open-source gateway you run with Docker on your own infrastructure.
          It lists your files where they are. Your files leave your systems only when a buyer
          downloads a purchase directly from your gateway.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900">You choose what to describe</h2>
            <p className="mt-3 leading-7 text-gray-600">
              Confirm each file on ai.market before the gateway sends its structural description:
              column names, types, and row counts. It never sends data values.
            </p>
          </section>
          <section className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900">Locked down by design</h2>
            <p className="mt-3 leading-7 text-gray-600">
              The gateway runs without admin rights, with read-only file access and no outbound
              access except to ai.market. It refuses to start if those limits are loosened.
              Its images are signed and reproducible.
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
