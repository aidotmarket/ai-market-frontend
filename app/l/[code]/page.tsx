import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchShareMetadata, type ShareMetadataResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ code: string }>;
}

const UNAVAILABLE_TITLE = 'Listing unavailable';
const FALLBACK_TITLE = 'Listing';
const SITE_NAME = 'ai.market';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const result = await fetchShareMetadata(code);

  if (result.status === 'published') {
    const share = result.data;
    const title = share.og['og:title'] ?? FALLBACK_TITLE;
    const description = share.og['og:description'] ?? '';
    const cardUrl = share.card_url || share.og['og:image'];
    const twitterImage = share.og['twitter:image'] ?? cardUrl;
    const openGraph = {
      title,
      description,
      url: share.canonical,
      type: share.og['og:type'] ?? 'website',
      siteName: SITE_NAME,
      images: cardUrl ? [cardUrl] : undefined,
      locale: share.og['og:locale'] ?? share.locale,
    } as Metadata['openGraph'];

    return {
      title,
      description,
      alternates: { canonical: share.canonical },
      openGraph,
      twitter: {
        card: 'summary_large_image',
        title: share.og['twitter:title'] ?? title,
        description: share.og['twitter:description'] ?? description,
        images: twitterImage ? [twitterImage] : undefined,
      },
    };
  }

  if (result.status === 'error') {
    return {
      title: FALLBACK_TITLE,
      robots: { index: false, follow: false },
      openGraph: {
        title: FALLBACK_TITLE,
        type: 'website',
        siteName: SITE_NAME,
      },
    };
  }

  return {
    title: UNAVAILABLE_TITLE,
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({ params }: Props) {
  const { code } = await params;
  const result = await fetchShareMetadata(code);

  if (result.status !== 'published') {
    return <UnavailableShare />;
  }

  const share = result.data;
  const title = share.og['og:title'] ?? FALLBACK_TITLE;
  const description = share.og['og:description'] ?? '';
  const listingHref = listingPathFromCanonical(share.canonical);
  const cardPreviewUrl = share.card_url || `/l/${encodeURIComponent(code)}/card.png`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(share.jsonld) }}
      />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section className="space-y-5">
            <Link href="/listings" className="text-sm font-medium text-[#3F51B5] hover:text-[#303F9F]">
              Listings
            </Link>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
              {description && (
                <p className="max-w-3xl text-base leading-7 text-gray-700">{description}</p>
              )}
            </div>
            <Link
              href={listingHref}
              className="inline-flex items-center rounded-md bg-[#3F51B5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#303F9F]"
            >
              View listing
            </Link>
          </section>

          <img
            src={cardPreviewUrl}
            alt=""
            className="aspect-[1.91/1] w-full rounded-lg border border-gray-200 bg-gray-50 object-cover"
          />
        </div>
      </main>
    </>
  );
}

function UnavailableShare() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-4 py-16 text-center sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">This share link is no longer available</h1>
      <p className="mt-3 text-base text-gray-600">
        The listing may have been unpublished, archived, or the share link may have been revoked.
      </p>
      <div className="mt-6">
        <Link
          href="/find-data"
          className="inline-flex items-center rounded-md bg-[#3F51B5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#303F9F]"
        >
          Find data
        </Link>
      </div>
    </main>
  );
}

function listingPathFromCanonical(canonical: ShareMetadataResponse['canonical']): string {
  try {
    const url = new URL(canonical);
    if (url.hostname === 'ai.market' && url.pathname.startsWith('/listings/')) {
      return url.pathname;
    }
  } catch {
    return '/listings';
  }
  return '/listings';
}

function safeJsonLdStringify(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
