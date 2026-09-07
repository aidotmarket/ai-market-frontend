import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readListingReview } from './sellerListingReview';
const client = vi.hoisted(() => ({get:vi.fn()}));
vi.mock('./client', () => ({api:client}));
const html = '<!doctype html><html><body>Regional retail — $25.00</body></html>';
const review = {presentation_version:'seller-listing-review-v2', rendered_html:html, render_hash:createHash('sha256').update(html).digest('hex')};
beforeEach(() => {vi.resetAllMocks();vi.stubGlobal('crypto',webcrypto);});
afterEach(() => vi.unstubAllGlobals());
it('returns only the exact render whose digest was prepared by the backend', async () => {
  client.get.mockResolvedValue({data:review});
  const signal = new AbortController().signal;
  expect(await readListingReview(signal)).toBe(review);
  expect(client.get).toHaveBeenCalledWith('/seller-workspace/listing-review',{signal});
});
it.each([
  {...review,rendered_html:html.replace('25.00','99.00')},
  {...review,presentation_version:'unknown-version'},
  {...review,render_hash:''},
  {...review,rendered_html:'x'.repeat(100001)},
])('rejects changed, unsupported or unbounded rendered reviews', async value => {
  client.get.mockResolvedValue({data:value});
  await expect(readListingReview(new AbortController().signal)).rejects.toThrow('Saved review could not be verified');
});
it('does not return a render after navigation cancels the request', async () => {
  client.get.mockResolvedValue({data:review});
  const controller = new AbortController();controller.abort();
  await expect(readListingReview(controller.signal)).rejects.toThrow('Saved review could not be verified');
});
