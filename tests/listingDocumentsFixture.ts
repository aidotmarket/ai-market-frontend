import type {DocumentKind, SellerDocument, SellerDocuments} from '@/types/listingDocuments';

export function documentFixture(kind: DocumentKind = 'technical_markdown', overrides: Partial<SellerDocument> = {}): SellerDocument {
  return {
    kind, title: kind === 'technical_markdown' ? 'Technical guide' : 'Product data sheet', revision: 1,
    state: 'draft', published_at: null, render_hash: 'a'.repeat(64),
    ...(kind === 'technical_markdown' ? {body_markdown: '**Local source**', body_html: '<p>SERVER <strong>RENDER</strong></p>'} : {
      pdf_url: 'https://cdn.example.com/spec.pdf', pdf_filename: 'spec.pdf', pdf_size_bytes: 1024,
      pdf_sha256: 'b'.repeat(64),
    }), ...overrides,
  };
}

export function documentsFixture(): SellerDocuments {
  return {
    data_sheet_available: true,
    documents: {
      technical_markdown: {max_revision: 0, draft: null, published: null, withdrawn: null},
      data_sheet_pdf: {max_revision: 0, draft: null, published: null, withdrawn: null},
    },
  };
}
