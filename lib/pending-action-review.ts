import { isSellerBatchSummary, isSellerSingleSummary } from './seller-batch';

// Display requirements from backend cea28992 PendingActionSummary and its
// registered licence rules. Never derive human copy from IDs or hashes.
const LICENSE_ACTIONS = new Set([
  'aim.checkout.handoff.create', 'aim.order.confirm', 'aim.order.mark_delivered',
  'aim.listing.publish', 'aim.offer.make', 'aim.offer.respond',
]);

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

export function safeLicenseUrl(value: unknown): value is string {
  if (!text(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value, 'https://ai.market');
    return !url.username && !url.password &&
      (value.startsWith('https://') || (value.startsWith('/') && !value.startsWith('//'))) && url.protocol === 'https:';
  } catch { return false; }
}

export function hasRequiredReviewContent(summary: Record<string, unknown>): boolean {
  if (summary.summary_type === 'seller_single_v1') return isSellerSingleSummary(summary);
  if (summary.summary_type === 'seller_batch_v1') return isSellerBatchSummary(summary);
  if (summary.summary_type != null) return false;
  if (!text(summary.client_display_name) || !text(summary.effect) || summary.effect.startsWith('UNVERIFIED:')
    || !text(summary.requested_at) || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(summary.requested_at)
    || !Number.isFinite(Date.parse(summary.requested_at))) return false;
  const terms = summary.binding_terms;
  if (!terms || typeof terms !== 'object' || Array.isArray(terms) || !Object.keys(terms).length
    || !Object.entries(terms).every(([key, value]) => text(key) && text(value))) return false;
  const licenseFields = [summary.license_hash, summary.license_name, summary.license_version, summary.license_url];
  if (LICENSE_ACTIONS.has(String(summary.action)) || licenseFields.some(value => value != null)) {
    if (!text(summary.license_name) || !text(summary.license_version) || !safeLicenseUrl(summary.license_url)
      || !text(summary.license_hash) || !/^[a-f0-9]{64}$/.test(summary.license_hash)) return false;
  }
  return true;
}
