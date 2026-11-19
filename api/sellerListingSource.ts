import { api } from './client';
import {nativeWrite} from './connector-seller-settings';
export interface SourceContent {
  connection_id: string; connection_version: number; version_mode: 'current' | 'versions';
  objects: Array<{key: string; version_id: string | null; etag: string; size: number}>;
}
export interface SourceRead { version: number; content: SourceContent; connection_current: boolean }
export async function readListingSource(draft_id?: string | null): Promise<SourceRead | null> {
  return (await api.get('/seller-workspace/listing-source', draft_id ? {params:{draft_id}} : undefined)).data.source;
}
export async function saveListingSource(content: SourceContent, expected_version: number, request_id: string, expected_current_draft_id: string | null, draft_id?: string | null): Promise<SourceRead> {
  // Null asserts the empty draft observed by this editor; never omit the precondition.
  const body={content,expected_version,request_id,expected_current_draft_id};
  if(draft_id)return (await nativeWrite<{source:SourceRead}>('/seller-workspace/listing-source',{...body,draft_id},undefined,'put')).source;
  return (await api.put('/seller-workspace/listing-source', body)).data.source;
}

export interface SellerCategory {slug: string; name: string}
export async function readSellerCategories(signal?: AbortSignal): Promise<SellerCategory[]> {
  const data: unknown = (await api.get('/seller-workspace/categories', {signal})).data;
  if (!Array.isArray(data) || !data.every(item => item && typeof item.slug === 'string' && typeof item.name === 'string'))
    throw new Error('The seller category list could not be read.');
  return data;
}
