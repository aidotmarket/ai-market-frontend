import { api } from './client';
import type { ListingDraftContent } from './sellerListingDraft';
import type {LicenseSelection} from './listingLicenses';
export const CONFIRMATION_KEYS = ['ownership_confirmed', 'privacy_confirmed', 'price_license_confirmed', 'public_disclosure_confirmed'] as const;
export const LICENSE_CONFIRMATION_KEYS = ['ownership_confirmed', 'privacy_confirmed', 'price_confirmed', 'license_confirmed', 'covenant_authority_confirmed', 'public_disclosure_confirmed'] as const;
export type ConfirmationKey = typeof CONFIRMATION_KEYS[number] | typeof LICENSE_CONFIRMATION_KEYS[number] | 'sample_files_confirmed';
export interface ReviewSampleFile { index: number; sha256: string; key_basename: string; size: number }
export type SampleStatus = 'not_selected' | {state:'selected';files:ReviewSampleFile[]};
export interface ApprovalReceipt {
  id: string; review_hash: string; render_hash: string; draft_version: number; source_version: number;
  approved_at: string; sample_decision: 'none' | 'member_files';
  license_selection?: LicenseSelection;
}
export interface ListingReview {
  fields: Pick<ListingDraftContent, 'title' | 'description' | 'category' | 'tags' | 'price' | 'license'>;
  draft_version: number; source_version: number; presentation_version: string; review_hash: string;
  missing_fields: string[]; approval_available: boolean; sample_status?: SampleStatus;
  sample_decision?: 'none' | 'member_files'; sample_object_indices?: number[];
  rendered_html: string; render_hash: string;
  confirmation_version: 'seller-listing-confirmation-v1' | 'seller-listing-confirmation-v2' | 'seller-listing-confirmation-v3';
  confirmation_statements: Partial<Record<ConfirmationKey,string>>;
  license_selection?: LicenseSelection;
  approval?: ApprovalReceipt | null;
  source_hash: string;
  source_page?: ReviewSourcePage | null;
}
export interface ReviewSourcePage {
  review_hash: string; source_version: number; source_hash: string;
  offset: number; page_size: number; total_count: number; total_size_bytes: number;
  files: Array<{key: string; size: number; etag: string; version_id: string | null}>;
  next_cursor: string | null;
}
function sameLicenseSelection(left?: LicenseSelection, right?: LicenseSelection): boolean {
  if (!left || !right) return left === right;
  return left.kind === right.kind && left.version === right.version &&
    left.ai_training === right.ai_training && left.license_document_id === right.license_document_id &&
    left.license_sha256 === right.license_sha256 && left.rider_sha256 === right.rider_sha256 &&
    left.covenant_code === right.covenant_code && left.covenant_version === right.covenant_version &&
    left.covenant_sha256 === right.covenant_sha256 &&
    left.seller_acceptance.signer_name === right.seller_acceptance.signer_name &&
    left.seller_acceptance.signer_title === right.seller_acceptance.signer_title &&
    left.seller_acceptance.authority_confirmed === right.seller_acceptance.authority_confirmed;
}
function verifySourcePage(page: ReviewSourcePage, review: ListingReview, offset: number) {
  if (!page || page.review_hash !== review.review_hash || page.source_version !== review.source_version ||
      page.source_hash !== review.source_hash || !/^[a-f0-9]{64}$/.test(page.source_hash) ||
      page.offset !== offset || !Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(page.page_size) || page.page_size < 1 || page.page_size > 1000 ||
      !Number.isSafeInteger(page.total_count) || page.total_count < 1 || page.total_count > 50000 ||
      !Number.isSafeInteger(page.total_size_bytes) || page.total_size_bytes < 0 ||
      !Array.isArray(page.files) || page.files.length < 1 || page.files.length > page.page_size ||
      offset + page.files.length > page.total_count ||
      page.files.some(file => typeof file.key !== 'string' || !file.key || file.key.length > 1024 ||
        !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.etag !== 'string' || !file.etag || file.etag.length > 256 ||
        (file.version_id !== null && (typeof file.version_id !== 'string' || file.version_id.length > 1024))) ||
      new Set(page.files.map(file => JSON.stringify([file.key, file.version_id]))).size !== page.files.length ||
      page.files.reduce((sum, file) => sum + file.size, 0) > page.total_size_bytes ||
      (offset + page.files.length < page.total_count ?
        typeof page.next_cursor !== 'string' || !page.next_cursor || page.next_cursor.length > 512 : page.next_cursor !== null) ||
      new TextEncoder().encode(JSON.stringify(page.files)).length > 256000 ||
      (review.source_page && (page.total_count !== review.source_page.total_count ||
        page.total_size_bytes !== review.source_page.total_size_bytes || page.page_size !== review.source_page.page_size)))
    throw new Error('Saved review files could not be verified');
}
export async function readReviewSourcePage(review: ListingReview, cursor: string, offset: number, signal: AbortSignal): Promise<ReviewSourcePage> {
  const page: ReviewSourcePage = (await api.get('/seller-workspace/listing-review/files', {params:{cursor}, signal})).data;
  verifySourcePage(page, review, offset);
  if (signal.aborted) throw new Error('Saved review files could not be verified');
  return page;
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
  const sampleDecision=review.sample_decision??'none';
  const sampleIndices=review.sample_object_indices??[];
  const sampleFiles = typeof review.sample_status === 'object' && review.sample_status?.state === 'selected'
    ? review.sample_status.files : [];
  const confirmationVersionValid = review.license_selection
    ? review.confirmation_version === 'seller-listing-confirmation-v3'
    : review.confirmation_version === (sampleDecision === 'member_files' ? 'seller-listing-confirmation-v2' : 'seller-listing-confirmation-v1');
  const sampleShapeValid = sampleDecision === 'member_files'
    ? confirmationVersionValid && sampleIndices.length > 0 &&
      sampleIndices.length <= 10 && sampleFiles.length === sampleIndices.length &&
      sampleFiles.every((file, position) => file.index === sampleIndices[position] &&
        Number.isSafeInteger(file.index) && file.index >= 0 && Number.isSafeInteger(file.size) && file.size >= 0 &&
        typeof file.key_basename === 'string' && !!file.key_basename && /^[a-f0-9]{64}$/.test(file.sha256))
    : sampleDecision === 'none' && confirmationVersionValid &&
      sampleIndices.length === 0 && (review.sample_status===undefined || review.sample_status === 'not_selected');
  const baseConfirmations = review.license_selection ? LICENSE_CONFIRMATION_KEYS : CONFIRMATION_KEYS;
  const requiredConfirmations: ConfirmationKey[] = [...baseConfirmations,
    ...(sampleDecision === 'member_files' ? ['sample_files_confirmed' as const] : [])];
  if (review.approval_available && (!sampleShapeValid ||
      requiredConfirmations.some(key => typeof review.confirmation_statements?.[key] !== 'string' || !review.confirmation_statements[key].trim())))
    throw new Error('Saved review could not be verified');
  if (review.approval_available) {
    try { verifySourcePage(review.source_page as ReviewSourcePage, review, 0); }
    catch { throw new Error('Saved review could not be verified'); }
  }
  if (review.approval && (review.approval.review_hash !== review.review_hash || review.approval.render_hash !== review.render_hash ||
      review.approval.draft_version !== review.draft_version || review.approval.source_version !== review.source_version || review.approval.sample_decision !== sampleDecision ||
      (review.license_selection && !sameLicenseSelection(review.approval.license_selection, review.license_selection))))
    throw new Error('Saved review could not be verified');
  return review;
}

export async function approveListingReview(review: ListingReview, request_id: string, signal: AbortSignal): Promise<ApprovalReceipt> {
  const sampleDecision=review.sample_decision??'none';
  const licenseConfirmations=review.license_selection ? {price_confirmed:true,license_confirmed:true,covenant_authority_confirmed:true,license_selection:review.license_selection} : {price_license_confirmed:true};
  const body = {request_id,review_hash:review.review_hash,render_hash:review.render_hash,
    confirmation_version:review.confirmation_version,sample_decision:sampleDecision,
    ownership_confirmed:true,privacy_confirmed:true,...licenseConfirmations,public_disclosure_confirmed:true,
    ...(sampleDecision === 'member_files' ? {sample_files_confirmed:true} : {})};
  const receipt: ApprovalReceipt = (await api.post('/seller-workspace/listing-approval',body,{signal})).data;
  if (receipt.review_hash !== review.review_hash || receipt.render_hash !== review.render_hash ||
      receipt.draft_version !== review.draft_version || receipt.source_version !== review.source_version ||
      receipt.sample_decision !== sampleDecision || signal.aborted ||
      (review.license_selection && !sameLicenseSelection(receipt.license_selection, review.license_selection)))
    throw new Error('Approval could not be verified');
  return receipt;
}
