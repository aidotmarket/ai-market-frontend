import type { WorkspaceDownload, WorkspaceFileGrant, WorkspaceFileEntry } from '@/api/sellerWorkspaceDownload';

export interface DownloadWriter {
  write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void>;
}
export interface DownloadDirectory {
  getDirectoryHandle(name: string, options: {create: boolean}): Promise<DownloadDirectory>;
  getFileHandle(name: string, options: {create: boolean}): Promise<{createWritable(): Promise<DownloadWriter>}>;
}
export class WorkspaceDownloadError extends Error {
  constructor(public readonly code: 'file_changed' | 'unavailable' | 'size_changed' | 'memory') { super(code); }
}
export async function saveWorkspaceFile(entry: WorkspaceFileEntry, index: number, signal: AbortSignal,
  progress: (file: string, bytes: number, size: number, fileNumber: number) => void,
  loadGrant: (entry: WorkspaceFileEntry) => Promise<WorkspaceFileGrant>,
  createWriter: (filename: string) => Promise<DownloadWriter>, fetchFile: typeof fetch = fetch): Promise<string> {
  signal.throwIfAborted();
  const file=await loadGrant(entry);
  signal.throwIfAborted();
  if (file.size!==entry.size || file.filename!==entry.filename) throw new WorkspaceDownloadError('size_changed');
  if (Date.parse(file.expires_at) <= Date.now()) throw new WorkspaceDownloadError('unavailable');
  const response = await fetchFile(file.url, {method:'GET',headers:{'If-Match':file.headers['If-Match']},
    signal,mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new WorkspaceDownloadError(response.status === 412 ? 'file_changed' : 'unavailable');
  }
  // Numbering avoids collisions; replacing separators and control characters prevents paths.
  const filename = `${String(index+1).padStart(3,'0')}-${file.filename.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,'_').slice(0,180)}`;
  let writer: DownloadWriter | undefined;
  const reader = response.body.getReader();
  let received = 0;
  try {
    writer = await createWriter(filename);
    while (true) {
      signal.throwIfAborted();
      const {done,value} = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > file.size) throw new WorkspaceDownloadError('size_changed');
      await writer.write(value);
      progress(file.filename, received, file.size, index+1);
    }
    signal.throwIfAborted();
    if (received !== file.size) throw new WorkspaceDownloadError('size_changed');
    await writer.close();
    return filename;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await writer?.abort().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}
export async function streamWorkspaceDownload(bundle: WorkspaceDownload, directory: DownloadDirectory,
  signal: AbortSignal, progress: (file: string, bytes: number, size: number, fileNumber: number) => void,
  loadGrant: (entry: WorkspaceFileEntry) => Promise<WorkspaceFileGrant>, fetchFile: typeof fetch = fetch): Promise<string> {
  signal.throwIfAborted();
  const folderName = `ai-market-${crypto.randomUUID()}`;
  const folder = await directory.getDirectoryHandle(folderName, {create:true});
  for (const [index,entry] of bundle.files.entries()) {
    await saveWorkspaceFile(entry,index,signal,progress,loadGrant,async filename => {
      const handle = await folder.getFileHandle(filename, {create:true});
      return handle.createWritable();
    },fetchFile);
  }
  return folderName;
}
