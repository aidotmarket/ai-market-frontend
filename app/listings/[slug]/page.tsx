import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPublicListing, resolveListingUUID } from '@/lib/api';
import {
  formatPrice,
  formatDate,
  privacyScoreColor,
  verificationBadgeColor,
  trustLevelLabel,
} from '@/lib/format';
import type { ListingDetail } from '@/types';
import BuyButton from '@/components/BuyButton';
import InquiryWidget from '@/components/InquiryWidget';

export const dynamic = 'force-dynamic';

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  if (UUID_RE.test(slug)) {
    return { title: 'Redirecting...' };
  }

  const listing: ListingDetail | null = await fetchPublicListing(slug);
  if (!listing) {
    return { title: 'Not Found' };
  }

  const description = listing.short_description || listing.description?.slice(0, 200) || '';

  return {
    title: listing.title,
    description,
    alternates: { canonical: `https://ai.market/listings/${listing.slug}` },
    openGraph: {
      title: listing.title,
      description,
      url: `https://ai.market/listings/${listing.slug}`,
      type: 'website',
      siteName: 'ai.market',
    },
    twitter: {
      card: 'summary_large_image',
      title: listing.title,
      description,
    },
    robots:
      listing.noindex
        ? { index: false, follow: false }
        : undefined,
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { slug } = await params;

  // UUID redirect: resolve UUID → slug, 301 redirect
  if (UUID_RE.test(slug)) {
    const resolved = await resolveListingUUID(slug);
    if (resolved?.slug) {
      redirect(`/listings/${resolved.slug}`);
    }
    notFound();
  }

  const listing: ListingDetail | null = await fetchPublicListing(slug);
  if (!listing) {
    notFound();
  }

  const schemaSummary = listing.schema_summary;
  const rowCount = listing.row_count;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/listings" className="hover:text-gray-700">
          Listings
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{listing.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{listing.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
              <span>Published {listing.published_at ? formatDate(listing.published_at) : 'N/A'}</span>
              <span>&middot;</span>
              <span>{listing.view_count} views</span>
              <span>&middot;</span>
              <span>{listing.inquiry_count ?? 0} inquiries</span>
            </div>
          </div>

          {/* Description - rendered as text (no dangerouslySetInnerHTML) */}
          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap">{listing.description}</p>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
              {listing.category}
            </span>
            {listing.secondary_categories?.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-sm text-gray-600"
              >
                {cat}
              </span>
            ))}
            {listing.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-[#E8EAF6] px-3 py-1 text-sm text-[#3F51B5]"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Schema Info */}
          {(schemaSummary || rowCount != null) && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Schema Information</h2>
              {rowCount != null && (
                <p className="text-sm text-gray-500 mb-3">{rowCount.toLocaleString()} rows</p>
              )}
              {schemaSummary && typeof schemaSummary === 'string' && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{schemaSummary}</p>
              )}
              {schemaSummary && typeof schemaSummary === 'object' && 'columns' in schemaSummary && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border border-gray-200 rounded-lg">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Column</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schemaSummary.columns.map((col) => (
                        <tr key={col} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-1.5 text-gray-900 font-mono">{col}</td>
                          <td className="px-3 py-1.5 text-gray-600">{schemaSummary.sample_types?.[col] ?? ' - '}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Compliance Badges */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Compliance</h2>
            <div className="flex flex-wrap gap-2">
              <ComplianceBadge label="Status" value={listing.compliance_status} />
              {listing.compliance_frameworks?.map((framework) => (
                <ComplianceBadge key={framework} label={framework} value="compliant" />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Price card */}
          <div className="rounded-xl border border-gray-200 p-6">
            <p className="text-3xl font-bold text-gray-900 mb-1">{formatPrice(listing.pricing?.price ?? 0)}</p>
            <BuyButton
              listingId={listing.id}
              sellerId={listing.publisher?.id ?? ''}
              slug={listing.slug}
              price={listing.pricing?.price ?? 0}
              pricingType={listing.pricing?.pricing_type ?? 'one_time'}
            />
          </div>

          {/* Trust metrics */}
          <div className="rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Trust Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Privacy Score</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${privacyScoreColor(listing.privacy_score)}`}>
                  {listing.privacy_score.toFixed(1)}/10
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Quality Score</span>
                <span className="text-sm font-medium text-gray-900">
                  {listing.quality_score.toFixed(0)}/100
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Trust Level</span>
                <span className="text-sm font-medium text-gray-900">
                  {trustLevelLabel(listing.trust_level)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Verification</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${verificationBadgeColor(listing.verification_status)}`}>
                  {listing.verification_status}
                </span>
              </div>
            </div>
          </div>

          {/* Publisher card */}
          {listing.publisher && (
            <div className="rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Publisher</h3>
              <p className="text-sm text-gray-600">{listing.publisher.name}</p>
            </div>
          )}

          {/* Inquiry Widget */}
          <InquiryWidget listingId={listing.id} listingSlug={listing.slug} />

          {/* Non-custodial trust strip */}
          <div className="rounded-xl bg-green-50 border border-green-200 p-4">
            <div className="flex items-start gap-2">
              <svg className="h-5 w-5 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800">Non-Custodial</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Data never touches ai.market. Transactions are peer-to-peer.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function ComplianceBadge({ label, value }: { label: string; value: string }) {
  const colorMap: Record<string, string> = {
    low_risk: 'bg-green-100 text-green-800',
    medium_risk: 'bg-yellow-100 text-yellow-800',
    high_risk: 'bg-red-100 text-red-800',
    true: 'bg-green-100 text-green-800',
    false: 'bg-gray-100 text-gray-600',
  };
  const color = colorMap[value] || 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      {label}: {value.replace('_', ' ')}
    </span>
  );
}
