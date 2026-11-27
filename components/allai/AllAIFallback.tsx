import Link from 'next/link';
import type { FallbackDestinations } from '@/lib/anonymous-allai-fallback';
import { anonymousAllAIResources, type AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';

export function AllAIFallback({ destinations, locale }: {
  destinations: FallbackDestinations;
  locale: AnonymousAllAILocale;
}) {
  const { listingRecovery, recoveryLinks, homepageFallbackGuidance } = anonymousAllAIResources(locale);
  const { support, search, request } = destinations;
  return (
    <>
      {support ? `${listingRecovery.error} ${listingRecovery.guidance}` : homepageFallbackGuidance}
      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {support && <Link href={support} className="underline">{listingRecovery.support}</Link>}
        {search && <Link href={search} className="underline">{recoveryLinks.searchListings}</Link>}
        {request && <Link href={request} className="underline">{recoveryLinks.postRequest}</Link>}
      </span>
    </>
  );
}

export function ListingRecoveryLinks({ search, support }: { search: string; support: string }) {
  return (
    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      <Link href="/search" className="underline">{search}</Link>
      <Link href="/support" className="underline">{support}</Link>
    </span>
  );
}
