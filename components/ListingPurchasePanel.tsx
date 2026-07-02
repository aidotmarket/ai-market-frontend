'use client';

import { useMemo, useState } from 'react';
import BuyButton from '@/components/BuyButton';
import { formatDate } from '@/lib/format';
import type { ListingVersion } from '@/types';

interface ListingPurchasePanelProps {
  listingId: string;
  sellerId: string;
  slug: string;
  price: number;
  pricingType: string;
  versions: ListingVersion[];
  accessWindowDays: number | null;
  initialVersionId?: string | null;
}

export default function ListingPurchasePanel({
  listingId,
  sellerId,
  slug,
  price,
  pricingType,
  versions,
  accessWindowDays,
  initialVersionId,
}: ListingPurchasePanelProps) {
  const visibleVersions = useMemo(() => sortVersions(versions), [versions]);
  const defaultVersion = useMemo(
    () => selectDefaultVersion(visibleVersions, initialVersionId),
    [initialVersionId, visibleVersions],
  );
  const [selectedVersionId, setSelectedVersionId] = useState(defaultVersion?.version_id ?? '');
  const selectedVersion = visibleVersions.find((version) => version.version_id === selectedVersionId) ?? defaultVersion;
  const disabledReason = selectedVersion?.status === 'superseded'
    ? 'This version has been superseded and is shown for provenance only.'
    : undefined;

  return (
    <div>
      {visibleVersions.length > 0 && (
        <VersionSelector
          versions={visibleVersions}
          selectedVersionId={selectedVersion?.version_id ?? ''}
          onSelectVersion={setSelectedVersionId}
        />
      )}
      {accessWindowDays != null && (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Download window: {accessWindowDays} day{accessWindowDays === 1 ? '' : 's'} after purchase.
        </p>
      )}
      <div className="mt-4">
        <BuyButton
          listingId={listingId}
          sellerId={sellerId}
          slug={slug}
          price={price}
          pricingType={pricingType}
          versionId={selectedVersion?.status === 'active' ? selectedVersion.version_id : undefined}
          disabledReason={disabledReason}
        />
      </div>
    </div>
  );
}

export function VersionSelector({
  versions,
  selectedVersionId,
  onSelectVersion,
}: {
  versions: ListingVersion[];
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
}) {
  const visibleVersions = sortVersions(versions);

  if (visibleVersions.length === 0) return null;

  return (
    <div className="space-y-3">
      <label htmlFor="listing-version" className="block text-sm font-medium text-gray-900">
        Version
      </label>
      <select
        id="listing-version"
        value={selectedVersionId}
        onChange={(event) => onSelectVersion(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#3F51B5] focus:outline-none"
      >
        {visibleVersions.map((version) => (
          <option key={version.version_id} value={version.version_id}>
            {version.version_label}{version.status === 'superseded' ? ' (superseded)' : ''}
          </option>
        ))}
      </select>
      <div className="space-y-2">
        {visibleVersions.map((version) => {
          const selected = version.version_id === selectedVersionId;
          return (
            <div
              key={version.version_id}
              data-testid={`version-${version.version_label}`}
              className={`rounded-lg border px-3 py-2 text-xs ${
                selected ? 'border-[#3F51B5] bg-[#E8EAF6]' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-gray-900">
                  {version.version_label}
                </span>
                <span className={version.status === 'active' ? 'text-green-700' : 'text-gray-500'}>
                  {version.status}
                </span>
              </div>
              <p className="mt-1 text-gray-600">
                Published {formatDate(version.published_at)} · {formatBytes(version.total_size_bytes)} · {version.object_count.toLocaleString()} objects
              </p>
              {version.status === 'superseded' && (
                <p className="mt-1 text-gray-500">Visible for provenance. Not purchasable.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function selectDefaultVersion(versions: ListingVersion[], initialVersionId?: string | null) {
  const requested = versions.find((version) => version.version_id === initialVersionId);
  if (requested) return requested;
  return versions.find((version) => version.status === 'active') ?? versions[0] ?? null;
}

export function sortVersions(versions: ListingVersion[]) {
  return versions
    .filter((version) => version.status !== 'quarantined')
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      const timeDelta = new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      if (timeDelta !== 0) return timeDelta;
      return b.version_id.localeCompare(a.version_id);
    });
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
