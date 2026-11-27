import {CORRECTION_NOTICE_BUYER} from '@/lib/publicPresentation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ListingListItem, SearchResultItem } from '@/types';
import { browseResponse, conflictingShortDescription, listingSummaryCases, markdownDescription } from '@/tests/listingSummaryFixture';
import { MarketplaceListingCard } from './MarketplaceListingCard';

vi.mock('next/link', () => import('@/tests/listingLinkPrefetchMock'));

describe('MarketplaceListingCard', () => {
  const browseItem = browseResponse.items[0];
  const searchItem = {
    id: browseItem.id, slug: browseItem.slug, title: browseItem.title,
    description: markdownDescription, short_description: conflictingShortDescription,
    category: browseItem.category, price: browseItem.price, privacy_score: null,
    data_format: 'csv', source_row_count: 10, tags: [],
  };

  describe.each([
    { endpoint: 'public browse', item: browseItem },
    { endpoint: 'public browse with extra Markdown', item: { ...browseItem, description: markdownDescription } },
    { endpoint: 'web search', item: searchItem },
  ])('$endpoint', ({ item }) => {
    it.each(listingSummaryCases())('renders the expected excerpt for $state', async ({ summary }) => {
      const listing: ListingListItem | SearchResultItem = await Response.json({ ...item, summary }).json();
      const html = renderToStaticMarkup(<MarketplaceListingCard listing={listing} />);
      expect(html).toContain('data-prefetch="false"');
      const expected = summary === undefined ? conflictingShortDescription : summary;
      if (expected) expect(html).toContain(`>${expected}</p>`);
      else expect(html).not.toContain('line-clamp-3');
      if (summary !== undefined) expect(html).not.toContain(conflictingShortDescription);
      expect(html).not.toContain('**Approved coverage**');
    });
  });

  it('keeps the search description fallback for an old backend with empty short copy', async () => {
    const listing = await Response.json({ ...searchItem, short_description: '' }).json();
    expect(renderToStaticMarkup(<MarketplaceListingCard listing={listing} />)).toContain('**Approved coverage**');
  });

  it('does not render a truth-status badge', () => {
    const listing: SearchResultItem = {
      id: 'listing-1',
      slug: 'legacy-dataset',
      title: 'Legacy dataset',
      description: 'A legacy search result.',
      short_description: 'A legacy search result.',
      category: 'technology-web',
      price: 12,
      privacy_score: 8,
      compliance_status: null,
      data_format: 'csv',
      source_row_count: 10,
      tags: [],
    };

    const html = renderToStaticMarkup(<MarketplaceListingCard listing={listing} />);

    expect(html).toContain('Legacy dataset');
    expect(html).toContain('Technology &amp; web');
    expect(html).not.toContain('technology-web');
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
    expect(html).toContain('data-prefetch="false"');
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
    for (const [price, formatted] of [[0, '$0.00'], [12, '$12.00'], [5000, '$5,000.00']] as const) {
      const ordinary = {...held, price, purchase_hold_reason: null, short_description: 'Ordinary retained description', category: 'Business'};
      const html = renderToStaticMarkup(<MarketplaceListingCard listing={ordinary} />);
      expect(html).toContain('Ordinary retained description');
      expect(html).toContain(formatted);
      expect(html).not.toContain('Not for sale');
    }
  });
});

it('attributes actual backend current correction metadata and contains partial provenance locally',async()=>{
 const {default:wire}=await import('@/tests/fixtures/s1922-backend-wire.json');
 const c=wire.public[2].corrected;
 const listing={id:c.listing_id,slug:'synthetic',title:'Synthetic',short_description:'Original seller prose',price:1,category:'Business',tags:[],privacy_score:null,
 license_display:{license_label:c.license_label,provenance:c.provenance,correction_id:c.correction_id,correction_digest:c.correction_digest}};
 const html=renderToStaticMarkup(<MarketplaceListingCard listing={listing as never}/>);
 expect(html.split(CORRECTION_NOTICE_BUYER)).toHaveLength(2);
 expect(html).toContain('ai.market Standard Data Licence v1.1');
 expect(html).toContain('Original seller prose');
 const results=renderToStaticMarkup(<><MarketplaceListingCard listing={{...listing,license_display:{...listing.license_display,license_label:'UNVERIFIED',correction_digest:'bad'}} as never}/><MarketplaceListingCard listing={listing as never}/></>);
 expect(results).not.toContain('UNVERIFIED');
 expect(results.match(/href="\/listings\/synthetic"/g)).toHaveLength(2);
 expect(results.split(CORRECTION_NOTICE_BUYER)).toHaveLength(2);
 expect(html.split(CORRECTION_NOTICE_BUYER)).toHaveLength(2);
});
