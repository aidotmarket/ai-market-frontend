import {afterEach, expect, it, vi} from 'vitest';
import {fetchPreviewConsistency, fetchPreviewKeys, fetchPreviewManifest} from '@/lib/api';
import {makePreview} from '@/tests/previewFixture';
import {renderToString} from 'react-dom/server';
import {createElement} from 'react';
import ListingSamplePreview from '@/components/listings/ListingSamplePreview';
import {fetchPackage} from './transport';

afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store'}});
it('does not fetch during SSR and preserves empty output byte-for-byte', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(renderToString(createElement(ListingSamplePreview, {slug: 'sample', listingId: 'id'}))).toBe('');
  expect(fetch).not.toHaveBeenCalled();
});
it.each([404, 422, 503])('treats %i as no manifest/keys without exposing server detail', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => response({detail: 'PRIVATE_ERROR_MARKER'}, status)));
  expect(await fetchPreviewManifest('slug', new AbortController().signal)).toBeNull();
  expect(await fetchPreviewKeys(new AbortController().signal)).toBeNull();
});
it('admits metadata only and never sends rows or filters to our API', async () => {
  const f = await makePreview(), requests: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {requests.push([url, options]); return response(String(url).endsWith('/keys') ? {profile: 'aim-preview-platform-keys-v1', keys: Object.entries(f.keys).map(([key_id, public_key]) => ({key_id, public_key, algorithm: 'ed25519'}))} : f.manifest);}));
  const signal = new AbortController().signal;
  expect(await fetchPreviewManifest('canonical/slug', signal)).not.toBeNull(); expect(await fetchPreviewKeys(signal)).toEqual(f.keys);
  for (const [, options] of requests as [string, RequestInit][]) expect(options).toMatchObject({cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal});
  expect(JSON.stringify(requests)).not.toContain('barley'); expect(JSON.stringify(requests)).not.toContain('9007199254740993');
});
it.each(['image_gallery', 'map', 'timeseries_chart', 'audio', 'nested_json', 'future'])('does not dispatch unsupported %s', async type => {
  const f = await makePreview(); vi.stubGlobal('fetch', vi.fn(async () => response({...f.manifest, preview_type: type})));
  expect(await fetchPreviewManifest('slug', new AbortController().signal)).toBeNull();
});
it('rejects duplicate keys, rebound aliases and cacheable metadata', async () => {
  const f = await makePreview(); const k = Object.entries(f.keys)[0];
  vi.stubGlobal('fetch', vi.fn(async () => response({profile: 'aim-preview-platform-keys-v1', keys: [{key_id: k[0], public_key: k[1], algorithm: 'ed25519'}, {key_id: 'alias', public_key: k[1], algorithm: 'ed25519'}]})));
  expect(await fetchPreviewKeys(new AbortController().signal)).toBeNull();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(f.manifest), {headers: {'content-type': 'application/json', 'cache-control': 'public'}})));
  expect(await fetchPreviewManifest('slug', new AbortController().signal)).toBeNull();
});
it('checks independently requested consistency sizes and rejects SSR package retrieval', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({from_size: 1, to_size: 2, consistency_path: []})));
  expect(await fetchPreviewConsistency(1, 2, new AbortController().signal)).toEqual([]);
  expect(await fetchPreviewConsistency(2, 3, new AbortController().signal)).toBeNull();
  await expect(fetchPackage('https://seller.example/p', 1048576, new AbortController().signal)).rejects.toThrow('browser_only');
});
