import type {PdfMetadata} from '@/types/listingDocuments';

export const PDF_LIMIT = 10 * 1024 * 1024;

/** Inspect and hash locally. Only the returned metadata is sent to the API. */
export async function hashDataSheet(file: File): Promise<PdfMetadata> {
  if (file.size === 0 || file.size > PDF_LIMIT) throw new Error('Choose a PDF no larger than 10 MB.');
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength));
  if (String.fromCharCode(...header) !== '%PDF-') throw new Error('Choose a valid PDF file (it must start with %PDF-).');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    pdf_filename: file.name,
    pdf_size_bytes: file.size,
    pdf_sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
  };
}
