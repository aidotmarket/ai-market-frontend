import { formatBytes } from '@/lib/formatBytes';
import type { FileBreakdownGroup } from '@/types';

export default function FileBreakdown({ groups, totalFileCount, heading: Heading = 'h2', showUnavailable = false }: {
  groups?: FileBreakdownGroup[] | null;
  totalFileCount?: number;
  heading?: 'h2' | 'h3';
  showUnavailable?: boolean;
}) {
  if (!groups?.length) return showUnavailable
    ? <p className="text-gray-600">The seller hasn&apos;t published a file list for this version.</p>
    : null;
  const listedCount = groups.reduce((total, group) => total + group.count, 0);
  return <section aria-label="File breakdown" className="text-sm text-gray-600">
    <Heading className="font-semibold">Files included</Heading>
    {totalFileCount != null && listedCount < totalFileCount && (
      <p>This list covers {listedCount.toLocaleString('en-US')} of {totalFileCount.toLocaleString('en-US')} download files.</p>
    )}
    <ul>{groups.map(group => <li key={group.format}>
      {group.format === 'other' ? 'Other files' : `${group.format.toUpperCase()} tables`}: {group.count.toLocaleString('en')} {group.count === 1 ? 'file' : 'files'} · {formatBytes(group.size_bytes)}
    </li>)}</ul>
  </section>;
}
