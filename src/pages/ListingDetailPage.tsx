import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { getListing } from '@/api/listings';
import {
  formatPrice,
  formatDate,
  privacyScoreColor,
  verificationBadgeColor,
  trustLevelLabel,
} from '@/lib/format';
import { useToast } from '@/components/Toast';

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: listing, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => getListing(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-3">
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </div>
            <div className="h-48 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // 404 handling
  if (isError) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Listing Not Found</h1>
          <p className="text-gray-500 mb-6">
            This listing doesn&apos;t exist or has been removed.
          </p>
          <Link
            to="/listings"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Browse Listings
          </Link>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-gray-500 mb-4">Failed to load listing.</p>
        <button
          onClick={() => {
            refetch();
            toast('Retrying...', 'info');
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!listing) return null;

  const columns = (listing.schema_info as { columns?: { name: string; type: string }[] })?.columns;
  const rowCount = (listing.schema_info as { row_count?: number })?.row_count;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link to="/listings" className="hover:text-gray-700">
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
              <span>{listing.purchase_count} purchases</span>
            </div>
          </div>

          {/* Description (M3: markdown sanitization) */}
          <div className="prose prose-sm max-w-none">
            <Markdown rehypePlugins={[rehypeSanitize]}>
              {listing.description}
            </Markdown>
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
            {listing.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Schema Info */}
          {columns && columns.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Schema Information</h2>
              {rowCount != null && (
                <p className="text-sm text-gray-500 mb-3">{rowCount.toLocaleString()} rows</p>
              )}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Column</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {columns.map((col) => (
                      <tr key={col.name}>
                        <td className="px-4 py-2 font-mono text-gray-900">{col.name}</td>
                        <td className="px-4 py-2 text-gray-500">{col.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compliance Badges */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Compliance</h2>
            <div className="flex flex-wrap gap-2">
              <ComplianceBadge label="Status" value={listing.compliance_status} />
              {listing.compliance_details &&
                Object.entries(listing.compliance_details).map(([key, val]) => (
                  <ComplianceBadge key={key} label={key.toUpperCase()} value={String(val)} />
                ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Price card */}
          <div className="rounded-xl border border-gray-200 p-6">
            <p className="text-3xl font-bold text-gray-900 mb-1">{formatPrice(listing.price)}</p>
            <p className="text-sm text-gray-500 mb-4">
              {listing.pricing_type === 'subscription'
                ? `${formatPrice(listing.subscription_price_monthly ?? 0)}/mo`
                : 'One-time purchase'}
            </p>
            <button
              disabled
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white opacity-50 cursor-not-allowed"
              title="Checkout coming soon"
            >
              Purchase
            </button>
            <p className="text-xs text-gray-400 mt-2 text-center">Checkout available soon</p>
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

          {/* Seller card */}
          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Seller</h3>
            <p className="text-sm text-gray-600 mb-4">Seller ID: {listing.seller_id.slice(0, 8)}...</p>
            <button
              disabled
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-500 cursor-not-allowed"
              title="Messaging coming in a future update"
            >
              Contact Seller
            </button>
          </div>

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
