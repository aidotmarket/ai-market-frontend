import { api } from './client';
import type { ListingDraftContent } from './sellerListingDraft';
export const CONFIRMATION_KEYS = ['ownership_confirmed', 'privacy_confirmed', 'price_license_confirmed', 'public_disclosure_confirmed'] as const;
export type ConfirmationKey = typeof CONFIRMATION_KEYS[number];
export interface ApprovalReceipt {
  id: string; review_hash: string; render_hash: string; draft_version: number; source_version: number;
  approved_at: string; sample_decision: 'none';
}
export interface ListingReview {
  fields: Pick<ListingDraftContent, 'title' | 'description' | 'category' | 'tags' | 'price' | 'license'>;
  draft_version: number; source_version: number; presentation_version: string; review_hash: string;
  missing_fields: string[]; approval_available: boolean; sample_status: string;
  rendered_html: string; render_hash: string;
  confirmation_version: 'seller-listing-confirmation-v1';
  confirmation_statements: Record<ConfirmationKey, string>;
  approval?: ApprovalReceipt | null;
  source_files?: Array<{key: string; size: number; etag: string; version_id: string | null}>;
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
  if (review.approval_available && (review.confirmation_version !== 'seller-listing-confirmation-v1' ||
      CONFIRMATION_KEYS.some(key => typeof review.confirmation_statements?.[key] !== 'string' || !review.confirmation_statements[key].trim())))
    throw new Error('Saved review could not be verified');
  if (review.approval_available && (!Array.isArray(review.source_files) || review.source_files.length < 1 || review.source_files.length > 10 ||
      review.source_files.some(file => typeof file.key !== 'string' || !file.key || file.key.length > 1024 || !Number.isSafeInteger(file.size) || file.size < 0)))
    throw new Error('Saved review could not be verified');
  if (review.approval && (review.approval.review_hash !== review.review_hash || review.approval.render_hash !== review.render_hash ||
      review.approval.draft_version !== review.draft_version || review.approval.source_version !== review.source_version || review.approval.sample_decision !== 'none'))
    throw new Error('Saved review could not be verified');
  return review;
}

export async function approveListingReview(review: ListingReview, request_id: string, signal: AbortSignal): Promise<ApprovalReceipt> {
  const body = {request_id,review_hash:review.review_hash,render_hash:review.render_hash,
    confirmation_version:review.confirmation_version,sample_decision:'none',
    ownership_confirmed:true,privacy_confirmed:true,price_license_confirmed:true,public_disclosure_confirmed:true};
  const receipt: ApprovalReceipt = (await api.post('/seller-workspace/listing-approval',body,{signal})).data;
  if (receipt.review_hash !== review.review_hash || receipt.render_hash !== review.render_hash ||
      receipt.draft_version !== review.draft_version || receipt.source_version !== review.source_version ||
      receipt.sample_decision !== 'none' || signal.aborted) throw new Error('Approval could not be verified');
  return receipt;
}
