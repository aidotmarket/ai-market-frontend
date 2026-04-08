import Link from 'next/link';
import { formatPrice, privacyScoreColor, verificationBadgeColor } from '@/lib/format';
import type { ListingListItem, SearchResultItem } from '@/types';

type CardListing = ListingListItem | SearchResultItem;

function hasVerification(
  listing: CardListing
): listing is CardListing & { verification_status: NonNullable<ListingListItem['verification_status']> } {
  return 'verification_status' in listing && typeof listing.verification_status === 'string';
}

export function MarketplaceListingCard({ listing }: { listing: CardListing }) {
  const tags = Array.isArray(listing.tags) ? listing.tags.slice(0, 3) : [];
  const views = 'view_count' in listing ? listing.view_count : undefined;
  const description = listing.short_description || ('description' in listing ? listing.description : null);
  const fulfillmentBadge = listing.fulfillment_type === 'model_access'
    ? 'Model'
    : listing.fulfillment_type === 'pipeline_invocation'
      ? 'Pipeline'
      : null;

  return (
    <Link
      href={`/listings/${listing.slug}`}
      className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-[#C5CAE9] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 flex-1 text-base font-semibold text-gray-900">
          {listing.title || 'Untitled dataset'}
        </h3>
        <span className="whitespace-nowrap text-lg font-bold text-gray-900">
          {formatPrice(listing.price)}
        </span>
      </div>

      {description && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500">
          {description}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
          {listing.category}
        </span>
        {'data_format' in listing && listing.data_format && (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
            {listing.data_format}
          </span>
        )}
        {fulfillmentBadge && (
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
            {fulfillmentBadge}
          </span>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full bg-[#E8EAF6] px-2.5 py-1 text-xs text-[#3F51B5]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5 text-xs">
        {typeof listing.privacy_score === 'number' && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 font-medium ${privacyScoreColor(
              listing.privacy_score
            )}`}
          >
            Privacy: {listing.privacy_score.toFixed(1)}
          </span>
        )}
        {hasVerification(listing) && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 font-medium ${verificationBadgeColor(
              listing.verification_status
            )}`}
          >
            {listing.verification_status}
          </span>
        )}
        {typeof views === 'number' && (
          <span className="ml-auto text-gray-400">{views} views</span>
        )}
      </div>
    </Link>
  );
}
