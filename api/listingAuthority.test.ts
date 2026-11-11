import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  LISTING_AUTHORITY_CONTRACT_VERSION, NO_ORGANISATION,
  isListingAuthorityContractVersion, isCoveredConfirmationVersion,
  isUncoveredConfirmationVersion, isCoveredApproval,
} from './listingAuthority';
import type {
  AuthorityBinding, AuthorityStatementContext, CoveredApprovalV1, CoveredApprovalV3,
  ListingApproval, ListingAuthorityError, ListingAuthorityReferences, NoOrganisationAuthority,
} from './listingAuthority';
import type { ListingApprovalV1, ListingApprovalV3 } from './sellerListingReview';
import type { LicenseSelection } from './listingLicenses';

const common = {
  request_id: '00000000-0000-4000-8000-000000000001',
  review_hash: 'a'.repeat(64), render_hash: 'b'.repeat(64),
  ownership_confirmed: true, privacy_confirmed: true, public_disclosure_confirmed: true,
} as const;
const authority = {
  authority_binding_hash: 'c'.repeat(64), organisation_authority_confirmed: true,
  authority_statement_variant: 'organisation_authorised',
} as const;
const license: LicenseSelection = {
  kind: 'standard', version: '1.1', ai_training: false, license_document_id: null,
  license_sha256: 'd'.repeat(64), rider_sha256: null, covenant_code: 'marketplace-listing',
  covenant_version: '1.1', covenant_sha256: 'e'.repeat(64),
  seller_acceptance: { signer_name: 'Test', signer_title: 'Seller', authority_confirmed: true },
};
const v1: ListingApprovalV1 = {
  ...common, confirmation_version: 'seller-listing-confirmation-v1',
  sample_decision: 'none', price_license_confirmed: true,
};
const v3: ListingApprovalV3 = {
  ...common, confirmation_version: 'seller-listing-confirmation-v3',
  sample_decision: 'none', license_selection: license,
  price_confirmed: true, license_confirmed: true, covenant_authority_confirmed: true,
};
const coveredV1: CoveredApprovalV1 = {
  ...v1, ...authority, confirmation_version: 'seller-listing-confirmation-v1-authority-v1',
};
const coveredV3: CoveredApprovalV3 = {
  ...v3, ...authority, confirmation_version: 'seller-listing-confirmation-v3-authority-v1',
};

describe('listing authority contract version (fail closed)', () => {
  it('accepts the exact known version', () => {
    expect(isListingAuthorityContractVersion(LISTING_AUTHORITY_CONTRACT_VERSION)).toBe(true);
  });
  it.each([
    undefined, null, false, true, 1, '', 'listing-authority-v2', 'listing-authority-v0',
    'listing-authority-v1 ', 'LISTING-AUTHORITY-V1', {}, [],
    { contract_version: 'listing-authority-v1' }, ['listing-authority-v1'],
  ])('rejects unknown or malformed version %j', value => {
    expect(isListingAuthorityContractVersion(value)).toBe(false);
  });
});

describe('T1 covered_contract_variants at the type/helper boundary', () => {
  it.each([v1, v3, coveredV1, coveredV3])('discriminates $confirmation_version', approval => {
    const covered = 'authority_binding_hash' in approval;
    expect(isCoveredApproval(approval)).toBe(covered);
    expect(isCoveredConfirmationVersion(approval.confirmation_version)).toBe(covered);
    expect(isUncoveredConfirmationVersion(approval.confirmation_version)).toBe(!covered);
  });
  it.each([null, undefined, {}, true, 1, 'seller-listing-confirmation-v2',
    'seller-listing-confirmation-v4', 'seller-listing-confirmation-v2-authority-v1',
    'seller-listing-confirmation-v1-authority-v2', 'seller-listing-confirmation-v3-authority-v1 ',
  ])('never treats unknown confirmation %j as uncovered fallback', version => {
    expect(isCoveredConfirmationVersion(version)).toBe(false);
    expect(isUncoveredConfirmationVersion(version)).toBe(false);
  });
  it('narrows covered requests while preserving existing v1/v3 literals', () => {
    const approvals: ListingApproval[] = [v1, v3, coveredV1, coveredV3];
    for (const approval of approvals) {
      expectTypeOf(approval.ownership_confirmed).toEqualTypeOf<true>();
      expectTypeOf(approval.privacy_confirmed).toEqualTypeOf<true>();
      expectTypeOf(approval.public_disclosure_confirmed).toEqualTypeOf<true>();
      if (isCoveredApproval(approval)) {
        expectTypeOf(approval.organisation_authority_confirmed).toEqualTypeOf<true>();
        expect(approval.organisation_authority_confirmed).toBe(true);
      } else {
        expectTypeOf(approval).toEqualTypeOf<ListingApprovalV1 | ListingApprovalV3>();
      }
    }
    expectTypeOf<CoveredApprovalV1['price_license_confirmed']>().toEqualTypeOf<true>();
    expectTypeOf<CoveredApprovalV3['price_confirmed']>().toEqualTypeOf<true>();
    expectTypeOf<CoveredApprovalV3['license_confirmed']>().toEqualTypeOf<true>();
    expectTypeOf<CoveredApprovalV3['covenant_authority_confirmed']>().toEqualTypeOf<true>();
  });
  it('preserves strict sample requirements in the licensed covered branch', () => {
    const sample: CoveredApprovalV3 = { ...coveredV3, sample_decision: 'member_files', sample_files_confirmed: true };
    if (sample.sample_decision === 'member_files') {
      expectTypeOf(sample.sample_files_confirmed).toEqualTypeOf<true>();
      expect(sample.sample_files_confirmed).toBe(true);
    }
    // @ts-expect-error member_files requires the existing literal-true tick
    const missing: CoveredApprovalV3 = { ...coveredV3, sample_decision: 'member_files', sample_files_confirmed: undefined };
    // @ts-expect-error licence-off contract cannot accept samples
    const unlicensed: CoveredApprovalV1 = { ...coveredV1, sample_decision: 'member_files' };
    expect(missing.sample_files_confirmed).toBeUndefined();
    expect(unlicensed.sample_decision).toBe('member_files');
  });
  it('rejects false, missing, null and coerced authority ticks at compile time', () => {
    expectTypeOf<CoveredApprovalV1['organisation_authority_confirmed']>().toEqualTypeOf<true>();
    expectTypeOf<{ organisation_authority_confirmed: false }>().not.toExtend<Pick<CoveredApprovalV1, 'organisation_authority_confirmed'>>();
    expectTypeOf<{}>().not.toExtend<Pick<CoveredApprovalV1, 'organisation_authority_confirmed'>>();
    expectTypeOf<{ organisation_authority_confirmed: null }>().not.toExtend<Pick<CoveredApprovalV1, 'organisation_authority_confirmed'>>();
    expectTypeOf<{ organisation_authority_confirmed: 'true' }>().not.toExtend<Pick<CoveredApprovalV1, 'organisation_authority_confirmed'>>();
    expectTypeOf<ListingApprovalV1>().not.toExtend<CoveredApprovalV1>();
    expectTypeOf<ListingApprovalV3>().not.toExtend<CoveredApprovalV3>();
  });
  it('requires the authority binding hash and statement variant on both covered approvals', () => {
    expectTypeOf<{}>().not.toExtend<Pick<CoveredApprovalV1, 'authority_binding_hash'>>();
    expectTypeOf<{}>().not.toExtend<Pick<CoveredApprovalV1, 'authority_statement_variant'>>();
    expectTypeOf<{}>().not.toExtend<Pick<CoveredApprovalV3, 'authority_binding_hash'>>();
    expectTypeOf<{}>().not.toExtend<Pick<CoveredApprovalV3, 'authority_statement_variant'>>();
  });
  it('allows both no-org variants and only authorised for a bound organisation', () => {
    for (const variant of ['own_data', 'organisation_authorised'] as const) {
      const context: AuthorityStatementContext = { organisation_id: null, organisation: NO_ORGANISATION, authority_statement_variant: variant };
      expect(context.organisation).toBe('none (not on ai.market)');
      expectTypeOf(context).toEqualTypeOf<NoOrganisationAuthority>();
    }
    const bound: AuthorityStatementContext = { organisation_id: common.request_id, authority_statement_variant: 'organisation_authorised' };
    expect(bound.organisation_id).toBe(common.request_id);
    // @ts-expect-error a bound organisation cannot select own_data
    const wrong: AuthorityStatementContext = { organisation_id: common.request_id, authority_statement_variant: 'own_data' };
    expect(wrong.authority_statement_variant).toBe('own_data');
    expectTypeOf<'organisation_name'>().not.toExtend<keyof NoOrganisationAuthority>();
    expectTypeOf<AuthorityBinding['organisation_id']>().toEqualTypeOf<string | null>();
  });
  it('keeps references optional/nullable and errors discriminated by status', () => {
    const absent: ListingAuthorityReferences = {};
    const empty: ListingAuthorityReferences = { authority_import_id: null, authority_version_id: null };
    expect(absent.authority_import_id).toBeUndefined();
    expect(empty.authority_version_id).toBeNull();
    expectTypeOf<Extract<ListingAuthorityError, { status: 409 }>['code']>().toEqualTypeOf<
      'AUTHORITY_CONFIRMATION_REQUIRED' | 'AUTHORITY_LISTING_STOPPED' | 'AUTHORITY_REVIEW_STALE'
    >();
    expectTypeOf<Extract<ListingAuthorityError, { status: 503 }>['kind']>().toEqualTypeOf<'enforcement_unavailable'>();
  });
});
