import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getAllPosts, getPostBySlug } from '@/lib/blog';

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function generateStaticParams() {
  return getAllPosts().map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: post.author ? [post.author] : undefined,
      images: post.image ? [{ url: post.image }] : undefined,
    },
  };
}

const mdxComponents = {
  img: ({ src = '', alt = '' }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} className="w-full rounded-2xl border border-[#E5E7EB]" />
  ),
  a: ({ href = '', children }: { href?: string; children: React.ReactNode }) => {
    const className = 'font-medium text-[#3F51B5] underline underline-offset-4 hover:text-[#3545a0]';

    if (href.startsWith('/')) {
      return (
        <Link href={href} className={className}>
          {children}
        </Link>
      );
    }

    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="bg-white">
      <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Link
          href="/blog"
          className="inline-flex items-center text-sm font-semibold text-[#3F51B5] hover:text-[#3545a0]"
        >
          ← Back to Blog
        </Link>

        <header className="mt-8 border-b border-[#E8E8E8] pb-10">
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-semibold text-[#4B5563]"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg leading-8 text-[#4A4A4A]">{post.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#666666]">
            <span>{post.author}</span>
            <span className="h-1 w-1 rounded-full bg-[#C7CAD1]" />
            <span>{formatDate(post.date)}</span>
            <span className="h-1 w-1 rounded-full bg-[#C7CAD1]" />
            <span>{post.readingTime}</span>
          </div>
          {post.image ? (
            <div className="relative mt-8 max-h-[400px] overflow-hidden rounded-3xl border border-[#E8E8E8] bg-[#F3F4F6]">
              <Image
                src={post.image}
                alt={post.title}
                width={1600}
                height={900}
                className="h-auto max-h-[400px] w-full object-cover"
                priority
              />
            </div>
          ) : null}
        </header>

        <div className="blog-prose mt-10">
          <MDXRemote source={post.content} components={mdxComponents} />
        </div>
      </article>
    </div>
  );
}
