import type { ListingDetail } from '@/types';

// Synthetic retained-claim payload; not measured current backend projection.
export function sampleFixture(overrides: Record<string, unknown> = {}): ListingDetail {
  return {
    id: 'arbitrary-listing', slug: 'arbitrary-slug', title: 'Clinical Trial Outcomes — Anonymized (2024)',
    description: 'RETAINED_UNSUPPORTED HIPAA GDPR clinical performance real service',
    short_description: 'Old facility marketing', publisher: { display_name: 'Old seller', trust_level: 'L1' },
    pricing: { price: 0, pricing_type: 'one_time', subscription_price_monthly: null },
    fulfillment_type: 'file_download', purchasable: false, purchase_hold_reason: 'generated_sample_display_only',
    generated_sample: {label: 'SAMPLE', display_only: true}, license: 'Old seller terms', license_status: 'pending_seller_terms',
    tags: ['old inferred claim'], category: 'Business', row_count: 8400,
    secondary_categories: null, task_category: null, domain_tags: null,
    data_format: 'csv', update_frequency: null, coverage: null,
    privacy_scan_status: 'scanned', searchability_score: 80, is_accessible_for_free: true,
    created_at: '2026-09-25T00:00:00Z', updated_at: null, scan_findings: null,
    schema_summary: { columns: ['facility_coordinates'], column_count: 1, sample_types: null },
    privacy_score: 9, trust_level: 'L1', view_count: 42, inquiry_count: 99,
    published_at: '2026-09-25T00:00:00Z', noindex: false,
    jsonld: { '@type': 'Dataset', name: 'Old facility claims', offers: { price: 450 } },
    ...overrides,
  };
}

// Accepted exact-seven identity controls; these fixtures do not measure current rows.
export const originalSampleIdentities = [
  {
    "id": "e76e7f79-654e-473d-825e-8839e623db08",
    "slug": "clinical-trial-outcomes-anonymized-2024",
    "title": "Clinical Trial Outcomes — Anonymized (2024)"
  },
  {
    "id": "754eeffa-c50f-40df-a904-29aafacd3a89",
    "slug": "global-supply-chain-disruption-index",
    "title": "Global Supply Chain Disruption Index"
  },
  {
    "id": "015d24c1-9236-4501-9000-e93859bad6f8",
    "slug": "european-manufacturing-sensor-data-2025",
    "title": "European Manufacturing Sensor Data (2025)"
  },
  {
    "id": "0c551ded-30a6-4e56-a895-4100bf1a2b45",
    "slug": "gpt-4o-text-generation-api-8ef20916",
    "title": "GPT-4o Text Generation API"
  },
  {
    "id": "a9bfd5cf-81ed-4847-b0a3-e1d226c51226",
    "slug": "stable-diffusion-xl-image-generation-c3ca0ed2",
    "title": "Stable Diffusion XL Image Generation"
  },
  {
    "id": "4508fa00-7ff1-4e61-a0f4-ea0b8c84e036",
    "slug": "whisper-v3-speech-to-text-pipeline-b5147e2c",
    "title": "Whisper V3 Speech-to-Text Pipeline"
  },
  {
    "id": "2da47e51-849b-4268-ae6e-de7b1db8c2c1",
    "slug": "medical-ner-and-entity-extraction-4fff7482",
    "title": "Medical NER and Entity Extraction"
  }
] as const;
