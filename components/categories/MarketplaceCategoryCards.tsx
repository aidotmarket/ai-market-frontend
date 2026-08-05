'use client';

import Link from 'next/link';
import { useMarketplaceCategoryFacets } from '@/hooks/useMarketplaceCategoryFacets';
import { getMarketplaceCategories } from '@/lib/marketplaceCategories';

export function MarketplaceCategoryCards() {
  const { data: facetCategories, isPending, isError } = useMarketplaceCategoryFacets();

  if (isPending) {
    return (
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading categories">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-sm"
          />
        ))}
      </div>
    );
  }

  const categories = getMarketplaceCategories(isError ? null : facetCategories);

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((category) => (
        <Link
          key={category.value}
          href={{ pathname: '/listings', query: { category: category.value } }}
          className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#C5CAE9] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2"
        >
          <h3 className="text-base font-semibold text-gray-900 group-hover:text-[#3F51B5]">
            {category.name}
            {category.count !== null ? ` (${category.count})` : ''}
          </h3>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            {category.description}
          </p>
        </Link>
      ))}
    </div>
  );
}
