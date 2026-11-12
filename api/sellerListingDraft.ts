import { api } from './client';
import {nativeWrite} from './connector-seller-settings';

import type {LicenseSelection} from './listingLicenses';

export const EMPTY_LISTING_DRAFT:ListingDraftContent={brief:'',title:'',description:'',category:'',tags:'',price:'',license:''};

export interface ListingDraftContent {
  brief: string;
  title: string;
  description: string;
  description_source_version?: number | null;
  category: string;
  tags: string;
  price: string;
  license: string;
  license_selection?: LicenseSelection;
  sample_decision?: 'none' | 'member_files';
  sample_object_indices?: number[];
}
export interface SavedListingDraft {
  draft_id?: string | null;
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

export async function createListingDraft(requestId:string):Promise<SavedListingDraft> {
  return (await nativeWrite<{draft:SavedListingDraft}>('/seller-workspace/listing-drafts', {request_id:requestId,content:EMPTY_LISTING_DRAFT})).draft;
}
