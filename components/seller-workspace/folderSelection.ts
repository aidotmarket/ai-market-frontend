import axios from 'axios';
import { SellerWorkspaceApiError, type WorkspaceObject } from '@/api/sellerWorkspace';

export const MAX_SELECTION_FILES = 50_000;
export const MAX_SELECTION_METADATA_BYTES = 64_000_000;
export const identity = (object: WorkspaceObject) => JSON.stringify([object.key, object.version_id]);
export class FolderSelectionError extends Error {}
export type FolderProgress = { files: number; bytes: number };
export class FolderRequestError extends FolderSelectionError {
  constructor(error: SellerWorkspaceApiError | import('axios').AxiosError, readonly progress: FolderProgress) {
    const status = error instanceof SellerWorkspaceApiError ? error.status : error.response?.status;
    const detail: unknown = error instanceof SellerWorkspaceApiError ? error.detail
      : error.response?.data && (error.response.data as { detail?: unknown }).detail;
    const reason = typeof detail === 'string' ? detail
      : status === undefined ? 'the connection to ai.market was interrupted'
      : status === 400 ? 'the folder listing request was invalid'
      : status === 401 || status === 403 ? 'your sign-in or access to this connection changed'
      : status === 404 ? 'the connection or folder was not found'
      : status === 429 ? 'too many requests to your storage; wait a minute and try again'
      : status !== undefined && status >= 500 && status < 600 ? 'the storage provider did not respond'
      : 'the storage request failed';
    super(reason);
  }
}

// Add each metadata record once instead of reserializing the entire selection
// after every provider page. Repeated observations must agree exactly.
function accumulator(initial: WorkspaceObject[] = []) {
  const entries = new Map<string, WorkspaceObject>();
  let bytes = 0;
  let metadataBytes = 2;
  const encoder = new TextEncoder();
  const add = (items: WorkspaceObject[]) => {
    for (const item of items) {
      const previous = entries.get(identity(item));
      if (previous) {
        if (previous.etag !== item.etag || previous.size !== item.size) {
          throw new FolderSelectionError('A selected file changed while we were checking it. Clear the selection and try again.');
        }
        continue;
      }
      if (entries.size >= MAX_SELECTION_FILES) throw new FolderSelectionError('This selection exceeds the current 50,000-file limit. No partial folder has been added.');
      if (!Number.isSafeInteger(item.size) || item.size < 0 || !Number.isSafeInteger(bytes + item.size)) {
        throw new FolderSelectionError('The selection size could not be verified.');
      }
      metadataBytes += encoder.encode(JSON.stringify(item)).length + 1;
      if (metadataBytes > MAX_SELECTION_METADATA_BYTES) throw new FolderSelectionError('This selection contains too much file metadata. No partial folder has been added.');
      entries.set(identity(item), item);
      bytes += item.size;
    }
  };
  add(initial);
  return { add, result: () => [...entries.values()], progress: () => ({ files: entries.size, bytes }) };
}

export function mergeSelection(existing: WorkspaceObject[], added: WorkspaceObject[]): WorkspaceObject[] {
  const selected = accumulator(existing);
  selected.add(added);
  return selected.result();
}

export async function resolveFolder(
  connectionId: string,
  prefix: string,
  list: (id: string, prefix: string, cursor?: string) => Promise<{ objects: WorkspaceObject[]; next_cursor: string | null }>,
  options: { onProgress?: (progress: FolderProgress) => void; cancelled?: () => boolean; onRateLimit?: (waiting: boolean) => void; wait?: (milliseconds: number) => Promise<void> } = {},
): Promise<WorkspaceObject[]> {
  const root = prefix === '' ? '' : prefix.replace(/\/+$/, '') + '/';
  const files = accumulator();
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 1000; page++) {
    if (options.cancelled?.()) throw new FolderSelectionError('Folder check cancelled.');
    let response: Awaited<ReturnType<typeof list>> | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        response = await list(connectionId, root, cursor);
        break;
      } catch (error) {
        // Only the pre-discovery rate rejection is safe to retry with this
        // single-use cursor. An unknown provider/network outcome is not.
        if (!(error instanceof SellerWorkspaceApiError) && !axios.isAxiosError(error)) throw error;
        const status = error instanceof SellerWorkspaceApiError ? error.status : error.response?.status;
        if (status !== 429 || attempt === 3) throw new FolderRequestError(error, files.progress());
        options.onRateLimit?.(true);
        try {
          await (options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(60_000);
        } finally { options.onRateLimit?.(false); }
        if (options.cancelled?.()) throw new FolderSelectionError('Folder check cancelled.');
      }
    }
    if (!response) throw new FolderSelectionError('The entire folder could not be checked.');
    if (options.cancelled?.()) throw new FolderSelectionError('Folder check cancelled.');
    if (response.objects.some(item => !item.key.startsWith(root))) throw new FolderSelectionError('The folder contents could not be verified.');
    files.add(response.objects.filter(item => !item.key.endsWith('/')));
    options.onProgress?.(files.progress());
    if (!response.next_cursor) return files.result();
    if (seen.has(response.next_cursor)) throw new FolderSelectionError('The folder contents could not be verified. Try again.');
    seen.add(response.next_cursor);
    cursor = response.next_cursor;
  }
  throw new FolderSelectionError('The entire folder could not be checked. No partial folder has been added.');
}
