import type { Metadata } from 'next';
import { MarketplaceSearchExperience } from '@/components/search/MarketplaceSearchExperience';
import { redirectLegacyModelSearch, type MarketplaceSearchParams } from '@/lib/marketplaceSearchRedirect';

export const metadata: Metadata = {
  alternates: { canonical: '/search' },
  title: 'Search Datasets',
  description: 'Semantic search across the ai.market dataset catalog with faceted filters.',
};

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  redirectLegacyModelSearch('/search', await searchParams);

  return <MarketplaceSearchExperience mode="search" />;
}
