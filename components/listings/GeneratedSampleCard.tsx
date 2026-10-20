import Link from 'next/link';
import { samplePresentation } from '@/lib/generatedSample';
import type { GeneratedSampleFields } from '@/types';

export default function GeneratedSampleCard({ listing }: { listing: GeneratedSampleFields & {slug: string; title: string | null} }) {
  const safe = samplePresentation(listing);
  return <Link href={`/listings/${listing.slug}`} className="flex h-full flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6">
    <h3 className="text-base font-semibold text-gray-900">{safe.title}</h3>
    <p className="text-sm text-gray-600">{safe.description}</p>
    <p className="mt-auto font-semibold">{safe.state === 'sample' ? 'Not for sale' : 'Unavailable'}</p>
  </Link>;
}
