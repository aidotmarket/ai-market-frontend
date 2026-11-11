import type { LicenseSelection } from './listingLicenses';
import type { ConfirmationKey, ListingApprovalV1, ListingApprovalV3 } from './sellerListingReview';

/** Backend PR #1063, 117f3468b86c4dbb0679a82cbf4300376b28a11c.
 * C0 contracts only: no endpoint calls or rollout activation.
 */
export const LISTING_AUTHORITY_CONTRACT_VERSION = 'listing-authority-v1' as const;
export type ListingAuthorityContractVersion = typeof LISTING_AUTHORITY_CONTRACT_VERSION;
export const NO_ORGANISATION = 'none (not on ai.market)' as const;

/** Checks only the version token, never validates an entire binding or proves coverage. */
export function isListingAuthorityContractVersion(value: unknown): value is ListingAuthorityContractVersion {
  return value === LISTING_AUTHORITY_CONTRACT_VERSION;
}

/** Absent/null references preserve uncovered records; they never imply consent. */
export interface ListingAuthorityReferences {
  authority_import_id?: string | null;
  authority_version_id?: string | null;
}

export interface AuthoritySubject {
  kind: 'organisation' | 'seller_none';
  id: string;
}

export interface NativeAttestation {
  pack_id: string;
  source_revision: number;
  commitment: string;
  reviewed: true;
}

export interface PurchaserConfirmation {
  gateway_metadata_revision: number;
  view_hash: string;
  confirmed: true;
}

/** UUID/digest/revision constraints and binding consistency are validated by the server. */
export interface AuthorityBinding {
  contract_version: ListingAuthorityContractVersion;
  seller_id: string;
  organisation_id: string | null;
  provenance_id: string;
  pack_id: string;
  source_kind: 'gateway' | 'bucket';
  source_revision: number;
  delivery_revision: number;
  native_commitment: string;
  file_hash_set_commitment?: string | null;
  bucket_selection_fingerprint?: string | null;
  public_fields_hash: string;
  render_hash: string;
  presentation_version: string;
  native_attestation: NativeAttestation;
  purchaser_confirmation?: PurchaserConfirmation | null;
  legal_identity_id: string;
  license_selection: LicenseSelection | null;
  policy_revision: number;
  stop_generation: number;
  version_stop_sequence: number;
}

export type AuthorityStatementVariant = 'organisation_authorised' | 'own_data';

interface CoveredApprovalFields {
  authority_binding_hash: string;
  organisation_authority_confirmed: true;
  authority_statement_variant: AuthorityStatementVariant;
}

export type CoveredApprovalV1 = Omit<ListingApprovalV1, 'confirmation_version'> & CoveredApprovalFields & {
  confirmation_version: 'seller-listing-confirmation-v1-authority-v1';
};

// Distribute over the sample choice so member_files always requires its true tick.
export type CoveredApprovalV3 = (ListingApprovalV3 extends infer Choice
  ? Choice extends ListingApprovalV3 ? Omit<Choice, 'confirmation_version'> : never
  : never) & CoveredApprovalFields & {
  confirmation_version: 'seller-listing-confirmation-v3-authority-v1';
};
export type CoveredApproval = CoveredApprovalV1 | CoveredApprovalV3;
export type ListingApproval = ListingApprovalV1 | ListingApprovalV3 | CoveredApproval;
export type CoveredConfirmationVersion = CoveredApproval['confirmation_version'];

/** Version discrimination only. Unknown versions are neither covered nor uncovered. */
export function isCoveredConfirmationVersion(value: unknown): value is CoveredConfirmationVersion {
  return value === 'seller-listing-confirmation-v1-authority-v1' ||
    value === 'seller-listing-confirmation-v3-authority-v1';
}

/** Intentionally excludes legacy seller-listing-confirmation-v2; must not gate the legacy v2 reader path. */
export function isUncoveredConfirmationVersion(value: unknown): value is ListingApprovalV1['confirmation_version'] | ListingApprovalV3['confirmation_version'] {
  return value === 'seller-listing-confirmation-v1' || value === 'seller-listing-confirmation-v3';
}

export function isCoveredApproval(value: ListingApproval): value is CoveredApproval {
  return isCoveredConfirmationVersion(value.confirmation_version);
}

/** Server statement_snapshot wire shape. No organisation name is collected.
 * statement is the exact server-supplied sentence, never client-authored authority.
 */
export type AuthorityStatementSnapshot = {
  statement: string;
  confirmation_version: CoveredConfirmationVersion;
} & (
  | { organisation: string; variant: 'organisation_authorised' }
  | { organisation: typeof NO_ORGANISATION; variant: 'own_data' }
);

/** Discriminates the required explicit organisation_id in a server binding.
 * A no-org seller may choose either statement, without an organisation name.
 */
export type BoundOrganisationAuthority = {
  organisation_id: string;
  authority_statement_variant: 'organisation_authorised';
};
export type NoOrganisationAuthority = {
  organisation_id: null;
  organisation: typeof NO_ORGANISATION;
  authority_statement_variant: AuthorityStatementVariant;
};
/** Client-side helper combining binding organisation_id and snapshot organisation, not a backend wire shape. */
export type AuthorityStatementContext = BoundOrganisationAuthority | NoOrganisationAuthority;

/** covered_confirmation_contract output; sentences always come from the server. */
export interface CoveredConfirmationContract {
  version: CoveredConfirmationVersion;
  statements: Partial<Record<ConfirmationKey, string>>;
  authority_statement_variants: Record<AuthorityStatementVariant, string>;
}

export interface PolicyUpdate {
  contract_version: ListingAuthorityContractVersion;
  expected_revision: number;
  idempotency_key: string;
  listing_enabled: boolean;
  approval_required: boolean;
}

export interface CompanyDecision {
  contract_version: ListingAuthorityContractVersion;
  decision: 'approve' | 'refuse' | 'withdraw';
  expected_binding_hash: string;
  expected_policy_revision: number;
  idempotency_key: string;
}

export interface ReviewConfirmation {
  contract_version: ListingAuthorityContractVersion;
  authority_version_id: string;
  expected_binding_hash: string;
  idempotency_key: string;
  confirmed: true;
}

/** Gate 2 C3 discriminants; C0 adds no error mapping or fallback behavior. */
export type ListingAuthorityConflictCode =
  | 'AUTHORITY_CONFIRMATION_REQUIRED'
  | 'AUTHORITY_LISTING_STOPPED'
  | 'AUTHORITY_REVIEW_STALE';

export type ListingAuthorityError =
  | { status: 409; code: ListingAuthorityConflictCode }
  // The spec defines a status only for this case, not a backend wire code.
  | { status: 503; kind: 'enforcement_unavailable' };
