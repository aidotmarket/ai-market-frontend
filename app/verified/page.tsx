import type { Metadata } from 'next';
import Link from 'next/link';

const title = 'What the verified label means | ai.market';
const description =
  "Seller-initiated verification measures the shape of listed data in the seller's own environment. Learn where the check runs, what it costs and what sellers choose to publish.";

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
              What the verified label means
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
              The verified label means the shape of the listed data was measured in the
              seller&apos;s own environment, at the stated date and within the stated scope. The
              seller chose to publish the findings.
            </p>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
              Verification is optional and started by the seller. Listing, sampling, selling and
              delivery never depend on it.
            </p>
          </div>
        </div>
      </section>

      <section
        id="where-the-check-runs"
        className="bg-white py-16 sm:py-20"
        aria-labelledby="where-the-check-runs-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="where-the-check-runs-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              Where the check runs
            </h2>
            <ul className="mt-6 space-y-6 text-base leading-8 text-gray-600 sm:text-lg">
              <li>
                <h3 className="font-semibold text-gray-900">AIM Data gateway</h3>
                <p>
                  For sellers who keep data on their own servers with our open-source, self-hosted
                  gateway. The check runs inside the gateway.
                </p>
              </li>
              <li>
                <h3 className="font-semibold text-gray-900">AWS S3</h3>
                <p>
                  You set up a verifier in your own AWS account using a CloudFormation stack.
                  ai.market gets no read access to your bucket.
                </p>
              </li>
              <li>
                <h3 className="font-semibold text-gray-900">Cloudflare R2</h3>
                <p>
                  This option is opening to sellers now. Install the verifier into your own
                  Cloudflare account with one click: Connect Cloudflare, approve, install. You need
                  a Cloudflare account with Workers Paid ($5/month plus usage).
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="bg-gray-50 py-16 sm:py-20"
        aria-labelledby="how-it-works-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="how-it-works-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              How it works, step by step
            </h2>
            <ol className="mt-6 list-decimal space-y-6 pl-6 text-base leading-8 text-gray-600 sm:text-lg">
              <li>
                Run the free check. It confirms the verifier can read the listed data and gives you
                a quote. There is no ai.market charge for this check; your own cloud resource costs
                may apply.
              </li>
              <li>
                Describe the data, accept the publication terms, then start the paid verification.
                A card hold of $1 to $25 is placed.
              </li>
              <li>
                Review the findings. They are private to you first. Nothing is published without
                your choice.
              </li>
              <li>
                Choose Publish all findings or Decline publication. You can later choose Withdraw
                findings.
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section
        id="what-it-costs"
        className="bg-white py-16 sm:py-20"
        aria-labelledby="what-it-costs-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="what-it-costs-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              What it costs
            </h2>
            <div className="mt-6 space-y-6 text-base leading-8 text-gray-600 sm:text-lg">
              <p>
                The final charge is twice the measured cloud AI cost, with a $1 minimum, and is
                never more than the hold or $25.
              </p>
              <p>
                Cancelling before the AI step voids the hold with no charge. The completed charge
                stands if you decide not to publish.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="what-it-is-not"
        className="bg-gray-50 py-16 sm:py-20"
        aria-labelledby="what-it-is-not-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="what-it-is-not-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              What buyers see, and what it does not mean
            </h2>
            <div className="mt-6 space-y-6 text-base leading-8 text-gray-600 sm:text-lg">
              <p>
                Buyers see a dated verification result on the listing, with the scope it covered.
                It describes what the scanner measured, such as row counts, column names and types,
                the share of missing values and value distributions.
              </p>
              <p>
                This is a measurement of the data&apos;s shape at a date. The data can change after
                that date. It is not a guarantee of quality, accuracy, legality or fitness for a
                purpose, or a statement about the seller&apos;s company.{' '}
                <Link href="/legal/terms" className={linkClassName}>
                  Read the Terms.
                </Link>
              </p>
              <p>
                Findings are signed by ai.market&apos;s verification service and checked on receipt.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="privacy-floor"
        className="bg-white py-16 sm:py-20"
        aria-labelledby="privacy-floor-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl rounded-3xl border border-[#D8EEE6] bg-[#F7FCFA] p-8 sm:p-10">
            <h2
              id="privacy-floor-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              Your data stays with you
            </h2>
            <div className="mt-6 space-y-6 text-base leading-8 text-gray-600 sm:text-lg">
              <p>
                Raw data never leaves your environment. Only approved aggregate and structural
                findings and your consent record reach ai.market. We never receive cell values,
                sample rows, file locations or credentials from verification.
              </p>
              <p>
                Some statistics can reveal individual records. Missing-value rates, distinct-value
                estimates and distribution buckets have a privacy floor. If a statistic would
                reflect fewer underlying values than the floor allows, it is withheld and the
                report shows a privacy label in its place. The floor does not hide structural facts
                such as row counts and column names when the report includes them.
              </p>
              <p>
                The privacy floor is enforced before findings are sent and again by our servers,
                using the same arithmetic. A report containing a number the floor forbids does not
                get verified.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-to-start"
        className="bg-gray-50 py-16 sm:py-20"
        aria-labelledby="how-to-start-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2
              id="how-to-start-heading"
              className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl"
            >
              How to start (for sellers)
            </h2>
            <p className="mt-6 text-base leading-8 text-gray-600 sm:text-lg">
              Open{' '}
              <Link href="/dashboard/listings" className={linkClassName}>
                Listings in your dashboard
              </Link>
              , then open the published listing and choose Verify this data.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
