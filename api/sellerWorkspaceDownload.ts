import { api } from './client';

export interface WorkspaceFileGrant {
  filename: string; size: number; url: string; headers: { 'If-Match': string }; expires_at: string;
}
export interface WorkspaceDownload {
  delivery_type: 'workspace_direct'; files: WorkspaceFileGrant[];
  download_number: number; downloads_remaining: number;
}
export function validateWorkspaceDownload(value: unknown): WorkspaceDownload {
  const data = value as WorkspaceDownload;
  if (!data || data.delivery_type !== 'workspace_direct' || !Array.isArray(data.files) || !data.files.length || data.files.length > 10 ||
      !Number.isSafeInteger(data.download_number) || data.download_number < 1 || !Number.isSafeInteger(data.downloads_remaining) || data.downloads_remaining < 0) throw new Error('Invalid download response');
  for (const file of data.files) {
    if (!file || typeof file.filename !== 'string' || !file.filename || file.filename.length > 1024 || !Number.isSafeInteger(file.size) || file.size < 0 ||
        typeof file.url !== 'string' || file.url.length > 20000 || typeof file.headers?.['If-Match'] !== 'string' ||
        !/^"[\x21\x23-\x7e]+"$/.test(file.headers['If-Match']) || Object.keys(file.headers).length !== 1 ||
        !Number.isFinite(Date.parse(file.expires_at)) || Date.parse(file.expires_at) <= Date.now()) throw new Error('Invalid download response');
    const url = new URL(file.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !/^(?:[a-z0-9.-]+\.)?s3\.[a-z]{2}-[a-z]+-[0-9]\.amazonaws\.com$/.test(url.hostname) ||
        url.searchParams.get('X-Amz-SignedHeaders') !== 'host;if-match') throw new Error('Invalid download response');
  }
  return data;
}
export async function requestWorkspaceDownload(orderId: string, signal: AbortSignal): Promise<WorkspaceDownload> {
  const response = await api.post(`/seller-workspace/orders/${encodeURIComponent(orderId)}/download`, undefined, { signal });
  signal.throwIfAborted();
  return validateWorkspaceDownload(response.data);
}
