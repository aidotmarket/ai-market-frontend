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
        name: 'Natural language processing',
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
  ['financial-data', 'Financial data'],
  ['alternative-data', 'Alternative data'],
  ['consumer-retail', 'Consumer & retail'],
  ['healthcare-life-sciences', 'Healthcare & life sciences'],
  ['geospatial-location', 'Geospatial & location'],
  ['environmental-climate', 'Environmental & climate'],
  ['technology-web', 'Technology & web'],
  ['government-public', 'Government & public'],
  ['energy-utilities', 'Energy & utilities'],
  ['transportation-logistics', 'Transportation & logistics'],
  ['real-estate-property', 'Real estate & property'],
  ['ai-machine-learning', 'AI & machine learning'],
  ['future-category', 'Future category'],
  ['finance', 'Finance'],
])('labels category %s', (slug, label) => {
  expect(formatMarketplaceCategoryName(slug)).toBe(label);
});

it('formats listing category codes and unknown categories for customers', () => {
  expect(formatMarketplaceCategoryName('ai-machine-learning')).toBe('AI & machine learning');
  expect(formatMarketplaceCategoryName('other')).toBe('Other');
  expect(formatMarketplaceCategoryName('climate-research')).toBe('Climate research');
});
