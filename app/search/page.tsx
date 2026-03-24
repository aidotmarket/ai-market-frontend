import type { Metadata } from 'next';
import { MarketplaceSearchExperience } from '@/components/search/MarketplaceSearchExperience';

export const metadata: Metadata = {
  title: 'Search Datasets',
  description: 'Semantic search across the ai.market dataset catalog with faceted filters.',
};

export const dynamic = 'force-dynamic';

export default function SearchPage() {
  return <MarketplaceSearchExperience mode="search" />;
}
