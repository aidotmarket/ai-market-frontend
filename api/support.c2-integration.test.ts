import '@/tests/support-network-trap';
import '@/tests/support-private-network-guard';
import { beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('./client', () => ({ api: { get: ports.get } }));
vi.mock('./session-mutation', () => ({ postSessionMutation: ports.post, patchSessionMutation: vi.fn() }));
import { support, customerConversation } from './support';
import { principal, conversation } from '@/tests/support-fixtures';
beforeEach(() => { vi.clearAllMocks(); principal(); });
it('sends the unchanged typed nonce command to C2 customer-messages with current-visit admission', async () => {
  const response = conversation({ messages: [{ id: 'server-id', version: 'a'.repeat(64), direction: 'outbound', body: 'Exact visible reply' }], next_cursor: 'opaque-cursor' });
  ports.post.mockResolvedValue(response);
  const admission = vi.fn();
  const port = support.withAdmission!(admission);
  const nonce = '19c1c90a-c519-46fd-ab7e-a7a5b3604a1d';
  expect(await port.reply('SUP/42', nonce, 'Still fails')).toEqual(response);
  expect(ports.post).toHaveBeenCalledExactlyOnceWith('/support/tickets/SUP%2F42/customer-messages', { client_message_nonce: nonce, body: 'Still fails' }, expect.any(Function));
  const callback = ports.post.mock.calls[0][2]; callback(); expect(admission).toHaveBeenCalledOnce();
  await port.receipt('SUP/42', 'server-id', 'a'.repeat(64));
  expect(ports.post.mock.calls[1]).toEqual(['/support/tickets/SUP%2F42/customer-receipts', { message_id: 'server-id', version: 'a'.repeat(64) }, expect.any(Function)]);
});
it('does not accept legacy lists or integer versions as typed conversation success', () => {
  expect(() => customerConversation([])).toThrow('SUPPORT_WIRE_INVALID');
  expect(() => customerConversation(conversation({ messages: [{ id: 'id', version: 1, direction: 'outbound', body: 'reply' }] as never }))).toThrow('SUPPORT_WIRE_INVALID');
  expect(() => customerConversation({ ...conversation(), next_cursor: undefined })).toThrow('SUPPORT_WIRE_INVALID');
});

import { OrderIssueSession } from '@/lib/order-issue-report';
import { proposal, confirmed } from '@/tests/support-fixtures';
import { createHash } from 'node:crypto';
// ce720 FilingPort passes _server_ticket_id=proposal.id, and its projection
// keeps proposal.id as conversation_id. These UUIDs are explicit fake inputs.
const proposalId = '11111111-1111-4111-8111-111111111111';
const outboundId = '22222222-2222-4222-8222-222222222222';
const outboundBody = 'Your report is recorded; pickup is requested. Email is pending.';
const visibleVersion = createHash('sha256').update(JSON.stringify([outboundId, 'outbound', outboundBody])).digest('hex');
const c3Confirmed = () => confirmed({ conversation_id: proposalId, acknowledgement: { id: outboundId, direction: 'outbound', body: outboundBody, version: visibleVersion } });
const c3Proposal = () => proposal({ proposal_id: proposalId, conversation_id: proposalId, confirmation: c3Confirmed() });
const c2Conversation = () => conversation({ conversation_id: proposalId, messages: [c3Confirmed().acknowledgement] });
async function actualSession() {
  ports.get.mockResolvedValue({ data: c3Proposal() });
  // Invoke real optional admission at the fake transport boundary.
  ports.post.mockImplementation(async (_path, _body, admission) => { admission?.(); return c2Conversation(); });
  const session = new OrderIssueSession('order-fixture', support, proposalId);
  await session.open();
  ports.get.mockResolvedValue({ data: c2Conversation() }); await session.loadConversation();
  expect(session.getSnapshot().reply.validated).toBe(true);
  return session;
}
it('joins actual C3 session and C2 adapter, retaining the exact unknown command across explicit read/retry and displayed string receipt', async () => {
  const session = await actualSession(); session.editReply('Exact objection remains');
  ports.post.mockImplementationOnce(async (_path, _body, admission) => { admission?.(); throw new Error('synthetic unknown'); });
  await session.sendReply();
  expect(session.getSnapshot().reply).toMatchObject({ unknown: true, body: 'Exact objection remains', validated: false });
  const command = ports.post.mock.calls[0];
  expect(command[0]).toBe('/support/tickets/SUP-42/customer-messages');
  expect(command[1]).toEqual({ client_message_nonce: expect.stringMatching(/^[0-9a-f-]{36}$/), body: 'Exact objection remains' });
  session.editReply('Attempted replacement'); await session.sendReply(); expect(ports.post).toHaveBeenCalledOnce();
  await session.loadConversation(); expect(ports.post).toHaveBeenCalledOnce();
  await session.sendReply();
  expect(ports.post.mock.calls[1].slice(0,2)).toEqual(command.slice(0,2));
  expect(session.getSnapshot().reply).toMatchObject({ unknown: false, body: '' });
  await session.recordReceipt(c3Confirmed(), outboundId, visibleVersion);
  expect(ports.post.mock.calls[2].slice(0,2)).toEqual(['/support/tickets/SUP-42/customer-receipts', { message_id: outboundId, version: visibleVersion }]);
  session.retire();
});
it.each(['public_ref', 'conversation_id'] as const)('quarantines a foreign %s returned by the actual typed reply adapter', async key => {
  const session = await actualSession(); session.editReply('Retained original');
  ports.post.mockResolvedValue({ ...c2Conversation(), [key]: 'foreign-scope' });
  await session.sendReply();
  expect(session.getSnapshot().reply).toMatchObject({ unknown: true, body: 'Retained original', validated: false });
  expect(session.getSnapshot().reply.conversation).toEqual(c2Conversation());
  expect(session.getSnapshot().reply.conversation?.messages[0].version).toBe(visibleVersion);
  await session.sendReply(); expect(ports.post).toHaveBeenCalledOnce(); session.retire();
});
it('does not claim a received reply or a C5 reopen when the actual endpoint refuses enrollment readiness', async () => {
  const session = await actualSession(); session.editReply('Still broken');
  ports.post.mockRejectedValue({ response: { status: 503, data: { detail: 'Reopen unavailable pending C5' } } });
  await session.sendReply();
  expect(session.getSnapshot().reply).toMatchObject({ unknown: true, validated: false, body: 'Still broken' });
  expect(session.getSnapshot().reply.conversation).toEqual(c2Conversation()); session.retire();
});
