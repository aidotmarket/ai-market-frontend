// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResultItem } from '@/types';
const state = vi.hoisted(() => ({mode: 'browse', items: [] as SearchResultItem[]}));
vi.mock('next/navigation', () => ({usePathname: () => state.mode === 'browse' ? '/listings' : '/search', useRouter: () => ({replace: vi.fn(), push: vi.fn()}), useSearchParams: () => new URLSearchParams(state.mode === 'browse' ? '' : 'q=example')}));
vi.mock('@/hooks/useSearchListings', () => ({useSearchListings: () => ({items: state.items, total: state.items.length, semanticMode: state.mode === 'search', facets: null, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn()})}));
vi.mock('@/hooks/useMarketplaceCategoryFacets', () => ({useMarketplaceCategoryFacets: () => ({data: {}, isError: false})}));
vi.mock('@/components/search/SearchForm', () => ({SearchForm: () => <div>Search</div>}));
import { MarketplaceSearchExperience } from './MarketplaceSearchExperience';
afterEach(cleanup);
it.each(['browse', 'search'])('renders actual %s cards without public retained sample claims', mode => {
  state.mode = mode;
  const base: SearchResultItem = {id: 'sample', slug: 'sample', title: 'Sample identity', description: 'RETAINED_UNSUPPORTED', short_description: 'RETAINED_UNSUPPORTED', category: 'Business', price: 2500, privacy_score: 9, compliance_status: 'HIPAA', data_format: 'csv', source_row_count: 8400, tags: ['RETAINED_UNSUPPORTED'], generated_sample: {label: 'SAMPLE', display_only: true}, purchasable: false, purchase_hold_reason: 'generated_sample_display_only'};
  const peer = {...base, id: 'ordinary', slug: 'ordinary', title: 'Ordinary peer', short_description: 'Ordinary description', price: 12, purchase_hold_reason: null};
  delete peer.generated_sample;
  state.items = [base, peer];
  render(<MarketplaceSearchExperience mode={mode as 'browse' | 'search'} />);
  const sample = screen.getByRole('heading', {name: 'SAMPLE — Sample identity'}).closest('a')!;
  expect(within(sample).getByText('Not for sale')).toBeTruthy();
  expect(sample.textContent).not.toMatch(/RETAINED_UNSUPPORTED|2500|8400|Privacy:/);
  const ordinary = screen.getByRole('heading', {name: 'Ordinary peer'}).closest('a')!;
  expect(ordinary.textContent).toContain('$12');
  expect(ordinary.textContent).toContain('Ordinary description');
});
