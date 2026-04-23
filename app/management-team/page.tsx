import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Management Team | ai.market',
  description:
    'Meet the leadership team behind ai.market — the non-custodial B2B marketplace for AI data, models, and pipelines.',
};

type LeaderSection = {
  label: string;
  items: string[];
};

type Leader = {
  name: string;
  title: string;
  tagline: string;
  bio: string;
  imageSrc: string;
  experience: string[];
  education: string[];
  expertise: string[];
};

const team: Leader[] = [
  {
    name: 'Max Robbins',
    title: 'CHIEF EXECUTIVE OFFICER',
    imageSrc: '/team/max-robbins.png',
    tagline:
      'Founder and entrepreneur building the infrastructure for AI-native commerce.',
    bio:
      'Max Robbins is a three-time exited founder in cutting-edge technology companies. He founded ai.market to create the first non-custodial B2B marketplace purpose-built for AI data, models, and pipelines. He is focused on designing a market operated primarily by AI agents, with humans providing strategic oversight and direction.',
    experience: [
      'Founder of ai.market, the non-custodial B2B marketplace for AI data, models, and pipelines.',
      'Founder of AICACHE LTD, sold to NBC Universal.',
      'CTO of IDT Corp (NYSE).',
    ],
    education: [
      'B.S., Georgetown University',
      'Telecommunications Studies, Columbia University',
    ],
    expertise: [
      'Marketplace Strategy',
      'Agent Orchestration',
      'Product & Go-to-Market',
      'Systems Architecture',
    ],
  },
  {
    name: 'Dr. Sarah Lin',
    title: 'EXECUTIVE VICE PRESIDENT',
    imageSrc: '/team/sarah-lin.png',
    tagline:
      'STEM innovator and strategic leader with 20+ years building and scaling technology ventures.',
    bio:
      'Dr. Sarah Lin is a proven technology executive with deep expertise in engineering, product innovation, and organizational growth. She has a track record of turning complex scientific advances into market-leading solutions.',
    experience: [
      'Former VP of Engineering at PeopleSoft, where she led the development of customer support systems from lab to commercialization.',
      'Held senior engineering leadership roles at Boeing and Raytheon Technologies.',
      'Published researcher in nanotechnology and materials science with 30+ peer-reviewed papers.',
    ],
    education: [
      'Ph.D. in Materials Science and Engineering, MIT',
      'M.S. in Electrical Engineering, Stanford University',
      'B.S. in Applied Physics, California Institute of Technology',
    ],
    expertise: [
      'Technology Strategy',
      'Product Innovation',
      'R&D Leadership',
      'Scaling Organizations',
    ],
  },
  {
    name: 'Michelle Carter, CFA',
    title: 'CHIEF FINANCIAL OFFICER',
    imageSrc: '/team/michelle-carter.png',
    tagline:
      'Finance leader with 15+ years driving financial strategy, capital markets, and value creation.',
    bio:
      'Michelle Carter is a seasoned finance executive with extensive experience in corporate finance, fundraising, investor relations, and operational excellence across high-growth technology companies.',
    experience: [
      'Former VP of Finance at EDS, where she led FP&A, Treasury, and Investor Relations prior to acquisition.',
      'Prior experience in investment banking at Goldman Sachs in the Technology, Media & Telecommunications group.',
      'Expertise in financial modeling, capital raising, M&A, and building high-performance finance teams.',
    ],
    education: [
      'M.B.A., Northwestern University — Kellogg School of Management',
      'B.S. in Finance, University of Illinois at Urbana-Champaign',
      'Chartered Financial Analyst (CFA)',
    ],
    expertise: [
      'Financial Strategy',
      'Capital Markets',
      'FP&A & Analytics',
      'M&A & Value Creation',
    ],
  },
  {
    name: 'Dr. James Anderson',
    title: 'CHIEF TECHNOLOGY OFFICER',
    imageSrc: '/team/james-anderson.png',
    tagline:
      'Deep technical leader with expertise in AI, cloud architecture, and advanced engineering systems.',
    bio:
      'Dr. James Anderson brings over 18 years of experience architecting and scaling complex technology platforms. He is passionate about solving hard problems at the intersection of AI, data, and cloud computing.',
    experience: [
      'Former Head of Engineering at BEA Systems, leading teams building infrastructure and accelerated computing platforms.',
      'Previously led infrastructure engineering at Sun Microsystems.',
      'Holds multiple patents in distributed systems and machine learning optimization.',
    ],
    education: [
      'Ph.D. in Computer Science, Carnegie Mellon University',
      'M.S. in Computer Science, Stanford University',
      'B.S. in Computer Engineering, University of Michigan',
    ],
    expertise: [
      'Cloud Architecture',
      'AI & Machine Learning',
      'Scalable Systems',
      'Security & Reliability',
    ],
  },
];

function Section({ label, items }: LeaderSection) {
  return (
    <div>
      <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#1A1A1A] mb-3">
        {label}
      </h4>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="text-sm text-[#4a4a4a] leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#3F51B5]"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ManagementTeamPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16 sm:py-20 text-center">
          <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#3F51B5] mb-4">
            Leadership
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#1A1A1A] mb-5">
            Management Team
          </h1>
          <p className="text-lg text-[#666666] max-w-2xl mx-auto leading-relaxed">
            The people building ai.market — the non-custodial B2B marketplace for AI
            data, models, and pipelines, designed to be run primarily by AI agents with
            humans as strategic oversight.
          </p>
        </div>
      </section>

      {/* Team grid */}
      <section className="mx-auto max-w-7xl px-6 lg:px-8 py-16 sm:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 lg:gap-10">
          {team.map((person) => (
            <article
              key={person.name}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 lg:p-7 hover:border-[#3F51B5]/40 hover:shadow-[0_4px_24px_rgba(63,81,181,0.08)] transition-all"
            >
              {/* Portrait */}
              <div className="w-[35%] aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-5 ring-1 ring-gray-200 mx-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={person.imageSrc}
                  alt={`Portrait of ${person.name}`}
                  className="w-full h-full object-cover object-top"
                  loading="lazy"
                />
              </div>

              {/* Name + title */}
              <h2 className="text-xl font-bold text-[#1A1A1A] leading-tight">
                {person.name}
              </h2>
              <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#3F51B5] mt-1 mb-4">
                {person.title}
              </p>

              {/* Tagline */}
              <p className="text-base font-medium text-[#1A1A1A] leading-snug mb-4">
                {person.tagline}
              </p>

              {/* Bio */}
              <p className="text-sm text-[#666666] leading-relaxed mb-6">
                {person.bio}
              </p>

              {/* Experience */}
              <div className="mb-6">
                <Section label="Experience Highlights" items={person.experience} />
              </div>

              {/* Education */}
              <div className="mb-6">
                <Section label="Education" items={person.education} />
              </div>

              {/* Expertise — tags at bottom */}
              <div className="mt-auto pt-5 border-t border-gray-100">
                <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#1A1A1A] mb-3">
                  Expertise
                </h4>
                <div className="flex flex-wrap gap-2">
                  {person.expertise.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1 rounded-full bg-[#3F51B5]/[0.08] text-xs font-medium text-[#3F51B5]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
