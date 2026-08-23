import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '@/types';
import { MarketplaceListingCard } from './MarketplaceListingCard';

describe('MarketplaceListingCard', () => {
  it('does not render a truth-status badge', () => {
    const listing: SearchResultItem = {
      id: 'listing-1',
      slug: 'legacy-dataset',
      title: 'Legacy dataset',
      description: 'A legacy search result.',
      short_description: 'A legacy search result.',
      category: 'Business',
      price: 12,
      privacy_score: 8,
      compliance_status: null,
      data_format: 'csv',
      source_row_count: 10,
      tags: [],
    };

    const html = renderToStaticMarkup(<MarketplaceListingCard listing={listing} />);

    expect(html).toContain('Legacy dataset');
    expect(html).not.toMatch(/\bverified\b/i);
  });
});
