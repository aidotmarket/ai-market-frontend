import type { PublisherPublicInfo } from '@/types';

export default function PublisherCard({ publisher }: { publisher?: PublisherPublicInfo | null }) {
  if (!publisher || publisher.kind === 'generated_sample') return null;

  // Legacy and source publishers keep name-only presentation. Missing fields
  // are unknown, so they must never become zero purchases or zero ratings.
  const seller = publisher.kind === 'marketplace' && publisher.schema_version === 'seller-presentation-v1'
    ? publisher : null;
  const name = seller ? publisher.display_name?.trim() || 'ai.market Seller' : publisher.display_name;
  if (!name) return null;
  return (
    <div className="rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-3">Publisher</h3>
      <p className={seller ? 'text-sm text-gray-600 break-words' : 'text-sm text-gray-600'}>{name}</p>
      {seller?.name_source === 'seller_supplied' && <p className="mt-1 text-xs text-gray-500">Business name supplied by the seller.</p>}
      {seller && <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
        {seller.stripe_connected === true && <span tabIndex={0}
          title="Seller connected a Stripe payout account. This does not certify company affiliation or data quality."
          aria-label="Stripe connected. Seller connected a Stripe payout account. This does not certify company affiliation or data quality."
          className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
          Stripe connected
        </span>}
        {seller.completed_order_count != null && <p className="text-sm text-gray-600">
          {seller.completed_order_count > 0 ? `${seller.completed_order_count} completed purchases` : 'No completed purchases yet'}
        </p>}
        {seller.seller_rating_count != null && <p className="text-sm text-gray-600" aria-label="Seller ratings">
          {seller.seller_rating_count > 0 && seller.seller_rating_average != null
            ? `${seller.seller_rating_average}/5 from ${seller.seller_rating_count} ratings`
            : seller.seller_rating_count === 0 ? 'No ratings yet' : 'Seller ratings unavailable'}
        </p>}
      </div>}
    </div>
  );
}
