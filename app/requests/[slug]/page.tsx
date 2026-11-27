import type { Metadata } from 'next';
import { fetchDataRequest } from '@/lib/api';
import type { DataRequestDetail } from '@/types';
import { hasPrivatePublication } from '@/lib/buyer-request-publication';
import DataRequestDetailClient from './DataRequestDetailClient';

export const dynamic = 'force-dynamic';

const REQUEST_JSONLD_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REQUEST_JSONLD !== 'false';
const PUBLIC_REQUEST_STATUSES = new Set(['open', 'responses_received']);

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string | string[]; category?: string | string[]; search?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const request: DataRequestDetail | null = await fetchDataRequest(slug);
  if (!request || hasPrivatePublication(request)) {
    return {
      title: 'Data Request',
      robots: { index: false, follow: false },
    };
  }

  const description = request.description?.slice(0, 200) || '';
  const canonical = `https://ai.market/requests/${request.slug}`;
  const noindex = request.indexing?.index === false || request.indexing?.robots?.includes('noindex');

  return {
    title: request.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: request.title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'ai.market',
    },
    twitter: {
      card: 'summary',
      title: request.title,
      description,
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}

export default async function DataRequestDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page, category, search } = await searchParams ?? {};
  const boardParams = new URLSearchParams();
  if (typeof page === 'string' && /^\d+$/.test(page) && Number.isSafeInteger(Number(page)) && Number(page) > 0) {
    boardParams.set('page', page);
  }
  if (typeof category === 'string' && category.trim()) boardParams.set('category', category.trim());
  if (typeof search === 'string' && search.trim()) boardParams.set('search', search.trim());
  const boardQuery = boardParams.toString();
  const request: DataRequestDetail | null = await fetchDataRequest(slug);
  if (!request || hasPrivatePublication(request)) {
    return <DataRequestDetailClient slug={slug} initialRequest={null} boardQuery={boardQuery} />;
  }

  const shouldEmitJsonLd = shouldEmitDemandJsonLd(request);

  return (
    <>
      {shouldEmitJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(request.jsonld) }}
        />
      )}
      <DataRequestDetailClient slug={slug} initialRequest={request} boardQuery={boardQuery} />
    </>
  );
}

function safeJsonLdStringify(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function shouldEmitDemandJsonLd(request: DataRequestDetail): request is DataRequestDetail & {
  jsonld: Record<string, unknown>;
} {
  const noindex = request.indexing?.index === false || request.indexing?.robots?.includes('noindex');
  return (
    REQUEST_JSONLD_ENABLED &&
    PUBLIC_REQUEST_STATUSES.has(request.status) &&
    !noindex &&
    request.jsonld?.['@type'] === 'Demand'
  );
}
