import { api, observeListingSourceDispatch } from './client';
import {nativeWrite} from './connector-seller-settings';
import { beginSellerWorkspaceCrashSourceRead, clearSellerWorkspaceCrashDraft } from '@/lib/seller-workspace-crash-access';
export interface SourceContent {
  connection_id: string; connection_version: number; version_mode: 'current' | 'versions';
  objects: Array<{key: string; version_id: string | null; etag: string; size: number}>;
}
export interface SourceRead { version: number; content: SourceContent; connection_current: boolean }
export interface SourceResponse { source: SourceRead | null; current_draft_id: string | null }
export interface SourceSaveResponse extends SourceResponse { source: SourceRead }
export async function readListingSource(draft_id?: string | null): Promise<SourceResponse> {
  const observation = beginSellerWorkspaceCrashSourceRead(draft_id);
  const params = draft_id ? { params: { draft_id } } : undefined;
  const config = observation ? { ...params, adapter: observeListingSourceDispatch(observation.dispatch) } : params;
  let response: SourceResponse | undefined;
  try {
    const { data } = await api.get<SourceResponse>('/seller-workspace/listing-source', config);
    response = data;
    return data;
  } finally {
    observation?.finish(response);
  }
}
export async function saveListingSource(content: SourceContent, expected_version: number, request_id: string, expected_current_draft_id: string | null, draft_id?: string | null): Promise<SourceSaveResponse> {
  clearSellerWorkspaceCrashDraft();
  // Null asserts the empty draft observed by this editor; never omit the precondition.
  const body={content,expected_version,request_id,expected_current_draft_id};
  if(draft_id)return nativeWrite<SourceSaveResponse>('/seller-workspace/listing-source',{...body,draft_id},undefined,'put');
  return (await api.put('/seller-workspace/listing-source', body)).data;
}

export interface SellerCategory {slug: string; name: string}
export async function readSellerCategories(signal?: AbortSignal): Promise<SellerCategory[]> {
  const data: unknown = (await api.get('/seller-workspace/categories', {signal})).data;
  if (!Array.isArray(data) || !data.every(item => item && typeof item.slug === 'string' && typeof item.name === 'string'))
    throw new Error('The seller category list could not be read.');
  return data;
}
