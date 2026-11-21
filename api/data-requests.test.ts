import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/tests/fixtures/buyer-request-anonymization-chunk1.json';
import type { DataRequestUrgency } from '@/types';
import { confirmDataRequestPublication, createDataRequest, getDataRequestResponses, getMyDataRequests, getMyDataRequestsPage, submitDataRequestResponse } from './data-requests';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('./client', () => ({ api: mocks }));

describe('supplier quote API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts the backend timeline field once without a dedup bypass ID and returns the receipt', async () => {
    const receipt = { id: 'response-1', status: 'submitted' };
    mocks.post.mockResolvedValue({ data: receipt });
    const payload = { proposal: 'Dataset proposal', proposed_price: 125, proposed_timeline: '2 weeks' };
    expect(await submitDataRequestResponse('request-1', payload)).toEqual(receipt);
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/data-requests/request-1/responses', payload);
  });

  it.each(['array', 'envelope'])('loads the server-scoped supplier responses from an %s', async (shape) => {
    const items = [{ id: 'response-1', status: 'submitted', proposed_timeline: '2 weeks' }];
    mocks.get.mockResolvedValue({ data: shape === 'array' ? items : { items, total: 1 } });
    expect(await getDataRequestResponses('request-1')).toEqual(items);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith('/data-requests/request-1/responses');
  });
});

describe('owned request API contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the shared private draft with no serving slug', async () => {
    const draft = { id: '00000000-0000-4000-8000-000000000001', ...fixture.draft };
    mocks.post.mockResolvedValueOnce({ data: draft });
    expect(await createDataRequest({ ...fixture.create, urgency: fixture.create.urgency as DataRequestUrgency })).toEqual(draft);
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/data-requests', fixture.create);
    expect(draft.slug).toBeNull();
  });

  it('preserves the consent endpoint and sends the exact displayed binding only for a prepared revision', async () => {
    mocks.put.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: fixture.approved });
    const { binding, public_content_hash, policy_version } = fixture.preview.publication_preparation;
    await confirmDataRequestPublication('request-1', 'hash', 'consent-1');
    expect(await confirmDataRequestPublication('request-1', public_content_hash, policy_version, binding)).toEqual(fixture.approved);
    expect(mocks.put.mock.calls).toEqual([
      ['/data-requests/request-1/publication-consent', { public_content_hash: 'hash', policy_version: 'consent-1' }],
      ['/data-requests/request-1/publication-consent', fixture.confirmation],
    ]);
  });

  it('keeps the existing array-only helper compatible with array and envelope responses', async () => {
    const items = [{ id: 'private-draft', status: 'draft' }];
    for (const data of [items, { items, total: 82, page: 1, per_page: 20 }]) {
      mocks.get.mockResolvedValueOnce({ data });
      expect(await getMyDataRequests()).toEqual(items);
    }
    expect(mocks.get.mock.calls).toEqual(Array.from({ length: 2 }, () => [
      '/data-requests', { params: { mine: true } },
    ]));
  });

  it('retains server metadata and uses only page-mode parameters', async () => {
    const data = { items: [{ id: 'private-draft', status: 'draft' }], total: 82, page: 3, per_page: 20 };
    mocks.get.mockResolvedValueOnce({ data });
    expect(await getMyDataRequestsPage(3)).toEqual(data);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith('/data-requests', {
      params: { mine: true, page: 3, per_page: 20 },
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
