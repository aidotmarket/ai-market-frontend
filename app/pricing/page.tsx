import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing and fees — ai.market',
  description: 'The complete ai.market fee schedule for data buyers and sellers.',
  alternates: {
    canonical: '/pricing',
  },
};

const feeCards = [
  {
    audience: 'Sellers',
    headline: 'List free. Keep 95% when data sells.',
    details: [
      'There are no listing fees.',
      'ai.market deducts a 5% commission from each successful transaction.',
      'The seller receives the remaining 95% of the listing price.',
    ],
  },
  {
    audience: 'Buyers',
    headline: 'Pay the listing price plus transaction costs.',
    details: [
      'Buyers do not pay the 5% marketplace commission on top of the listing price.',
      'Buyers pay the applicable payment-provider costs, including Stripe, stablecoin, or escrow fees.',
      'Applicable sales tax, VAT, or similar tax is added where required.',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="bg-white">
      <section className="border-b border-gray-200 bg-[#f7f8fc]">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#3F51B5]">Pricing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            One published fee schedule.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-gray-600">
            Sellers list for free and pay 5% only when a transaction succeeds. Buyers pay the
            listing price, payment-provider costs, and any applicable tax.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-6 py-14 sm:py-18">
        <div className="grid gap-6 md:grid-cols-2">
          {feeCards.map((card) => (
            <section key={card.audience} className="rounded-2xl border border-gray-200 p-7 shadow-sm">
              <p className="text-sm font-semibold text-[#3F51B5]">{card.audience}</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{card.headline}</h2>
              <ul className="mt-5 space-y-3 text-base leading-7 text-gray-700">
                {card.details.map((detail) => (
                  <li key={detail} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#3F51B5]" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl bg-[#1b2332] p-7 text-white sm:p-9">
          <h2 className="text-2xl font-bold">Before you confirm a purchase</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[#c1c9d4]">
            Review the checkout total for the listing price, the transaction-specific payment
            costs, and any tax. Provider costs vary by payment method, so ai.market does not quote
            one fixed processing-fee amount on this page.
          </p>
        </section>

        <section className="mt-10 border-t border-gray-200 pt-8">
          <h2 className="text-xl font-semibold text-gray-900">The legal schedule</h2>
          <p className="mt-3 text-base leading-7 text-gray-700">
            Section 5 of the ai.market Terms and Conditions is the authoritative fee schedule and
            explains commission, transaction costs, payment handling, and taxes in full.
          </p>
          <Link href="/legal/terms#fees" className="mt-4 inline-flex font-semibold text-[#3F51B5] hover:underline">
            Read Section 5 of the Terms →
          </Link>
        </section>
      </main>
    </div>
  );
}
