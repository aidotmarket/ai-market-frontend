import {afterEach, expect, it, vi} from 'vitest';
import {api} from '@/api/client';
import {approveSummary, withdrawSummary, fetchSummaryPreview, regenerateSummary, fetchBuyerSummary} from './api';
import {preview, summary} from '@/tests/summaryFixture';
vi.mock('@/api/client', () => ({api: {get: vi.fn(), post: vi.fn()}}));
afterEach(() => {vi.resetAllMocks(); vi.unstubAllGlobals();});
it('uses all four owner routes, encodes IDs and sends exact bodies and abort signals', async () => {
  const signal = new AbortController().signal;
  vi.mocked(api.get).mockResolvedValue({data: preview});
  vi.mocked(api.post).mockResolvedValue({data: preview});
  expect(await fetchSummaryPreview('a/b', signal)).toBe(preview);
  expect(api.get).toHaveBeenCalledWith('/listings/a%2Fb/at-a-glance/preview', {signal, headers: {'Cache-Control': 'no-cache'}});
  await regenerateSummary('a/b', 'es', signal);
  expect(api.post).toHaveBeenLastCalledWith('/listings/a%2Fb/at-a-glance/regenerate', {locale: 'es'}, {signal});
  const request = {summary_id: preview.summary_id, source_revision: preview.source_revision, summary_hash: preview.summary_hash, render_hash: preview.render_hash, request_id: crypto.randomUUID(), sample_decision: 'none' as const};
  for (const [action, call] of [['approve', approveSummary], ['withdraw', withdrawSummary]] as const) {
    await call('a/b', request, signal);
    expect(api.post).toHaveBeenLastCalledWith(`/listings/a%2Fb/at-a-glance/${action}`, request, {signal});
  }
});
it('fetches public summaries without browser caching or credentials and omits absent summaries', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ok: true, json: async () => ({at_a_glance: summary})}).mockResolvedValueOnce({ok: true, json: async () => ({})}).mockResolvedValueOnce({ok: false});
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  expect(await fetchBuyerSummary('a/b', signal)).toEqual(summary);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/public/listings/a%2Fb'), {cache: 'no-store', credentials: 'omit', signal});
  expect(await fetchBuyerSummary('a/b', signal)).toBeNull();
  await expect(fetchBuyerSummary('a/b', signal)).rejects.toThrow('Summary could not be refreshed');
});
