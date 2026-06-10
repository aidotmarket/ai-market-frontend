import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchDataRequest } from '@/lib/api';
import type { DataRequestDetail } from '@/types';
import DataRequestDetailClient from './DataRequestDetailClient';

export const dynamic = 'force-dynamic';

const REQUEST_JSONLD_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REQUEST_JSONLD !== 'false';
const PUBLIC_REQUEST_STATUSES = new Set(['open', 'responses_received']);

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const request: DataRequestDetail | null = await fetchDataRequest(slug);
  if (!request) {
    return {
      title: 'Request Not Found',
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

export default async function DataRequestDetailPage({ params }: Props) {
  const { slug } = await params;
  const request: DataRequestDetail | null = await fetchDataRequest(slug);
  if (!request) {
    notFound();
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
      <DataRequestDetailClient slug={slug} initialRequest={request} />
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
