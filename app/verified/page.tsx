import type { Metadata } from 'next';
import Link from 'next/link';

const title = 'What our verified shape label means | ai.market';
const description =
  "When you see the verified shape label on a listing, it means our scanner measured the shape of that dataset in the seller's environment, at the stated point in time, and the published result carries cryptographic proof that it arrived unaltered.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: '/verified',
  },
  openGraph: {
    title,
    description,
    url: 'https://ai.market/verified',
    siteName: 'ai.market',
    type: 'website',
  },
};

const linkClassName =
  'font-medium text-[#0F6E56] underline decoration-[#9ACFBB] underline-offset-4 transition-colors hover:text-[#0c5a47]';

export default function VerifiedPage() {
  return (
    <div className="overflow-hidden bg-white">
      <section
        id="what-it-means"
        className="relative isolate bg-gradient-to-b from-[#F7FCFA] to-white"
        aria-labelledby="what-it-means-heading"
      >
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-36 right-0 h-[26rem] w-[26rem] rounded-full bg-[#E1F5EE] opacity-80 blur-3xl" />
          <div className="absolute top-16 -left-20 h-[20rem] w-[20rem] rounded-full bg-[#D6F0E6] opacity-70 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-4xl">
            <h1
              id="what-it-means-heading"
              className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl"
            >
              What our verified shape label means
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
              When you see the verified shape label on a listing, it means{' '}
              <Link href="/protocol" className={linkClassName}>
                our scanner
              </Link>{' '}
              measured the shape of that dataset in the seller&apos;s environment, at the stated
              point in time, and the published result carries cryptographic proof that it arrived
              unaltered. Not the seller&apos;s claims about the data. A measurement, from a tool the
              seller cannot quietly edit.
            </p>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="bg-white py-16 sm:py-20"
        aria-labelledby="how-it-works-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="how-it-works-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              How it works
            </h2>
            <div className="mt-6 space-y-6 text-base leading-8 text-gray-600 sm:text-lg">
              <p>
                The seller installs our scanner and it runs where the data lives. It sends us only
                the signed shape report. The raw data stays in the seller&apos;s environment, we do not
                receive it. That is by design. A marketplace that holds everyone&apos;s data is a
                marketplace nobody should trust.
              </p>
              <p>
                The scanner reads the dataset and produces a report of its shape at that moment. Row
                counts, with the counting method stated on the report. Column names and types. The
                share of missing values in each column. An estimate of how many distinct values each
                column holds, with its margin stated. How values are distributed by size and length.
              </p>
              <p>
                The report is signed with a private key created on the seller&apos;s machine at install.
                Only its public half is shared with us, so our servers can check the signature. On
                receipt we verify the signature and independently recompute the report&apos;s fingerprint
                from its contents. If the signed measurements were altered after signing, the report
                is rejected. The same privacy and consistency checks the scanner applies before
                sending, our servers apply again on receipt. Both sides have to agree.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="privacy-floor"
        className="bg-gray-50 py-16 sm:py-20"
        aria-labelledby="privacy-floor-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl rounded-3xl border border-[#D8EEE6] bg-[#F7FCFA] p-8 sm:p-10">
            <h2
              id="privacy-floor-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              The privacy floor
            </h2>
            <p className="mt-6 text-base leading-8 text-gray-600 sm:text-lg">
              Some statistics can quietly reveal individual records. A column where only two values
              are missing says something about two specific rows. So the statistics that could do
              this, missing-value rates, distinct-value estimates, and distribution buckets, have a
              floor. If one would reflect fewer underlying values than the floor allows, it is
              withheld and the report shows a privacy label in its place. Structural facts like row
              counts and column names are not statistics about individuals and are always shown. The
              floor is enforced twice, once by the scanner before anything is sent and once by our
              servers, using the same arithmetic. A report that tries to carry a number the floor
              forbids does not get verified.
            </p>
          </div>
        </div>
      </section>

      <section
        id="what-it-is-not"
        className="bg-white py-16 sm:py-20"
        aria-labelledby="what-it-is-not-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="what-it-is-not-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              What the label is not
            </h2>
            <div className="mt-6 space-y-6 text-base leading-8 text-gray-600 sm:text-lg">
              <p>
                <Link href="/legal/terms" className={linkClassName}>
                  It is a snapshot, not a promise about the future.
                </Link>{' '}
                The data can change after the timestamp, and the label always shows you when the
                measurement was taken.
              </p>
              <p>
                It is not an opinion on whether the data is good, accurate, or right for your use. It
                tells you what is there, not whether you should want it.
              </p>
              <p>
                And it is not based on us reading the data. We verify shape, at arm&apos;s length, with
                cryptographic proof. What the data says remains between you and the seller.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="why" className="bg-gray-50 py-16 sm:py-20" aria-labelledby="why-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="why-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              Why we built it this way
            </h2>
            <p className="mt-6 text-base leading-8 text-gray-600 sm:text-lg">
              Buying data usually means trusting a stranger&apos;s spreadsheet about their own product.
              We think you should be able to see what a dataset actually looks like before you pay,
              measured by a tool the seller cannot quietly edit, published by a marketplace that
              does not hold the data. The seller chooses what the scanner points at, the label tells
              you honestly what was there when it looked. That is the whole idea.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
