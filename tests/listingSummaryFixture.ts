import type { ListingPublicListResponse } from '@/types';

export const projectedSummary = 'Approved coverage and source notes.';
export const markdownDescription = '## Coverage\n**Approved coverage** and [source notes](https://example.org/source).';
export const conflictingShortDescription = 'Conflicting seller marketing copy.';

export const listingSummaryCases = (summary = projectedSummary) => [
  { state: 'string', summary },
  { state: 'empty string', summary: '' },
  { state: 'null', summary: null },
  { state: 'absent key', summary: undefined },
] as const;

// /api/v1/public/listings carries short copy, without the full Markdown field.
export const browseResponse = {
  items: [{
    id: '34d90f70-6fbb-42e9-bf13-eb4eba93e9c8',
    slug: 'coverage-dataset',
    title: 'Coverage dataset',
    short_description: conflictingShortDescription,
    category: 'Business',
    tags: [],
    fulfillment_type: 'file_download',
    task_category: null,
    domain_tags: null,
    pricing: { price: 12, pricing_type: 'one_time', subscription_price_monthly: null },
    price: 12,
    privacy_score: null,
    privacy_scan_status: 'not_scanned',
    trust_level: 'L0',
    view_count: 0,
    published_at: '2026-11-20T00:00:00Z',
    purchasable: true,
    purchase_hold_reason: null,
  }],
  pagination: { page: 1, per_page: 4, total: 1, total_pages: 1, has_next: false, has_prev: false },
  jsonld: null,
} satisfies ListingPublicListResponse;
