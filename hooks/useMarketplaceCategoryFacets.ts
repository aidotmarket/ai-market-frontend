'use client';

import { useQuery } from '@tanstack/react-query';
import { getMarketplaceCategoryFacets } from '@/api/listings';

export function useMarketplaceCategoryFacets() {
  return useQuery({
    queryKey: ['marketplace-category-facets'],
    queryFn: getMarketplaceCategoryFacets,
  });
}
