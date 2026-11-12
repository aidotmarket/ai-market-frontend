import { beforeEach, expect, it, vi } from 'vitest';
import { fetchListingShare } from './share';
const get = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ api: { get } }));
beforeEach(() => get.mockReset().mockResolvedValue({ data: { promote: null } }));
it('sends ui_locale separately from caption locale', async () => {
  expect(await fetchListingShare('id/encoded', { uiLocale: 'zh-Hans', locale: 'de' })).toEqual({ promote: null });
  expect(get).toHaveBeenCalledWith('/listings/id%2Fencoded/share', { params: { ui_locale: 'zh-Hans', locale: 'de' } });
});
it('does not substitute caption locale for missing ui_locale', async () => {
  await fetchListingShare('listing', { uiLocale: 'es' });
  expect(get).toHaveBeenCalledWith('/listings/listing/share', { params: { ui_locale: 'es' } });
});
