import type {ListingSummary, SummaryField, SummaryPreview} from '@/lib/api';
export function field<T>(value: T, provenance: SummaryField['provenance'] = 'seller_entered'): SummaryField<T> {
  return {value, provenance, authority: 'seller_entered', source_reference: 'Listing.description', source_revision: 'a'.repeat(64)};
}
export const summary: ListingSummary = {
  profile: 'aim-listing-enrichment-profile-v2', row_meaning: field('One recorded sale', 'allai_generated'),
  intended_uses: field(['Sales analysis']), key_fields: field([{name: 'amount', type: 'decimal'}, {name: 'region', type: 'string'}], 'aim_metadata'),
  field_descriptions: field([{name: 'amount', description: 'Sale amount', unit: 'EUR'}], 'allai_generated'),
  row_count: field(0, 'aim_metadata'), column_count: field(2), size_bytes: field(12345),
  format: field('csv'), spatial_coverage: field('Spain'), temporal_coverage: field('2025'),
  data_languages: field(['es']), freshness: field('Monthly'), license: field('CC-BY-4.0'),
  delivery: field('File download'), privacy_status: field('Seller/local report; no independent scan implied'),
  sample_availability: field('No sample offered'),
};
export const preview: SummaryPreview = {
  summary_id: '11111111-1111-4111-8111-111111111111', source_revision: 'a'.repeat(64), summary_hash: 'b'.repeat(64), render_hash: 'c'.repeat(64),
  state: 'pending', status: 'pending', locale: 'en', at_a_glance: summary, sample_decision: 'none',
  approval_version: 'v1', generator_version: 's1294-p1-v2',
  approval_text: 'Approve the displayed metadata, including counts and coverage. No sample permission is granted. This does not attest data freshness or publish the listing.',
};

export const emptySummaries: ListingSummary[] = [
  {profile: summary.profile},
  Object.fromEntries(Object.entries(summary).map(([key, value]) =>
    [key, key === 'profile' ? value : {...value, provenance: 'absent'}])) as ListingSummary,
];
