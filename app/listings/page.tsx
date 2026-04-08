import type { Metadata } from 'next';
import { MarketplaceSearchExperience } from '@/components/search/MarketplaceSearchExperience';

type BrowseListingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: BrowseListingsPageProps): Promise<Metadata> {
  const params = searchParams ? await searchParams : undefined;
  const rawAssetType = Array.isArray(params?.asset_type) ? params?.asset_type[0] : params?.asset_type;
  const isModelPage = rawAssetType === 'model';

  return {
    title: isModelPage ? 'Browse Marketplace Models' : 'Browse Marketplace Data',
    description: isModelPage
      ? 'Explore model listings on ai.market with text search, filters, and incremental discovery.'
      : 'Explore data listings on ai.market with text search, filters, and incremental discovery.',
  };
}

export const dynamic = 'force-dynamic';

export default function BrowseListingsPage() {
  return <MarketplaceSearchExperience mode="browse" />;
}
