export type DocumentKind = 'technical_markdown' | 'data_sheet_pdf';

export interface PdfMetadata {
  pdf_filename: string;
  pdf_size_bytes: number;
  pdf_sha256: string;
}

export interface ListingDocument {
  kind: DocumentKind;
  title: string;
  revision: number;
  published_at: string | null;
  body_markdown?: string | null;
  body_html?: string | null;
  pdf_url?: string | null;
  pdf_filename?: string | null;
  pdf_size_bytes?: number | null;
  pdf_sha256?: string | null;
}

export interface SellerDocument extends ListingDocument {
  state: 'draft' | 'published' | 'withdrawn';
  render_hash: string;
}

export interface DocumentState {
  max_revision: number;
  draft: SellerDocument | null;
  published: SellerDocument | null;
  withdrawn: SellerDocument | null;
}

export interface SellerDocuments {
  documents: Record<DocumentKind, DocumentState>;
  data_sheet_available: boolean;
}

export type DocumentDraft = {expected_revision: number; title: string} & (
  {body_markdown: string} | (PdfMetadata & {pdf_url: string})
);
