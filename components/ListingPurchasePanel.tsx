'use client';

import { formatBytes } from '@/lib/formatBytes';

import { useMemo, useState } from 'react';
import BuyButton from '@/components/BuyButton';
import { formatPublishedDate } from '@/lib/format';
import type { FileBreakdownGroup, ListingLicenseDetails, ListingVersion } from '@/types';
import FileBreakdown from '@/app/listings/[slug]/FileBreakdown';

interface ListingPurchasePanelProps {
  listingId: string;
  sellerId?: string;
  slug: string;
  price: number;
  pricingType: string;
  versions: ListingVersion[];
  accessWindowDays: number | null;
  license?: string | null;
  licenseDetails?: ListingLicenseDetails;
  dataFormat?: string | null;
  fulfillmentType?: string | null;
  fileBreakdown?: FileBreakdownGroup[] | null;
  initialVersionId?: string | null;
  disabledReason?: string;
}

export default function ListingPurchasePanel({
  listingId,
  sellerId,
  slug,
  price,
  pricingType,
  versions,
  accessWindowDays,
  license,
  licenseDetails,
  dataFormat,
  fulfillmentType,
  fileBreakdown,
  initialVersionId,
  disabledReason: listingDisabledReason,
}: ListingPurchasePanelProps) {
  const visibleVersions = useMemo(() => sortVersions(versions), [versions]);
  const defaultVersion = useMemo(
    () => selectDefaultVersion(visibleVersions, initialVersionId),
    [initialVersionId, visibleVersions],
  );
  const [selectedVersionId, setSelectedVersionId] = useState(defaultVersion?.version_id ?? '');
  const selectedVersion = visibleVersions.find((version) => version.version_id === selectedVersionId) ?? defaultVersion;
  // The public inventory belongs to the current active version.
  const currentVersionId = visibleVersions.find((version) => version.status === 'active')?.version_id;
  const selectedIsCurrent = selectedVersion?.version_id === currentVersionId;
  const selectedFiles = selectedVersion && describeVersionFiles(
    selectedVersion, selectedIsCurrent ? fileBreakdown : undefined, selectedIsCurrent ? dataFormat : undefined,
  );
  const disabledReason = selectedVersion?.status === 'superseded'
    ? 'This version has been superseded and is shown for provenance only.'
    : listingDisabledReason;

  return (
    <div>
      {visibleVersions.length > 0 && (
        <VersionSelector
          versions={visibleVersions}
          selectedVersionId={selectedVersion?.version_id ?? ''}
          onSelectVersion={setSelectedVersionId}
          fileBreakdown={fileBreakdown}
          dataFormat={dataFormat}
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
          versionLabel={selectedVersion?.status === 'active' ? selectedVersion.version_label : undefined}
          accessWindowDays={accessWindowDays}
          license={license}
          licenseDetails={licenseDetails}
          dataFormat={dataFormat}
          fulfillmentType={fulfillmentType}
          downloadDescription={selectedFiles?.delivery}
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
  fileBreakdown,
  dataFormat,
}: {
  versions: ListingVersion[];
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
  fileBreakdown?: FileBreakdownGroup[] | null;
  dataFormat?: string | null;
}) {
  const visibleVersions = sortVersions(versions);
  const currentVersionId = visibleVersions.find((version) => version.status === 'active')?.version_id;

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
          const isCurrent = version.version_id === currentVersionId;
          const groups = isCurrent ? fileBreakdown : undefined;
          const files = describeVersionFiles(version, groups, isCurrent ? dataFormat : undefined);
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
                Published {formatPublishedDate(version.published_at)}
              </p>
              <p className="mt-1 text-gray-700">{files.summary}</p>
              {selected && (
                <div className="mt-2">
                  <FileBreakdown groups={groups} totalFileCount={files.archive ? undefined : version.object_count} heading="h3" showUnavailable />
                </div>
              )}
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

function archiveFormat(dataFormat?: string | null) {
  const format = dataFormat?.trim().toLowerCase();
  if (!format) return undefined;
  if (/^(?:\.?zip|application\/(?:x-zip-compressed|zip))$/.test(format)) return 'ZIP';
  if (/^(?:\.?tar\.gz|\.?tgz)$/.test(format)) return 'TAR.GZ';
  if (/^(?:\.?tar|application\/x-tar)$/.test(format)) return 'TAR';
  if (/^(?:\.?7z|application\/x-7z-compressed)$/.test(format)) return '7Z';
  return undefined;
}

function describeVersionFiles(version: ListingVersion, groups?: FileBreakdownGroup[] | null, dataFormat?: string | null) {
  const count = version.object_count;
  const bytes = version.total_size_bytes;
  const size = bytes > 0 || (bytes === 0 && count > 0) ? formatBytes(bytes) : undefined;
  const archive = count === 1 ? archiveFormat(dataFormat) : undefined;
  if (archive) {
    const details = size ? ` (${size})` : '';
    return { archive, delivery: `one ${archive} archive${details}`, summary: `One ${archive} archive${details}` };
  }

  const formats = groups?.filter(group => group.format !== 'other')
    .map(group => group.format === 'parquet' ? 'Parquet' : group.format.toUpperCase());
  const details = [[...new Set(formats)].join(', '), size].filter(Boolean).join(' · ');
  const sizeAndFormats = details ? ` (${details})` : '';
  const delivery = count > 0
    ? `${count.toLocaleString('en-US')} ${count === 1 ? 'file' : 'files'}${sizeAndFormats}`
    : details || undefined;
  return { archive, delivery, summary: delivery ?? 'Download details are unavailable for this version.' };
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
