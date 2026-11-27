import Link from 'next/link';

const statuses: Record<string, { label: string; style: string }> = {
  draft: { label: 'Draft', style: 'bg-gray-100 text-gray-800' },
  enhanced: { label: 'Enhanced', style: 'bg-purple-100 text-purple-800' },
  published: { label: 'Live', style: 'bg-green-100 text-green-800' },
  unlisted: { label: 'Not public', style: 'bg-gray-100 text-gray-800' },
  hidden: { label: 'Not public', style: 'bg-gray-100 text-gray-800' },
  withdrawn: { label: 'Withdrawn', style: 'bg-gray-100 text-gray-800' },
  held: { label: 'Held', style: 'bg-amber-100 text-amber-900' },
  pending_review: { label: 'Pending review', style: 'bg-yellow-100 text-yellow-800' },
  suspended: { label: 'Suspended', style: 'bg-red-100 text-red-800' },
  archived: { label: 'Archived', style: 'bg-gray-100 text-gray-600' },
};

export const heldStatus = { label: 'Live — not buyable yet', style: 'bg-amber-100 text-amber-900' };
export const sellerTermsHref = '/legal/terms/accept?context=seller&redirect=%2Fdashboard%2Flistings';

export function listingStatus(status: string | undefined) {
  if (status && Object.hasOwn(statuses, status)) return statuses[status];
  return { label: status || 'Status unavailable', style: 'bg-gray-100 text-gray-800' };
}

export type PayoutsStatus = 'unknown' | 'enabled' | 'disabled';

export function readPayoutsStatus(enabled: unknown): PayoutsStatus {
  return enabled === true ? 'enabled' : enabled === false ? 'disabled' : 'unknown';
}

export function isPublicReference(metadata: unknown): boolean {
  return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
    && Object.prototype.hasOwnProperty.call(metadata, 'public_reference');
}

export function listingReadiness(
  listing: { status: string; structured_metadata?: unknown },
  pendingTerms: boolean | undefined,
  payoutsStatus: PayoutsStatus,
) {
  if (listing.status !== 'published') return null;
  if (isPublicReference(listing.structured_metadata)) {
    return { reason: 'Public source reference — no checkout.' };
  }
  if (pendingTerms === true) return { reason: 'Seller Terms need to be accepted.', href: sellerTermsHref, fix: 'Fix seller Terms' };
  if (pendingTerms === false && payoutsStatus === 'disabled') return { reason: 'Payout setup is incomplete.', href: '/dashboard', fix: 'Fix payout setup' };
  return null;
}

export function ListingReadinessNote({ readiness, className }: {
  readiness: NonNullable<ReturnType<typeof listingReadiness>>;
  className: string;
}) {
  return <p className={className}>
    {readiness.reason}{readiness.href && <> <Link href={readiness.href} className="font-semibold text-indigo-700 underline">{readiness.fix}</Link></>}
  </p>;
}
