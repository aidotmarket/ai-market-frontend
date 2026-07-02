import { describe, expect, it } from 'vitest';
import { filterDiscoverableItems, type ResultItem } from './useSearchListings';

describe('filterDiscoverableItems', () => {
  it('pins unlisted listings as hidden from browse/search surfaces', () => {
    const items: ResultItem[] = [
      {
        id: 'published-1',
        slug: 'published-dataset',
        title: 'Published Dataset',
        short_description: null,
        price: 1,
        pricing_type: 'one_time',
        category: 'Business',
        tags: [],
        privacy_score: null,
        model_provider: 'openai',
        trust_level: 'L1',
        quality_score: null,
        verification_status: 'verified',
        view_count: 0,
        created_at: '2026-07-01T00:00:00Z',
        status: 'published',
      },
      {
        id: 'unlisted-1',
        slug: 'unlisted-dataset',
        title: 'Unlisted Dataset',
        short_description: null,
        price: 1,
        pricing_type: 'one_time',
        category: 'Business',
        tags: [],
        privacy_score: null,
        model_provider: 'openai',
        trust_level: 'L1',
        quality_score: null,
        verification_status: 'verified',
        view_count: 0,
        created_at: '2026-07-01T00:00:00Z',
        status: 'unlisted',
      },
    ];

    expect(filterDiscoverableItems(items).map((item) => ({
      slug: item.slug,
      status: item.status,
    }))).toMatchSnapshot();
  });
});
