// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeaturedFeedResponse, FeaturedItem } from '@/lib/api';
import type { ListingPublicListItem } from '@/types';
vi.mock('@/store/auth', () => ({useAuthStore: () => ({isAuthenticated: false})}));
vi.mock('@/lib/publicTermsVersion', () => ({getPublicTermsVersion: async () => '1.1'}));
vi.mock('@/components/HomepageActivityTickerBeacons', () => ({HomepageActivityTickerBeacons: () => null}));
vi.mock('@/components/HeroSearch', () => ({HeroSearch: () => <div>Search</div>}));
// Deliberately keep lib/api, the homepage, and its actual cards unmocked.
import LandingPage from './page';

function publicRow(id: string): ListingPublicListItem {
  return {id, slug: id, title: `Title ${id}`, short_description: `Description ${id}`, category: 'Business', tags: [], fulfillment_type: 'file_download', task_category: null, domain_tags: null, pricing: {price: 19, pricing_type: 'one_time', subscription_price_monthly: null}, price: 19, privacy_score: 8, privacy_scan_status: 'scanned', trust_level: 'L1', view_count: 3, published_at: null, purchasable: true, purchase_hold_reason: null};
}
function featured(row: ListingPublicListItem, slot: number): FeaturedItem {
  return {listing_id: row.id, seller_id: 'synthetic-seller', slug: row.slug, title: row.title, summary: row.short_description, canonical_url: `https://ai.market/listings/${row.slug}`, locale: 'en', source: 'curated', slot, price: {currency: 'USD', amount: row.price, label: `$${row.price}`, on_request: false}, placement_id: null};
}
function feed(rows: ListingPublicListItem[]): FeaturedFeedResponse {
  const items = rows.map(featured);
  return {items, item_list: {'@context': 'https://schema.org', '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((item, i) => ({'@type': 'ListItem', position: i + 1, item: {'@type': 'Dataset', name: item.title, url: item.canonical_url, offers: {'@type': 'Offer', price: item.price.amount}}}))}};
}
async function renderHome() {
  document.body.innerHTML = renderToStaticMarkup(await LandingPage());
  return within(document.body);
}
afterEach(() => {vi.unstubAllGlobals(); document.body.innerHTML = '';});

describe('actual homepage current reads and sample SSR', () => {
  it.each(['valid', 'null', 'unknown-version', 'contradictory'])('replaces pre-marker ordinary inputs on both real fetch paths (%s)', kind => transition(kind));
});
async function transition(kind: string) {
  const stale = {...publicRow('former-offer'), price: 2500, short_description: 'RETAINED_UNSUPPORTED canonical translated HIPAA service'};
  const peers = [publicRow('peer-one'), publicRow('peer-two'), publicRow('peer-three')];
  const staleGrid = {items: [stale, ...peers]};
  const staleFeed = feed([stale, ...peers]);
  const marker = kind === 'null' ? null : kind === 'unknown-version' ? {version: 2, mode: 'display_only'} : {label: 'SAMPLE', display_only: true};
  const marked = {...stale, generated_sample: marker, purchasable: kind === 'contradictory', purchase_hold_reason: 'generated_sample_display_only'};
  let changed = false;
  // This models stale pre-marker input semantics. It cannot prove Next's live
  // Data/Full Route caches, backend exclusion or deployed freshness.
  const fetchMock = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    if (url.includes('/public/featured-listings')) {
      return {ok: true, json: async () => changed && options?.cache === 'no-store' ? feed(peers) : staleFeed};
    }
    if (url.includes('/public/listings?')) {
      return {ok: true, json: async () => changed && options?.cache === 'no-store' ? {items: [marked, ...peers]} : staleGrid};
    }
    if (url.includes('/data-requests')) return {ok: true, json: async () => ({items: []})};
    throw new Error('Unexpected frontend fetch');
  });
  vi.stubGlobal('fetch', fetchMock);
  await renderHome();
  expect(document.body.textContent).toContain('RETAINED_UNSUPPORTED');
  expect(document.querySelector('script')!.textContent).toBeTruthy();
  changed = true;
  const page = await renderHome();
  const valid = kind === 'valid';
  const card = page.getByRole('heading', {name: `${valid ? 'SAMPLE' : 'Unavailable'} — Title former-offer`}).closest('a')!;
  expect(card.getAttribute('href')).toBe('/listings/former-offer');
  expect(card.textContent).toContain(valid ? 'Not for sale' : 'unavailable');
  expect(card.textContent).not.toMatch(/2500|RETAINED_UNSUPPORTED|Free|Privacy/);
  expect(document.body.textContent).not.toContain('RETAINED_UNSUPPORTED');
  const ticker = page.getByRole('heading', {name: 'Marketplace activity'}).closest('section')!;
  expect(ticker.textContent).not.toContain('Title former-offer');
  for (const peer of peers) {
    expect(ticker.textContent).toContain(peer.title);
    expect(page.getByRole('heading', {name: peer.title}).closest('a')!.textContent).toContain('$19');
  }
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => JSON.parse(s.textContent!));
  const itemList = scripts.find(s => s['@type'] === 'ItemList');
  expect(itemList.numberOfItems).toBe(3);
  expect(itemList.itemListElement.map((item: {position: number}) => item.position)).toEqual([1, 2, 3]);
  expect(JSON.stringify(itemList)).not.toMatch(/former-offer|2500|RETAINED_UNSUPPORTED/);
  expect(itemList.itemListElement[0].item.offers.price).toBe(19);
  const listingCalls = fetchMock.mock.calls.filter(([url]) => /\/public\/(listings\?|featured-listings)/.test(String(url)));
  expect(listingCalls).toHaveLength(4);
  for (const [, options] of listingCalls) expect(options).toEqual({cache: 'no-store'});
}

it('uses empty states on current fetch failure rather than an old price-bearing grid/feed', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ok: false}); vi.stubGlobal('fetch', fetchMock);
  const page = await renderHome();
  expect(page.getByText('No listings yet.', {exact: false})).toBeTruthy();
  expect(page.queryByRole('heading', {name: 'Marketplace activity'})).toBeNull();
  expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
});
