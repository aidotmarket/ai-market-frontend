import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { PurchasedPresentation } from '@/types';

// Verbatim backend order_listing_presentation.py contract (2b49dca4).
export const WITHDRAWN_NOTICE = 'Withdrawn by the seller. Your purchase is unaffected.';
export const REDACTED_NOTICE = 'The listing description was removed by ai.market.';
export const UNAVAILABLE_NOTICE = 'Purchased listing evidence is unavailable. Contact support through your order.';
export const DELIVERY_NOTICES = {
  restricted: 'Delivery has been restricted by ai.market. Contact support through your order for your case and refund decision.',
  destroyed: 'Delivery material was permanently removed. Contact support through your order for your case and refund decision.',
  unavailable: 'Delivery is unavailable. Contact support through your order.',
} as const;

export function deliveryPermitted(state: string | null | undefined): boolean {
  // Older responses retain their existing entitlement checks. Unknown new states refuse delivery.
  return state == null || state === 'within_order_terms';
}

export function deliveryNotice(state: string | null | undefined): string {
  if (state === 'restricted' || state === 'destroyed') return DELIVERY_NOTICES[state];
  return DELIVERY_NOTICES.unavailable;
}

export function verifiedPurchasedHtml(presentation?: PurchasedPresentation | null): string | null {
  if (presentation?.state !== 'approved' || typeof presentation.rendered_html !== 'string' ||
      !presentation.approval_id || !presentation.listing_version_id ||
      typeof presentation.render_hash !== 'string' || !/^[0-9a-f]{64}$/.test(presentation.render_hash)) return null;
  const bytes = new TextEncoder().encode(presentation.rendered_html);
  if (bytes.length > 100000 || bytesToHex(sha256(bytes)) !== presentation.render_hash) return null;
  return presentation.rendered_html;
}
