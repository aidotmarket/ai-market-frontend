import { beforeEach, expect, it, vi } from 'vitest';
import { createListingAssistant } from './sellerListingAssistant';
const client = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('./client', () => ({ api: client }));
const request = { brief: 'Synthetic retail totals', draft: { title: '', description: '', category: '', tags: '' }, reviewing: 'title' as const, instruction: 'Draft a title', history: [] };
beforeEach(() => vi.clearAllMocks());
it('reuses the request identity after an unknown response and uses a new identity after success', async () => {
  const assistant = createListingAssistant();
  client.post.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: { message: 'Ready', proposals: [] } });
  await expect(assistant(request, new AbortController().signal)).rejects.toThrow('network');
  await assistant(request, new AbortController().signal);
  await assistant(request, new AbortController().signal);
  expect(client.post.mock.calls[0][1]).toEqual(client.post.mock.calls[1][1]);
  expect(client.post.mock.calls[2][1].request_id).not.toBe(client.post.mock.calls[0][1].request_id);
  expect(Object.keys(client.post.mock.calls[0][1]).sort()).toEqual(['request', 'request_id']);
});
it('does not discard a newer retry identity when an older response arrives', async () => {
  let finishOld!: (value: unknown) => void;
  const assistant = createListingAssistant();
  client.post.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: { message: 'Ready', proposals: [] } });
  const old = assistant(request, new AbortController().signal);
  const revised = { ...request, instruction: 'Make it shorter' };
  await expect(assistant(revised, new AbortController().signal)).rejects.toThrow('network');
  finishOld({ data: { message: 'Old', proposals: [] } });
  await old;
  await assistant(revised, new AbortController().signal);
  expect(client.post.mock.calls[1][1].request_id).toBe(client.post.mock.calls[2][1].request_id);
});
