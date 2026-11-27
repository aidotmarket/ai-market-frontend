import type {ListingDocument} from '@/types/listingDocuments';

function safePdfAddress(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://') || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function selectListingDocumentation(documents: ListingDocument[]) {
  const technical = documents.find(document => document.kind === 'technical_markdown');
  const pdf = documents.find((document): document is ListingDocument & {pdf_url: string} =>
    document.kind === 'data_sheet_pdf' && safePdfAddress(document.pdf_url));
  return {technical, pdf};
}
