import { createHash } from 'node:crypto';
import { createStandardSelection } from '../api/listingLicenses';
import type { CapabilityReadiness } from '../api/capabilities';
import type { SavedListingDraft } from '../api/sellerListingDraft';
import type { ApprovalReceipt, ListingReview } from '../api/sellerListingReview';
import type { PreparedListing } from '../api/sellerListingPreparation';
import type { SellerLegalIdentity } from '../api/sellerLegalIdentity';
import type { User } from '../types';
import { categoryRows, emptyGuidedDraft, guidedCapabilities, guidedConnection, guidedObjects } from './guidedListingFixture';

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const savedAt = '2026-10-01T00:00:00Z';
const seller = {
  id: id(2), email: 'seller@workspace-smoke.test', first_name: 'Sam', last_name: 'Seller',
  company_name: 'Synthetic Seller', role: 'seller', status: 'active', is_test: true,
  created_at: savedAt, email_verified_at: savedAt, totp_enabled: true,
  auth_methods: ['email'], primary_auth: 'email',
} satisfies User & { is_test: boolean };
const active = {
  effective_status: 'active', persisted_status: 'active', missing_steps: [], reason: null,
} satisfies CapabilityReadiness;
const identity = {
  status: 'known', source: 'stripe_connect', legal_name: 'Synthetic Seller', jurisdiction: 'ES', version: 1,
} satisfies SellerLegalIdentity;
const licenseSelection = {
  ...createStandardSelection(), identity_version: identity.version,
  seller_acceptance: { signer_name: 'Sam Seller', signer_title: 'Owner', authority_confirmed: true },
};

export const savedTitle = 'Synthetic weekly sales';
// Fake in-memory session value returned by the mocked /auth/refresh; not a credential.
export const mockSession = 'synthetic-workspace-session';
const draft = {
  draft_id: id(3), version: 1, updated_at: savedAt,
  content: {
    ...emptyGuidedDraft, title: savedTitle, description: 'Synthetic weekly sales data.',
    category: 'financial-data', tags: 'sales', price: '25', description_source_version: 1,
    license_selection: licenseSelection,
  },
} satisfies SavedListingDraft;
const source = {
  connection_current: true, version: 1,
  content: {
    connection_id: guidedConnection.id, connection_version: guidedConnection.version,
    version_mode: 'current', objects: guidedObjects,
  },
};
const renderedHtml = `<p>${savedTitle}</p>`;
const hash = 'a'.repeat(64);
const approval = {
  id: id(4), review_hash: hash, render_hash: createHash('sha256').update(renderedHtml).digest('hex'),
  draft_version: draft.version, source_version: source.version, approved_at: savedAt,
  sample_decision: 'none', license_selection: licenseSelection, covenant_confirmed_at: savedAt,
} satisfies ApprovalReceipt;
const review = {
  draft_id: draft.draft_id, draft_version: draft.version, source_version: source.version,
  fields: draft.content, presentation_version: 'seller-listing-review-v4', rendered_html: renderedHtml,
  render_hash: approval.render_hash, review_hash: approval.review_hash, source_hash: hash,
  missing_fields: [], approval_available: false, approval, license_selection: licenseSelection,
  confirmation_version: 'seller-listing-confirmation-v4', confirmation_statements: {},
} satisfies ListingReview;
const preparation = {
  id: id(5), status: 'signed', signing_required: false, acceptance_id: id(6),
  signed_coverage_hash: hash, coverage_hash: hash, license_selection: licenseSelection,
  binding: {
    preparation_id: id(5), seller_id: seller.id, organization_id: null,
    draft_id: draft.draft_id, draft_version: draft.version, approval_id: approval.id,
    listing_id: id(7), version_id: id(8), base_version_id: null,
    source_hash: hash, render_hash: review.render_hash, enrichment_hash: hash,
    sample_set_hash: hash, legal_selection_hash: hash, legal_document_hash: hash,
    legal_identity_hash: hash, legal_identity_version: identity.version,
  },
} satisfies PreparedListing;

export const workspaceReads = new Map<string, unknown>([
  ['/api/v1/auth/me', seller],
  ['/api/v1/auth/capabilities', { buyer: active, seller: active, next_action: null }],
  ['/api/v1/gateways', { gateways: [] }],
  ['/api/v1/notifications', { items: [], total: 0, limit: 20, offset: 0, unread_only: false }],
  ['/api/v1/notifications/unread-count', { unread_count: 0 }],
  ['/api/v1/support/pending-profile-changes', []],
  ['/api/v1/listing-authority/capabilities', { import_enabled: false, contract_version: 'listing-authority-v1', handoff_versions: [1] }],
  ['/api/v1/seller-workspace/capabilities', {
    ...guidedCapabilities,
    providers: {
      ...guidedCapabilities.providers,
      r2: { ...guidedCapabilities.providers.r2, connect: guidedCapabilities.providers.aws.connect },
    },
  }],
  ['/api/v1/seller-workspace/connections', { connections: [guidedConnection] }],
  [`/api/v1/seller-workspace/connections/${guidedConnection.id}/source-objects`, {
    objects: guidedObjects, next_cursor: null,
  }],
  ['/api/v1/seller-workspace/listing-draft', { draft }],
  ['/api/v1/seller-workspace/listing-source', { source, current_draft_id: draft.draft_id }],
  ['/api/v1/seller-workspace/categories', categoryRows],
  ['/api/v1/seller-workspace/legal-identity', identity],
  ['/api/v1/seller-workspace/listing-review', review],
  ['/api/v1/seller-workspace/listing-preparation', preparation],
  ['/api/v1/seller-workspace/listing-publication', { publication_available: true, publication: null }],
  ['/api/v1/seller-workspace/listing-publications', { items: [], page: 0, has_more: false }],
  ['/api/v1/seller-workspace/listings', { items: [], cursor: null }],
]);
