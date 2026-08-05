export interface MarketplaceCategory {
  name: string;
  value: string;
  description: string;
  count: number | null;
}

type MarketplaceCategoryDefinition = Omit<MarketplaceCategory, 'count'>;

export const FALLBACK_MARKETPLACE_CATEGORIES: readonly MarketplaceCategoryDefinition[] = [
  {
    name: 'Healthcare',
    value: 'healthcare',
    description: 'Clinical, life sciences, population health, and care operations data.',
  },
  {
    name: 'Finance',
    value: 'finance',
    description: 'Markets, risk, payments, insurance, and business intelligence datasets.',
  },
  {
    name: 'Technology',
    value: 'technology',
    description: 'Software, infrastructure, AI systems, and digital product signals.',
  },
  {
    name: 'Retail',
    value: 'retail',
    description: 'Commerce, merchandising, pricing, inventory, and consumer behavior data.',
  },
  {
    name: 'Real Estate',
    value: 'real-estate',
    description: 'Property, location, mobility, construction, and market intelligence.',
  },
  {
    name: 'Marketing',
    value: 'marketing',
    description: 'Audience, advertising, brand, demand generation, and campaign signals.',
  },
  {
    name: 'Government',
    value: 'government',
    description: 'Public sector, civic, regulatory, procurement, and open-data assets.',
  },
  {
    name: 'Other',
    value: 'other',
    description: 'Specialized datasets that do not fit a single marketplace category.',
  },
];

function normalizeCategory(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export function formatMarketplaceCategoryName(value: string) {
  const fallbackMatch = FALLBACK_MARKETPLACE_CATEGORIES.find(
    (category) => normalizeCategory(category.value) === normalizeCategory(value),
  );
  if (fallbackMatch) return fallbackMatch.name;

  return value
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function categoryDescription(value: string, name: string) {
  const fallbackMatch = FALLBACK_MARKETPLACE_CATEGORIES.find(
    (category) => normalizeCategory(category.value) === normalizeCategory(value),
  );

  return fallbackMatch?.description ?? `${name} datasets currently available on the marketplace.`;
}

export function getMarketplaceCategories(
  facetCategories: Record<string, number> | null | undefined,
): MarketplaceCategory[] {
  if (!facetCategories || Object.keys(facetCategories).length === 0) {
    return FALLBACK_MARKETPLACE_CATEGORIES.map((category) => ({ ...category, count: null }));
  }

  return Object.entries(facetCategories)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([value, count]) => {
      const name = formatMarketplaceCategoryName(value);
      return {
        name,
        value,
        description: categoryDescription(value, name),
        count,
      };
    })
    .sort((a, b) => b.count! - a.count! || a.name.localeCompare(b.name));
}
