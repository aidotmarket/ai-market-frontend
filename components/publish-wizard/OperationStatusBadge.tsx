'use client';

import type { PublishStatus } from '@/lib/api/publish-wizard';

const STATUS_STYLES: Record<PublishStatus, string> = {
  draft: 'bg-stone-200 text-stone-700',
  extracting: 'bg-amber-100 text-amber-700',
  reviewing: 'bg-sky-100 text-sky-700',
  enriching: 'bg-teal-100 text-teal-700',
  publishing: 'bg-orange-100 text-orange-700',
  published: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
};

export function OperationStatusBadge({ status }: { status: PublishStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}
