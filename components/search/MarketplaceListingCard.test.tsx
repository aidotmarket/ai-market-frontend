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

const sampleCard = {
  id: 'generated', slug: 'generated-example', title: 'Clinical Trial Outcomes — Anonymized (2024)',
  description: 'RETAINED_UNSUPPORTED HIPAA GDPR service', short_description: 'RETAINED_UNSUPPORTED translated claims',
  price: 2500, category: 'RETAINED_UNSUPPORTED category', tags: ['RETAINED_UNSUPPORTED tag'],
  privacy_score: 9.8, compliance_status: 'RETAINED_UNSUPPORTED', data_format: 'RETAINED_UNSUPPORTED', source_row_count: 8400,
  generated_sample: {label: 'SAMPLE', display_only: true} as const,
  purchasable: false, purchase_hold_reason: 'generated_sample_display_only',
};
describe('public sample browse and search cards', () => {
  it.each(['file_download', 'model_access', 'pipeline_invocation'])('suppresses all retained card claims for %s', fulfillment_type => {
    const html = renderToStaticMarkup(<MarketplaceListingCard listing={{...sampleCard, fulfillment_type} as SearchResultItem} />);
    expect(html).toContain('SAMPLE — Clinical Trial Outcomes');
    expect(html).toContain('generated marketplace example');
    expect(html).toContain('Not for sale');
    expect(html).toContain('href="/listings/generated-example"');
    expect(html).not.toMatch(/RETAINED_UNSUPPORTED|2500|8400|Privacy:|\bFree\b|Offer|Download|Buy/);
  });
  it.each([null, false, {}, {version: 2, mode: 'display_only'}])('closes malformed marker %j instead of rendering an ordinary price', generated_sample => {
    const listing = {...sampleCard, generated_sample} as unknown as SearchResultItem;
    const html = renderToStaticMarkup(<MarketplaceListingCard listing={listing} />);
    expect(html).toContain('Unavailable —');
    expect(html).not.toMatch(/RETAINED_UNSUPPORTED|2500|Privacy:|\bFree\b/);
  });
  it('closes hold-only legacy records and preserves unmarked zero and paid peers', () => {
    const held = {...sampleCard}; delete (held as Partial<typeof held>).generated_sample;
    expect(renderToStaticMarkup(<MarketplaceListingCard listing={held} />)).toContain('Unavailable —');
    for (const price of [0, 12]) {
      const ordinary = {...held, price, purchase_hold_reason: null, short_description: 'Ordinary retained description', category: 'Business'};
      const html = renderToStaticMarkup(<MarketplaceListingCard listing={ordinary} />);
      expect(html).toContain('Ordinary retained description');
      expect(html).toContain(price ? '$12.00' : '$0.00');
      expect(html).not.toContain('Not for sale');
    }
  });
});
