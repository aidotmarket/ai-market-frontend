import { api } from './client';
import type {LicenseSelection} from './listingLicenses';

export interface ListingDraftContent {
  brief: string;
  title: string;
  description: string;
  category: string;
  tags: string;
  price: string;
  license: string;
  license_selection?: LicenseSelection;
  sample_decision?: 'none' | 'member_files';
  sample_object_indices?: number[];
}
export interface SavedListingDraft {
  version: number;
  content: ListingDraftContent;
  updated_at: string;
}
const path = '/seller-workspace/listing-draft';
export async function readListingDraft(signal?: AbortSignal): Promise<SavedListingDraft | null> {
  return (await api.get<{ draft: SavedListingDraft | null }>(path, { signal })).data.draft;
}
export async function saveListingDraft(content: ListingDraftContent, version: number, requestId: string): Promise<SavedListingDraft> {
  return (await api.put<{ draft: SavedListingDraft }>(path, {
    content, expected_version: version, request_id: requestId,
  })).data.draft;
}
