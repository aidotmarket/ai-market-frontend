import { beforeEach, describe, expect, it, vi } from 'vitest';
import { previewDataRequestPublication, getDataRequestResponses, getMyDataRequests, getMyDataRequestsPage, submitDataRequestResponse } from './data-requests';

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

describe('owned request API contracts', () => {
  beforeEach(() => vi.clearAllMocks());

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


describe('private publication preview contract', () => {
  beforeEach(() => vi.clearAllMocks());
  const content = { title: 'Dataset request', description: 'Need 500 records for research.', provenance_requirements: null,
    categories: ['healthcare'], format_preferences: ['csv'], regulatory_requirements: [],
    price_range_min: null, price_range_max: '100.00', currency: 'USD', urgency: 'normal' };
  const preview = { public_content: content, public_content_hash: 'b'.repeat(64), source_content_hash: 'a'.repeat(64) };
  it('posts no body to the exact encoded owner route and parses the public projection', async () => {
    mocks.post.mockResolvedValue({ data: { preview, acceptance_required: true, next_action: 'Apply using normal edit' } });
    expect(await previewDataRequestPublication('request/id')).toEqual(preview);
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/data-requests/request%2Fid/publication-preview');
  });
  it('preserves null-preview guidance without treating it as acceptance', async () => {
    const next_action = 'Keep your original text and ask support for independent review.';
    mocks.post.mockResolvedValue({ data: { preview: null, acceptance_required: true, next_action } });
    expect(await previewDataRequestPublication('id')).toEqual({ preview: null, next_action });
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/data-requests/id/publication-preview');
  });
  it.each([undefined, null, '', '  ', 42, {}, ['edit'], 'a'.repeat(2001), 'Bad\u0000guidance'])(
    'uses neutral guidance for missing or malformed next_action (%j)', async next_action => {
      mocks.post.mockResolvedValue({ data: { preview: null, acceptance_required: true, next_action } });
      expect(await previewDataRequestPublication('id')).toEqual({ preview: null,
        next_action: 'No public preview is available. Your saved request is unchanged.' });
    }
  );
  it('preserves markup as display-only plain text', async () => {
    const next_action = '<a href="/support">Ask support</a>\nKeep the original text.';
    mocks.post.mockResolvedValue({ data: { preview: null, acceptance_required: true, next_action } });
    expect(await previewDataRequestPublication('id')).toEqual({ preview: null, next_action });
  });
  it.each([
    { preview: null, acceptance_required: false, next_action: 'Keep text' },
    { preview, acceptance_required: false }, { preview: { ...preview, source_content_hash: 'old' }, acceptance_required: true },
    { preview: { ...preview, public_content: { ...content, buyer_id: 'private' } }, acceptance_required: true },
    { preview: { ...preview, public_content: { ...content, price_range_max: 100 } }, acceptance_required: true },
    { preview: { ...preview, public_content: { ...content, categories: ['safe', {}] } }, acceptance_required: true },
    { preview: { ...preview, public_content: { ...content, description: null } }, acceptance_required: true },
    { public_content: content }, null,
  ])('refuses incompatible or malformed preview envelopes', async data => {
    mocks.post.mockResolvedValue({ data });
    await expect(previewDataRequestPublication('id')).rejects.toThrow('Public preview unavailable');
  });
});
