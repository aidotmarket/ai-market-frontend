import type { Metadata } from 'next';
import Image from 'next/image';
import profiles from '@/content/management-team/profiles.json';
import page from '@/content/management-team/page.json';

export const metadata: Metadata = {
  alternates: { canonical: '/management-team' },
  title: { absolute: 'Management Team | ai.market' },
  description: page.description,
};

// Keep source image names in the unchanged editorial data; serve optimized assets.
const portraits: Record<string, string> = {
  'max.png': '/team/max-robbins.webp',
  'opus.png': '/team/claude-opus-5-5.webp',
  'sol.png': '/team/gpt-6-1-sol.webp',
  'fable.png': '/team/claude-fable-5-1.webp',
};

const headingClass = 'mb-3 text-[11px] leading-[1.5] font-bold tracking-[0.1em] uppercase';
const bulletClass = "relative pl-4 text-[#4a4a4a] leading-[1.625] before:absolute before:left-0 before:text-[#3f51b5] before:content-['•']";

function ProfileDetail({ label, items }: { label: string; items: string[] }) {
  return (
    <section className="mb-6">
      <h3 className={headingClass}>{label}</h3>
      <ul className="space-y-2">
        {items.map((item) => <li key={item} className={`${bulletClass} text-sm`}>{item}</li>)}
      </ul>
    </section>
  );
}

export default function ManagementTeamPage() {
  return (
    <div className="bg-white text-[#1a1a1a] leading-[1.5]">
      <section className="border-b border-[#e5e7eb] px-6 py-20 text-center [@media(max-width:700px)]:py-16">
        <p className="mb-4 text-[11px] leading-4 font-bold tracking-[0.1em] uppercase text-[#3f51b5]">
          {page.eyebrow}
        </p>
        <h1 className="mb-5 text-5xl leading-none font-bold tracking-[-0.025em] [@media(max-width:700px)]:text-4xl">
          {page.title}
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-[1.625] text-[#666] [@media(max-width:700px)]:text-[17px]">
          {page.description}
        </p>
      </section>

      <section aria-label="Management profiles" className="mx-auto grid max-w-7xl grid-cols-4 gap-10 px-8 py-20 [@media(max-width:1199px)]:gap-8 [@media(max-width:1100px)]:grid-cols-2 [@media(max-width:700px)]:grid-cols-1 [@media(max-width:700px)]:gap-6 [@media(max-width:700px)]:px-6 [@media(max-width:700px)]:py-12">
        {profiles.map((person) => (
          <article key={person.name} className="flex flex-col rounded-xl border border-[#e5e7eb] p-7 transition-[box-shadow,border-color] duration-200 hover:border-[#3f51b5]/40 hover:shadow-[0_4px_24px_#3f51b514] [@media(max-width:1199px)]:p-6">
            <div className="mx-auto mb-5 aspect-[3/4] w-[35%] overflow-hidden rounded-xl bg-[#f3f4f6] shadow-[0_0_0_1px_#e5e7eb] [@media(max-width:700px)]:max-w-[110px]">
              <Image src={portraits[person.image]} alt={person.name} width={600} height={800} sizes="(max-width: 700px) 110px, (max-width: 1100px) 160px, 90px" className="h-full w-full object-cover object-top" />
            </div>
            <h2 className="text-xl leading-[1.25] font-bold">{person.name}</h2>
            <p className="mt-1 mb-4 text-[11px] leading-[1.5] font-bold tracking-[0.1em] uppercase text-[#3f51b5]">{person.role}</p>
            <p className="mb-4 text-base leading-[1.375] font-medium">{person.lead}</p>
            <p className="mb-6 text-sm leading-[1.625] text-[#666]">{person.bio}</p>
            <ProfileDetail label="Experience Highlights" items={person.experience} />
            <ProfileDetail label="Education" items={person.education} />
            <section className="mt-auto border-t border-[#f3f4f6] pt-5">
              <h3 className={headingClass}>Expertise</h3>
              <div className="flex flex-wrap gap-2">
                {person.expertise.map((tag) => (
                  <span key={tag} className="rounded-full bg-[#3f51b5]/[0.08] px-3 py-1 text-xs leading-[1.5] font-medium text-[#3f51b5]">{tag}</span>
                ))}
              </div>
            </section>
          </article>
        ))}
      </section>

      <div className="border-t border-[#e5e7eb] px-[max(32px,calc((100%-1216px)/2))] py-9 text-xs text-[#666]">
        <details className="mt-5 max-w-[850px]">
          <summary className="cursor-pointer">{page.sources.summary}</summary>
          <p className="my-3 leading-[1.7]">{page.sources.paragraphs[0]}</p>
          <ul className="space-y-2">
            {page.sources.links.map((row, index) => (
              <li key={index} className={`${bulletClass} text-xs`}>
                {row.map((part, partIndex) => typeof part === 'string' ? part : (
                  <a key={partIndex} href={part.href} className="text-[#3f51b5] hover:underline">{part.text}</a>
                ))}
              </li>
            ))}
          </ul>
          <p className="my-3 leading-[1.7]">{page.sources.paragraphs[1]}</p>
        </details>
      </div>
    </div>
  );
}
