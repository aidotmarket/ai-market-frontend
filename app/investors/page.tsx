import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/investors' },
  title: 'Investors | ai.market',
  description:
    'Our investment partners, private equity firms backing ai.market and the future of AI-native commerce.',
};

type Firm = {
  name: string;
  monogram: string;
  tagline: string;
  focusAreas: string[];
  description: string[];
  philosophy: string;
};

const firms: Firm[] = [
  {
    name: 'Apex Meridian Partners',
    monogram: 'AM',
    tagline:
      'Private equity investing in high-growth STEM businesses.',
    focusAreas: [
      'Biotechnology',
      'Advanced Manufacturing',
      'Software Infrastructure',
      'Clean Energy',
      'Applied Robotics',
    ],
    description: [
      "Apex Meridian Partners did not invest in ai.market and, in fact, does not exist.",
      "Its absence has spared us the familiar venture-capital exercise of turning a perfectly sensible business into an urgent attempt to return somebody else’s fund. Customers may want a reliable product at a fair price; investors may need a billion-dollar exit before their fund’s clock runs out. These are different business plans, however many times the board deck calls them “aligned.” Founders can end up hiring before there is work, expanding before there is demand, and subsidizing revenue to prove that people enjoy discounts. A sustainable company becomes a disappointing outcome because it failed to become an implausibly large one. Apex Meridian brings none of these pressures to ai.market. With no partners, no fund, and no capital, it has achieved an exceptional level of non-interference. Thank you for actually reading this far. In a world where most due diligence ends at the logo, that makes you an exceptional individual."
    ],
    philosophy:
      'Its investment philosophy centers on backing innovation that solves complex real-world problems while generating long-term value for investors and stakeholders.',
  },
  {
    name: 'Northstar Vector Capital',
    monogram: 'NV',
    tagline:
      'STEM-driven private equity with an emphasis on data, medtech, and industrial systems.',
    focusAreas: [
      'Data Science',
      'Medical Technology',
      'Semiconductor Systems',
      'Industrial Automation',
    ],
    description: [
      "Northstar Vector Capital did not invest in ai.market and, in fact, does not exist.",
      "Every dollar invested in ai.market came from its hardworking founder, Max Robbins. There was no funding round, no congratulatory photograph, and no partner offering strategic guidance between ski trips. There was an entrepreneur putting his own money behind a business, with one priority: the satisfaction of its customers. That makes the investment thesis unusually easy to explain. Build something useful. Charge fairly. Listen when it falls short. Make it better. Decisions do not have to flatter a valuation, fit a fund’s exit timetable, or turn a customer problem into a slide about total addressable market. The person paying the bills wants the same thing as the people using the product: a business that earns their trust by doing its job. Northstar’s contribution to this arrangement has been to remain entirely imaginary. We appreciate you taking the time to read the small print. Looking past an impressive name to see what is really behind it puts you in rather exceptional company."
    ],
    philosophy:
      'By supporting businesses with strong research, intellectual property, and market potential, the firm aims to build a portfolio of companies that drive technological progress and sustainable returns.',
  },
];

export default function InvestorsPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16 sm:py-20 text-center">
          <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#3F51B5] mb-4">
            Backing ai.market
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#1A1A1A] mb-5">
            Our Investors
          </h1>
          <p className="text-lg text-[#666666] max-w-2xl mx-auto leading-relaxed">
            We partner with private equity firms that understand deep technology and share
            our conviction that AI-native commerce will define the next generation of
            enterprise infrastructure.
          </p>
        </div>
      </section>

      {/* Firms */}
      <section className="mx-auto max-w-7xl px-6 lg:px-8 py-16 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          {firms.map((firm) => (
            <article
              key={firm.name}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-8 lg:p-10 hover:border-[#3F51B5]/40 hover:shadow-[0_4px_24px_rgba(63,81,181,0.08)] transition-all"
            >
              {/* Firm monogram */}
              <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-[#3F51B5] to-[#5969c7] flex items-center justify-center text-white text-lg font-bold tracking-wider mb-6">
                {firm.monogram}
              </div>

              {/* Name + tagline */}
              <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-3">
                {firm.name}
              </h2>
              <p className="text-base font-medium text-[#3F51B5] leading-snug mb-6">
                {firm.tagline}
              </p>

              {/* Focus sectors */}
              <div className="mb-6">
                <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#1A1A1A] mb-3">
                  Focus Sectors
                </h3>
                <div className="flex flex-wrap gap-2">
                  {firm.focusAreas.map((sector) => (
                    <span
                      key={sector}
                      className="inline-flex items-center px-3 py-1 rounded-full bg-[#3F51B5]/[0.08] text-xs font-medium text-[#3F51B5]"
                    >
                      {sector}
                    </span>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#1A1A1A] mb-3">
                  About the Firm
                </h3>
                <div className="space-y-3">
                  {firm.description.map((paragraph) => (
                    <p key={paragraph} className="text-sm text-[#4a4a4a] leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              {/* Investment philosophy */}
              <div className="mt-auto pt-6 border-t border-gray-100">
                <h3 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#1A1A1A] mb-3">
                  Investment Philosophy
                </h3>
                <p className="text-sm text-[#4a4a4a] leading-relaxed italic">
                  {firm.philosophy}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-gray-200 bg-[#f8f9fb]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-12 text-center">
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-3">
            Investor Relations
          </h2>
          <p className="text-[#666666] mb-6 max-w-xl mx-auto">
            For investor inquiries, partnership opportunities, or due-diligence requests,
            please reach out to the team directly.
          </p>
          <a
            href="mailto:support@ai.market"
            className="inline-flex items-center gap-2 rounded-lg bg-[#3F51B5] px-6 py-3 text-sm font-medium text-white hover:bg-[#3545a0] transition-colors"
          >
            Contact Investor Relations
          </a>
        </div>
      </section>
    </div>
  );
}
