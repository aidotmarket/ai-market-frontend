import { api } from './client';
import type { ListingDraftContent } from './sellerListingDraft';
export interface ListingReview {
  fields: Pick<ListingDraftContent, 'title' | 'description' | 'category' | 'tags' | 'price' | 'license'>;
  draft_version: number; source_version: number; presentation_version: string; review_hash: string;
  missing_fields: string[]; approval_available: boolean; sample_status: string;
}
export async function readListingReview(signal: AbortSignal): Promise<ListingReview> {
  return (await api.get('/seller-workspace/listing-review', {signal})).data;
}
