import { api } from './client';
import type { ListingDraftContent } from './sellerListingDraft';
export interface ListingReview {
  fields: Pick<ListingDraftContent, 'title' | 'description' | 'category' | 'tags' | 'price' | 'license'>;
  draft_version: number; source_version: number; presentation_version: string; review_hash: string;
  missing_fields: string[]; approval_available: boolean; sample_status: string;
  rendered_html: string; render_hash: string;
}
export async function readListingReview(signal: AbortSignal): Promise<ListingReview> {
  const review: ListingReview = (await api.get('/seller-workspace/listing-review', {signal})).data;
  if (review.presentation_version !== 'seller-listing-review-v2' || typeof review.rendered_html !== 'string' ||
      !/^[a-f0-9]{64}$/.test(review.render_hash)) throw new Error('Saved review could not be verified');
  const bytes = new TextEncoder().encode(review.rendered_html);
  if (bytes.length > 100000) throw new Error('Saved review could not be verified');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== review.render_hash || signal.aborted) throw new Error('Saved review could not be verified');
  return review;
}
