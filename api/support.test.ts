import { describe, it, expect, vi, beforeEach } from 'vitest';
const ports = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('./client', () => ({ api: { get: ports.get } }));
vi.mock('./session-mutation', () => ({ postSessionMutation: ports.post, patchSessionMutation: ports.patch }));
import { support, reportProposal, issueDraft, orderIssueContext, canonicalIssue } from './support';
import { principal, proposal, context, confirmed, conversation, deferred } from '@/tests/support-fixtures';
import { useAuthStore } from '@/store/auth';

beforeEach(() => { vi.clearAllMocks(); principal(); });
describe('C3 typed wire boundary', () => {
  it('only projects scalar snapshot keys; excluded nested/provider/private fields cannot render or forward', async () => {
    const hostile = { ...context, stripe_payment_id: 'EXCLUDED-STRIPE', seller_payout: 'EXCLUDED-PAYOUT',
      delivery_config: { token: 'EXCLUDED-TOKEN' }, listing_snapshot: { title: 'EXCLUDED-NESTED-TITLE' }, internal_notes: 'EXCLUDED-NOTE' };
    expect(orderIssueContext(hostile)).toEqual(context);
    const parsed = reportProposal({ ...proposal(), context: hostile, requester: 'EXCLUDED-ACTOR' });
    expect(JSON.stringify(parsed)).not.toMatch(/EXCLUDED/);
    ports.patch.mockResolvedValue(proposal());
    await support.save('order', 'proposal', 1, { category: 'other', description: 'User text',
      requester: 'EXCLUDED-ACTOR', context: hostile, browser: 'irrelevant' } as never, 'web');
    expect(ports.patch).toHaveBeenCalledWith('/orders/order/issue-reports/proposals/proposal', {
      expected_revision: 1, draft: { category: 'other', description: 'User text' }, surface: 'web' });
  });
  it.each(['listing_title', 'status', 'amount_cents'] as const)('rejects arbitrary nested allowed-key value at %s', key => {
    expect(() => orderIssueContext({ ...context, [key]: { private: 'not scalar' } })).toThrow('SUPPORT_WIRE_INVALID');
  });
  it('preserves null truth and renders bounded title as plain text data', () => {
    expect(orderIssueContext(context).paid_at).toBeNull();
    expect(orderIssueContext(context).listing_title).toBe('<script>plain title</script>');
    expect(() => orderIssueContext({ ...context, listing_title: 'x'.repeat(201) })).toThrow();
  });
  it('validates categories and exact character bounds; canonical order excludes unknown fields', () => {
    expect(issueDraft({ category: 'download_delivery', description: 'x'.repeat(4000), browser: 'b'.repeat(100), error: 'e'.repeat(1000) }).description).toHaveLength(4000);
    for (const draft of [
      { category: 'admin', description: 'bad' }, { category: 'other', description: 'x'.repeat(4001) },
      { category: 'download_delivery', description: 'x', browser: 'x'.repeat(101) },
      { category: 'download_delivery', description: 'x', error: 'x'.repeat(1001) },
    ]) expect(() => issueDraft(draft)).toThrow();
    expect(canonicalIssue({ description: 'Exact', category: 'other', error: 'excluded' })).toBe('{"category":"other","description":"Exact"}');
  });
  it('guidance caps fail closed on oversized/malformed server envelopes', () => {
    expect(() => reportProposal(proposal({ guidance_turns: 21 }))).toThrow();
    expect(() => reportProposal(proposal({ guidance_bytes: 65537 }))).toThrow();
    expect(() => reportProposal({ ...proposal(), guidance: [{ id: 'a', body: 'x'.repeat(16001) }] })).toThrow();
    expect(() => reportProposal({ ...proposal(), enrollment: undefined })).toThrow();
    expect(() => reportProposal({ ...proposal(), confirmation: undefined })).toThrow();
  });
  it('uses only agreed order and scoped ticket commands; never submits actor, direction or generic ticket shape', async () => {
    ports.post.mockResolvedValue(proposal());
    await support.open('order/a', 'stable-open', 'allai', true);
    await support.guide('order/a', 'proposal', 3, 'stable-turn', 'Question');
    await support.confirm('order/a', 'proposal', 4, 'a'.repeat(64));
    expect(ports.post.mock.calls.slice(0,3)).toEqual([
      ['/orders/order%2Fa/issue-reports/proposals', { open_nonce: 'stable-open', surface: 'allai', resume_latest: true }],
      ['/orders/order%2Fa/issue-reports/proposals/proposal/guidance', { expected_revision: 3, turn_nonce: 'stable-turn', body: 'Question' }],
      ['/orders/order%2Fa/issue-reports', { proposal_id: 'proposal', confirmed_revision: 4, content_digest: 'a'.repeat(64) }],
    ]);
    ports.get.mockResolvedValue({ data: conversation() });
    await support.conversation('SUP/42', 'safe-cursor');
    expect(ports.get).toHaveBeenCalledWith('/support/tickets/SUP%2F42/conversation', { params: { cursor: 'safe-cursor' } });
    ports.post.mockResolvedValue(conversation());
    await support.reply('SUP/42', 'stable-message', 'Fix still fails');
    await support.receipt('SUP/42', 'server-message', 'immutable-v2');
    expect(ports.post.mock.calls.slice(3)).toEqual([
      ['/support/tickets/SUP%2F42/messages', { client_message_nonce: 'stable-message', body: 'Fix still fails' }],
      ['/support/tickets/SUP%2F42/customer-receipts', { message_id: 'server-message', version: 'immutable-v2' }],
    ]);
  });
  it('current account is required before all operations and response ownership checked after await', async () => {
    useAuthStore.setState({ token: null, user: null });
    await expect(support.open('order', 'nonce', 'allai', true)).rejects.toThrow('FIRST_PARTY_SESSION_REQUIRED');
    expect(ports.post).not.toHaveBeenCalled();
    principal(); const pending = deferred<unknown>(); ports.post.mockReturnValue(pending.promise);
    const request = support.open('order', 'nonce', 'allai', true);
    principal('seller'); pending.resolve(proposal({ confirmation: confirmed() }));
    await expect(request).rejects.toThrow('superseded');
  });
});
