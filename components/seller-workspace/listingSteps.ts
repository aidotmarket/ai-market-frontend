import type {SellerWorkspaceConnection} from '@/api/sellerWorkspace';
import type {SavedListingDraft} from '@/api/sellerListingDraft';
import type {SourceRead, SellerCategory} from '@/api/sellerListingSource';
import type {ListingReview} from '@/api/sellerListingReview';
import type {PublicationReceipt} from '@/api/sellerListingPublication';
import {isCompleteLicenseSelection} from '@/api/listingLicenses';
import type {WorkspaceView} from './WorkspaceOverview';

export const LISTING_STEPS = [
  ['storage', 'Connect your storage'], ['data', 'Choose your files'], ['license', 'Choose a licence'],
  ['listing', 'Describe and price'], ['review', 'Review'], ['publish', 'Publish'],
] as const;
export type ListingStep = {view: WorkspaceView; name: string; state: 'done'|'skipped'|'current'|'blocked'|'to do'; reason: string; next: boolean};
export const PRICE_REASON = 'Enter $0 for a free listing or $25 to $999,999.99 for a paid listing, with no more than two decimal places.';
export function admissiblePrice(price: string) {
  return /^[0-9]{1,12}(?:\.[0-9]{1,2})?$/.test(price) && Number(price) <= 999999.99 && (Number(price) === 0 || Number(price) >= 25);
}
export function reviewRefusal(review: ListingReview): string {
  if (review.missing_fields.includes('price')) return PRICE_REASON;
  if (review.missing_fields.includes('category')) return 'Choose a category from the list in Describe and price, then save.';
  if (review.missing_fields.includes('tags')) return 'Add at least one tag in Describe and price, then save.';
  return review.missing_fields.length ? `Complete and save these listing fields: ${review.missing_fields.join(', ')}.` : '';
}
export function listingSteps({connections, source, draft, categories, licensesEnabled, review, publication, reviewReason = '', pending = false, licenceDirty = false}: {
  connections: SellerWorkspaceConnection[]; source: SourceRead|null; draft: SavedListingDraft|null; categories: SellerCategory[];
  licensesEnabled: boolean; review: ListingReview|null; publication: PublicationReceipt|null; reviewReason?: string; pending?: boolean; licenceDirty?: boolean;
}): ListingStep[] {
  const content = draft?.content;
  const connected = connections.some(c => c.status === 'verified');
  const files = !!source?.connection_current && connections.some(c=>c.id===source.content.connection_id&&c.version===source.content.connection_version&&c.status==='verified') && !pending;
  const licence = !licensesEnabled || !licenceDirty && !!content?.license_selection && isCompleteLicenseSelection(content.license_selection);
  const currentReview = !!review && review.draft_version === draft?.version && review.source_version === source?.version;
  const legacyApproved = currentReview && !!review?.approval && content?.description_source_version == null;
  let describeReason = !content?.title.trim() ? 'Add a title in Describe and price, then save.'
    : !content.description.trim() ? 'Add a description in Describe and price, then save.'
    : !categories.some(c => c.slug === content.category) ? 'Choose a category from the list in Describe and price, then save.'
    : !content.tags.split(',').some(t => t.trim()) ? 'Add at least one tag in Describe and price, then save.'
    : !admissiblePrice(content.price) ? PRICE_REASON
    : !source || content.description_source_version !== source.version ? 'Your files changed after this description was written. Update it with Allai or confirm it matches your files, then save.' : '';
  // Never let a local field check overrule the current server review.
  if (currentReview && reviewRefusal(review!)) describeReason = reviewRefusal(review!);
  if (review && !currentReview) describeReason = 'The saved review changed elsewhere. Refresh Review to reload your saved files and draft before continuing.';
  if (reviewReason) describeReason = reviewReason;
  const described = !describeReason;
  // Keep a matching pre-rollout approval visible; new approval still requires confirmation.
  const existingApprovalValid = legacyApproved && describeReason === 'Your files changed after this description was written. Update it with Allai or confirm it matches your files, then save.';
  const approved = connected && files && licence && (described || existingApprovalValid) && currentReview && !!review?.approval;
  const published = approved && publication?.approval_id === review?.approval?.id;
  const done = [connected, files, licence, described, approved, !!published];
  const reasons = ['Add and verify a current storage connection.', pending ? 'Finish saving your file and sample choices before continuing.' : 'Choose and save files from a current storage connection.',
    'Choose a licence, read the terms and confirm your authority, then save.', describeReason,
    'Read the saved listing and confirm each statement to approve this review.', 'Publish your approved listing to make it available to buyers.'];
  const prerequisites=[[],[0],[],[1,2],[0,1,2,3],[4]];
  const first = done.findIndex(d => !d);
  return LISTING_STEPS.map(([view, name], i) => ({view, name, next: i === first, state: i === 2 && !licensesEnabled ? 'skipped' : done[i] ? 'done' : i === first ? 'current' : prerequisites[i].some(p=>!done[p]) ? 'blocked' : 'to do', reason: done[i] ? '' : reasons[i]}));
}
