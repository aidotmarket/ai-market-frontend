import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MARKETPLACE_CATEGORIES,
  getMarketplaceCategories,
} from './marketplaceCategories';

describe('getMarketplaceCategories', () => {
  it('keeps only categories with public inventory and preserves their counts', () => {
    const categories = getMarketplaceCategories({
      Finance: 0,
      healthcare: 2,
      'natural-language-processing': 1,
    });

    expect(categories.map(({ name, value, count }) => ({ name, value, count }))).toEqual([
      { name: 'Healthcare', value: 'healthcare', count: 2 },
      {
        name: 'Natural Language Processing',
        value: 'natural-language-processing',
        count: 1,
      },
    ]);
  });

  it('uses the one full static catalog when facet data is unavailable', () => {
    const categories = getMarketplaceCategories(null);

    expect(categories).toHaveLength(FALLBACK_MARKETPLACE_CATEGORIES.length);
    expect(categories.map(({ value }) => value)).toEqual(
      FALLBACK_MARKETPLACE_CATEGORIES.map(({ value }) => value),
    );
    expect(categories.every(({ count }) => count === null)).toBe(true);
  });

  it('does not render categories whose available facet count is zero', () => {
    expect(getMarketplaceCategories({ finance: 0, retail: 0 })).toEqual([]);
  });
});
