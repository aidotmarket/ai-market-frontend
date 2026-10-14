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
