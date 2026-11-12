import type { PublishedScanFindings, SellerScanFindings } from './index';

type TextFields = 'narrative' | 'listing_claim_comparison' | 'narrative_notice';
type PublicText = Pick<PublishedScanFindings, TextFields>;
type SellerText = Pick<SellerScanFindings, TextFields>;

const omitted: PublicText = {};
const explicitNulls: PublicText = { narrative: null, listing_claim_comparison: null, narrative_notice: null };
const grounded: PublicText = { narrative: 'Grounded text', listing_claim_comparison: 'Grounded comparison', narrative_notice: null };
const sellerOmitted: SellerText = {};
const sellerNulls: SellerText = explicitNulls;

// @ts-expect-error Optional text still rejects numbers.
const numericNarrative: PublicText = { narrative: 0 };
// @ts-expect-error Optional text still rejects objects.
const objectComparison: SellerText = { listing_claim_comparison: {} };
// @ts-expect-error Optional text still rejects booleans.
const booleanNotice: PublicText = { narrative_notice: false };
// @ts-expect-error Narrative state remains required.
const missingState: Pick<PublishedScanFindings, 'narrative_state'> = {};
// @ts-expect-error Deterministic facts remain required.
const missingFacts: Pick<PublishedScanFindings, 'deterministic_facts'> = {};
// @ts-expect-error Narrative states remain a closed contract.
const invalidState: PublishedScanFindings['narrative_state'] = 'recovered';
// @ts-expect-error Private seller findings are not the public projection.
const privateAsPublic: PublishedScanFindings = {} as SellerScanFindings;

void [omitted, explicitNulls, grounded, sellerOmitted, sellerNulls,
  numericNarrative, objectComparison, booleanNotice, missingState,
  missingFacts, invalidState, privateAsPublic];

// Version discrimination keeps legacy hashes required, including seller findings.
type V1Public = Extract<PublishedScanFindings, { artifact_version: 'data-verification-public-artifact-v1' }>;
type V2Public = Extract<PublishedScanFindings, { artifact_version: 'data-verification-public-artifact-v2' }>;
type V1Seller = Extract<SellerScanFindings, { artifact_version: 'data-verification-public-artifact-v1' }>;
type V2Seller = Extract<SellerScanFindings, { artifact_version: 'data-verification-public-artifact-v2' }>;

const v1Public = {} as V1Public;
const v1Seller = {} as V1Seller;
const v2Public: V2Public = {
  ...v1Public,
  artifact_version: 'data-verification-public-artifact-v2',
  spec: {} as Omit<V1Public['spec'], 'hash'>,
  execution: {} as Omit<V1Public['execution'], 'content_sha256_reference'>,
};
const v2Seller: V2Seller = { ...v2Public, publication_state: 'NOT_PUBLISHED', published_at_utc: null };

// @ts-expect-error v1 public artifacts require spec.hash.
const missingPublicHash: V1Public = { ...v1Public, spec: {} as Omit<V1Public['spec'], 'hash'> };
// @ts-expect-error v1 public artifacts require content_sha256_reference.
const missingPublicReference: V1Public = { ...v1Public, execution: {} as Omit<V1Public['execution'], 'content_sha256_reference'> };
// @ts-expect-error v1 seller artifacts require spec.hash.
const missingSellerHash: V1Seller = { ...v1Seller, spec: {} as Omit<V1Seller['spec'], 'hash'> };
// @ts-expect-error v1 seller artifacts require content_sha256_reference.
const missingSellerReference: V1Seller = { ...v1Seller, execution: {} as Omit<V1Seller['execution'], 'content_sha256_reference'> };

function legacyHashes(artifact: PublishedScanFindings | SellerScanFindings): string[] {
  if (artifact.artifact_version === 'data-verification-public-artifact-v1') {
    return [artifact.spec.hash, artifact.execution.content_sha256_reference];
  }
  return [];
}

void [v2Public, v2Seller, missingPublicHash, missingPublicReference,
  missingSellerHash, missingSellerReference, legacyHashes];
