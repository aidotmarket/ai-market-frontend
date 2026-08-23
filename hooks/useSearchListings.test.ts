import { describe, expect, it } from 'vitest';
import { filterDiscoverableItems, type ResultItem } from './useSearchListings';

describe('filterDiscoverableItems', () => {
  it('pins unlisted listings as hidden from browse/search surfaces', () => {
    const items: ResultItem[] = [
      {
        id: 'published-1',
        slug: 'published-dataset',
        title: 'Published Dataset',
        description: null,
        short_description: null,
        price: 1,
        category: 'Business',
        tags: [],
        privacy_score: null,
        compliance_status: null,
        data_format: null,
        source_row_count: null,
        verification_status: 'verified',
        view_count: 0,
        created_at: '2026-07-01T00:00:00Z',
        status: 'published',
      },
      {
        id: 'unlisted-1',
        slug: 'unlisted-dataset',
        title: 'Unlisted Dataset',
        description: null,
        short_description: null,
        price: 1,
        category: 'Business',
        tags: [],
        privacy_score: null,
        compliance_status: null,
        data_format: null,
        source_row_count: null,
        verification_status: 'verified',
        view_count: 0,
        created_at: '2026-07-01T00:00:00Z',
        status: 'unlisted',
      },
    ];

    expect(filterDiscoverableItems(items).map((item) => ({
      slug: item.slug,
      status: 'status' in item ? item.status : undefined,
    }))).toMatchSnapshot();
  });
});
