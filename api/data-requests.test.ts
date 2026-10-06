import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDataRequestResponses, submitDataRequestResponse } from './data-requests';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
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
