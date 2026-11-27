import type { Metadata } from 'next';
import { MarketplaceSearchExperience } from '@/components/search/MarketplaceSearchExperience';
import { redirectLegacyModelSearch, type MarketplaceSearchParams } from '@/lib/marketplaceSearchRedirect';

export const metadata: Metadata = {
  alternates: { canonical: '/listings' },
  title: 'Browse Marketplace',
  description: 'Browse data listings on ai.market by category, format, and price, or search by topic.',
};

export const dynamic = 'force-dynamic';

export default async function BrowseListingsPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  redirectLegacyModelSearch('/listings', await searchParams);

  return <MarketplaceSearchExperience mode="browse" />;
}
