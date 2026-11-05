import { formatMarketplaceCategoryName } from './marketplaceCategories';
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

it.each([
  ['financial-data', 'Financial Data'],
  ['alternative-data', 'Alternative Data'],
  ['consumer-retail', 'Consumer & Retail'],
  ['healthcare-life-sciences', 'Healthcare & Life Sciences'],
  ['geospatial-location', 'Geospatial & Location'],
  ['environmental-climate', 'Environmental & Climate'],
  ['technology-web', 'Technology & Web'],
  ['government-public', 'Government & Public'],
  ['energy-utilities', 'Energy & Utilities'],
  ['transportation-logistics', 'Transportation & Logistics'],
  ['real-estate-property', 'Real Estate & Property'],
  ['ai-machine-learning', 'AI & Machine Learning'],
  ['future-category', 'Future Category'],
  ['finance', 'Finance'],
])('labels category %s', (slug, label) => {
  expect(formatMarketplaceCategoryName(slug)).toBe(label);
});
