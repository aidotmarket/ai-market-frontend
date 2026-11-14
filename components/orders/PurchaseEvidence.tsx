'use client';

import ApprovedListingPreview from '@/components/ApprovedListingPreview';
import { deliveryNotice, deliveryPermitted, REDACTED_NOTICE, UNAVAILABLE_NOTICE, verifiedPurchasedHtml } from '@/lib/order-purchase-evidence';
import type { BuyerOrderDetail } from '@/types';

export default function PurchaseEvidence({ order }: { order: BuyerOrderDetail }) {
  const presentation = order.purchased_presentation;
  const html = verifiedPurchasedHtml(presentation);
  const blocked = !deliveryPermitted(order.delivery_access_state);
  return <section aria-label="Purchased listing evidence" className="space-y-3 rounded-lg border border-gray-200 p-6">
    {order.listing_notice && <p role="status">{order.listing_notice}</p>}
    {blocked && <div role="alert">
      <h2 className="font-semibold">Delivery unavailable</h2>
      {order.listing_notice !== deliveryNotice(order.delivery_access_state) && <p>{deliveryNotice(order.delivery_access_state)}</p>}
    </div>}
    <h2 className="font-semibold">Listing description at purchase</h2>
    {presentation?.state === 'redacted' ? <p>{presentation.notice ?? REDACTED_NOTICE}</p>
      : html !== null ? <>
        <ApprovedListingPreview title="Listing description for the purchased version" html={html} />
        <p className="break-all text-xs">Purchased version: {presentation?.listing_version_id}</p>
        <p className="break-all text-xs">Render hash: {presentation?.render_hash}</p>
      </> : <p role="status">{presentation?.state === 'unavailable' ? presentation.notice ?? UNAVAILABLE_NOTICE : UNAVAILABLE_NOTICE}</p>}
  </section>;
}
