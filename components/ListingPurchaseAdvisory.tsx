import type {
  ComplianceStatus,
  TrustLevel,
  VerificationStatus,
} from '@/types';

interface ListingPurchaseAdvisoryProps {
  price: number;
  complianceStatus: ComplianceStatus;
  qualityScore: number | null;
  verificationStatus: VerificationStatus;
  trustLevel: TrustLevel;
}

export default function ListingPurchaseAdvisory({
  price,
  complianceStatus,
  qualityScore,
  verificationStatus,
  trustLevel,
}: ListingPurchaseAdvisoryProps) {
  const indicators = getWeakSignalIndicators({
    complianceStatus,
    qualityScore,
    verificationStatus,
    trustLevel,
  });

  if (price <= 0 || indicators.length === 0) return null;

  return (
    <aside
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
      aria-labelledby="purchase-advisory-heading"
    >
      <p id="purchase-advisory-heading" className="text-sm font-semibold text-amber-900">
        Review before buying
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
        {indicators.map((indicator) => <li key={indicator}>{indicator}</li>)}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        These signals are advisory, not a purchase block. Review the listing and ask the seller questions before you buy.
      </p>
    </aside>
  );
}

export function getWeakSignalIndicators({
  complianceStatus,
  qualityScore,
  verificationStatus,
  trustLevel,
}: Omit<ListingPurchaseAdvisoryProps, 'price'>): string[] {
  const indicators: string[] = [];

  if (complianceStatus === 'not_checked') {
    indicators.push('Compliance not checked');
  } else if (complianceStatus === 'medium_risk') {
    indicators.push('Compliance marked medium risk');
  } else if (complianceStatus === 'high_risk') {
    indicators.push('Compliance marked high risk');
  }

  if (qualityScore == null) {
    indicators.push('Quality not scored');
  } else if (qualityScore === 0) {
    indicators.push('Quality score: 0/100');
  }

  if (verificationStatus === 'unverified') {
    indicators.push('Verification status: Unverified');
  }

  if (trustLevel === 'L0') {
    indicators.push('Trust level: New');
  }

  return indicators;
}
