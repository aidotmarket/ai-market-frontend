import { formatBytes } from '@/lib/formatBytes';
import type { FileBreakdownGroup } from '@/types';

export default function FileBreakdown({ groups }: { groups?: FileBreakdownGroup[] | null }) {
  if (!groups?.length) return null;
  return <section aria-label="File breakdown" className="text-sm text-gray-600">
    <h2 className="font-semibold">Files included</h2>
    <ul>{groups.map(group => <li key={group.format}>
      {group.format === 'other' ? 'Other files' : `${group.format.toUpperCase()} tables`}: {group.count.toLocaleString('en')} {group.count === 1 ? 'file' : 'files'} · {formatBytes(group.size_bytes)}
    </li>)}</ul>
  </section>;
}
