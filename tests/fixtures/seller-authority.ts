import type { StandingLimits, AuthorityStatus, PreviewStatus } from '@/api/connector-seller-settings';
import type { SigningInstrument } from '@/api/seller-batch-signing';
import { createStandardSelection } from '@/api/listingLicenses';
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const hash = 'a'.repeat(64);
export const limits: StandingLimits = { grant_ids: [id(1)], client_ids: ['https://verified.test'], operations: ['publish'], categories: ['Finance'], source_kinds: ['aws'], connection_ids: [id(2)], mutable_fields: ['title'], max_batch: 50, daily_items: { publish: 50 }, concurrent_operations: 2, price_min_cents: 0, price_max_cents: 10000, max_price_delta_cents: 100, currency: 'USD', sample_rule: 'none_or_unchanged_approved', expires_at: '2099-01-01T00:00:00Z' };
export const authority: AuthorityStatus = { version: 4, enabled: true, limits, utc_day: '2026-10-10', usage: [{ action: 'aim.listing.publish', reserved: 8, success: 12 }] };
export const preview: PreviewStatus = { listing_id: id(10), publication_version_id: id(11), version: 3, enabled: false, sample_set_hash: null, sample_available: false, consent_publication_version_id: id(12), consent_sample_set_hash: hash, grant_ids: [], profiles: [] };
export function instrument(n = 1): SigningInstrument {
  return { id: id(n), status: 'prepared', coverage_hash: hash, acceptance_id: null, signing_required: true,
    binding: { preparation_id: id(n), seller_id: id(99), organization_id: null, draft_id: id(n + 100), draft_version: 3, approval_id: id(n + 200), listing_id: id(n + 300), version_id: id(n + 400), base_version_id: null, source_hash: hash, render_hash: hash, enrichment_hash: hash, sample_set_hash: hash, legal_selection_hash: hash, legal_document_hash: hash, legal_identity_hash: hash, legal_identity_version: 2 },
    license_selection: { ...createStandardSelection(), seller_acceptance: { signer_name: 'Fixture Seller', signer_title: 'Owner', authority_confirmed: true } } };
}
