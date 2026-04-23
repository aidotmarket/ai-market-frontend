import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Investors | ai.market',
  description:
    'Our investment partners — private equity firms backing ai.market and the future of AI-native commerce.',
};

type Firm = {
  name: string;
  monogram: string;
  tagline: string;
  focusAreas: string[];
  description: string;
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
    description:
      'Apex Meridian Partners is a private equity firm focused on investing in high-growth STEM businesses across biotechnology, advanced manufacturing, software infrastructure, clean energy, and applied robotics. The firm specializes in identifying companies with strong technical foundations and helping them scale through strategic capital investment, operational improvement, and market expansion. Apex Meridian Partners is known for combining deep scientific and engineering insight with disciplined financial analysis, allowing it to support founder-led and emerging companies as they transition into larger, more competitive enterprises.',
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
    description:
      'Northstar Vector Capital specializes in STEM-driven private equity opportunities, with a particular emphasis on data science, medical technology, semiconductor systems, and industrial automation. The firm works closely with management teams to strengthen governance, improve efficiency, and accelerate commercialization of breakthrough technologies. Northstar Vector Capital stands out for its ability to evaluate both technical potential and financial performance, making it a strong partner for companies operating at the intersection of innovation and scalable business growth.',
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
                <p className="text-sm text-[#4a4a4a] leading-relaxed">
                  {firm.description}
                </p>
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
            href="mailto:ir@ai.market"
            className="inline-flex items-center gap-2 rounded-lg bg-[#3F51B5] px-6 py-3 text-sm font-medium text-white hover:bg-[#3545a0] transition-colors"
          >
            Contact Investor Relations
          </a>
        </div>
      </section>
    </div>
  );
}
