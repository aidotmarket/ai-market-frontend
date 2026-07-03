import Link from 'next/link';
import { formatDate } from '@/lib/format';
import type { BuyerOrder } from '@/types';

interface OrderVersionAccessSummaryProps {
  order: Pick<BuyerOrder, 'listing_id' | 'access_expires_at' | 'access_expired' | 'purchased_version' | 'newer_version_available'>;
  compact?: boolean;
}

export default function OrderVersionAccessSummary({ order, compact = false }: OrderVersionAccessSummaryProps) {
  const version = order.purchased_version ?? null;
  const versionLabel = version?.version_label ?? version?.label ?? null;
  const versionStatus = version?.status ?? null;
  const isSuperseded = versionStatus === 'superseded';
  const listingHref = `/listings/${order.listing_id}`;

  if (!version && !order.access_expires_at && !order.newer_version_available) return null;

  return (
    <div className={compact ? 'space-y-1 text-xs' : 'rounded-lg border border-gray-200 p-4 text-sm'}>
      {versionLabel && (
        <p className={compact ? 'text-gray-600' : 'text-gray-700'}>
          Purchased version: <span className="font-medium text-gray-900">{versionLabel}</span>
          {isSuperseded && <span className="text-amber-700"> (superseded)</span>}
        </p>
      )}
      {order.newer_version_available && (
        <Link href={listingHref} className="inline-block font-medium text-[#3F51B5] hover:underline">
          Newer version available
        </Link>
      )}
      {order.access_expires_at && (
        <p className={order.access_expired ? 'font-medium text-red-700' : 'text-gray-600'}>
          {order.access_expired
            ? `Download window ended ${formatDate(order.access_expires_at)}.`
            : `Download window ends ${formatDate(order.access_expires_at)} (${formatTimeRemaining(order.access_expires_at)} remaining).`}
        </p>
      )}
    </div>
  );
}

export function formatTimeRemaining(expiresAt: string, now = Date.now()) {
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return 'unknown time';
  const ms = expiresMs - now;
  if (ms <= 0) return 'expired';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
