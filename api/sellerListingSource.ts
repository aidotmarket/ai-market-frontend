import { api } from './client';
export interface SourceContent {
  connection_id: string; connection_version: number; version_mode: 'current' | 'versions';
  objects: Array<{key: string; version_id: string | null; etag: string; size: number}>;
}
export interface SourceRead { version: number; content: SourceContent; connection_current: boolean }
export async function readListingSource(): Promise<SourceRead | null> {
  return (await api.get('/seller-workspace/listing-source')).data.source;
}
export async function saveListingSource(content: SourceContent, expected_version: number, request_id: string): Promise<SourceRead> {
  return (await api.put('/seller-workspace/listing-source', {content, expected_version, request_id})).data.source;
}
