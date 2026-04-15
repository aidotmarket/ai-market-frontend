import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getAllPosts } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Updates, announcements, and product thinking from ai.market.',
  alternates: {
    canonical: '/blog',
  },
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="bg-white">
      <section className="border-b border-[#E8E8E8] bg-[#FAFAFA]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <span className="inline-flex rounded-full bg-[#E8EAF6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#3F51B5]">
            ai.market journal
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
            Blog
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[#666666]">
            Product updates, marketplace announcements, and notes on building a non-custodial AI commerce layer.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {posts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#D1D5DB] bg-[#FAFAFA] px-8 py-16 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">Coming soon</h2>
            <p className="mt-3 text-base text-[#666666]">
              We&apos;re preparing the first set of posts for buyers, sellers, and partners.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 max-w-3xl">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col sm:flex-row overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white transition-colors hover:border-[#C5CAE9]"
              >
                {post.image ? (
                  <div className="relative w-full sm:w-48 md:w-56 shrink-0 aspect-[16/9] sm:aspect-auto overflow-hidden bg-[#F3F4F6]">
                    <Image
                      src={post.image}
                      alt={post.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      sizes="(max-width: 640px) 100vw, 224px"
                    />
                  </div>
                ) : null}

                <div className="flex-1 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#666666]">
                    <span>{formatDate(post.date)}</span>
                    <span className="h-1 w-1 rounded-full bg-[#C7CAD1]" />
                    <span>{post.readingTime}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold tracking-tight text-[#1A1A1A] transition-colors group-hover:text-[#3F51B5]">
                    {post.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-[#4A4A4A] line-clamp-2">{post.description}</p>
                  {post.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#4B5563]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
