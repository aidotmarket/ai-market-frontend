import type { Metadata } from 'next';
import { MarketplaceSearchExperience } from '@/components/search/MarketplaceSearchExperience';

export const metadata: Metadata = {
  title: 'Browse Datasets',
  description: 'Explore datasets on ai.market with text search, filters, and incremental discovery.',
};

export const dynamic = 'force-dynamic';

export default function BrowseListingsPage() {
  return <MarketplaceSearchExperience mode="browse" />;
}
