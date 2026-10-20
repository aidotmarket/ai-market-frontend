import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { formatPublishedDate } from '@/lib/format';
import type { ListingDetail, PublicSourceReference } from '@/types';

// The explicit API projection opts in. The hold also fails closed when that
// projection is absent or malformed; legacy reference fulfillment stays intact.
export function isPublicSourceReference(listing: ListingDetail): boolean {
  return listing.public_reference != null || listing.purchase_hold_reason === 'public_source_reference';
}

function safeExternalHttps(value: unknown): value is string {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value) || !value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validReference(listing: ListingDetail): PublicSourceReference | null {
  const reference = listing.public_reference;
  if (listing.fulfillment_type !== 'reference' || listing.pricing.price !== 0 ||
      listing.purchasable !== false || listing.purchase_hold_reason !== 'public_source_reference' ||
      !reference || typeof reference !== 'object' || Array.isArray(reference) ||
      ('access_kind' in reference && reference.access_kind !== 'download' && reference.access_kind !== 'instructions') ||
      typeof reference.label !== 'string' || !reference.label.trim() ||
      typeof reference.publisher !== 'string' || !reference.publisher.trim() ||
      !safeExternalHttps(reference.url) || !safeExternalHttps(reference.license_url) ||
      !safeExternalHttps(reference.metadata_url)) return null;
  return reference;
}

export default function PublicSourceReferencePage({ listing, emitJsonLd }: { listing: ListingDetail; emitJsonLd: boolean }) {
  const reference = validReference(listing);
  const jsonld = reference && emitJsonLd && !listing.noindex ? {
    '@context': 'https://schema.org', '@type': 'Dataset',
    name: listing.title, description: listing.description,
    url: `https://ai.market/listings/${listing.slug}`,
    publisher: { '@type': 'Organization', name: reference.publisher },
    license: reference.license_url, isAccessibleForFree: true,
    sameAs: reference.metadata_url,
  } : null;
  return <>
    {jsonld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld).replace(/</g, '\\u003c') }} />}
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/listings" className="hover:text-gray-700">Listings</Link>
        <span className="mx-2">/</span><span className="text-gray-900">{listing.title}</span>
      </nav>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h1 className="text-3xl font-bold text-gray-900">{listing.title}</h1>
          {reference ? <>
            <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-900">Indexed from public source</span>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
              <span>Published {listing.published_at ? formatPublishedDate(listing.published_at) : 'N/A'}</span>
              <span>{listing.view_count} views</span>
            </div>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}
                urlTransform={url => safeExternalHttps(url) ? url : ''}
                components={{
                  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
                  img: () => null,
                }}
              >{listing.description}</ReactMarkdown>
            </div>
          </> : <p role="status" className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">Public source reference unavailable. The source details could not be verified.</p>}
        </div>
        {reference && <aside className="rounded-xl border border-gray-200 p-6 space-y-4 self-start">
          <p className="text-3xl font-bold text-gray-900">Free</p>
          <h2 className="font-semibold text-gray-900">Publisher</h2>
          <p className="text-sm text-gray-600">{reference.publisher}</p>
          <p className="text-sm text-gray-600">{reference.access_kind === 'instructions'
            ? 'ai.market indexes this public source. Follow the publisher’s access instructions; ai.market does not host or relay the dataset. No purchase or checkout is required.'
            : 'ai.market indexes this public source. Access files directly from the publisher; no purchase or checkout is required.'}</p>
          <a href={reference.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-[#3F51B5] px-4 py-3 text-center font-medium text-white">{reference.label}</a>
          <div className="flex flex-wrap gap-4 text-sm text-[#3F51B5]">
            <a href={reference.license_url} target="_blank" rel="noopener noreferrer">License</a>
            <a href={reference.metadata_url} target="_blank" rel="noopener noreferrer">Source metadata</a>
          </div>
        </aside>}
      </div>
    </div>
  </>;
}
