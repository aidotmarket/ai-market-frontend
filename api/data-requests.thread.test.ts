import "@/tests/support-network-trap";
import "@/tests/fixtures/request-thread-network-guard";
import axios from 'axios';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getRequestThreadSelector, getRequestThreadMessages, sendRequestThreadMessage, reconcileRequestThreadMessage } from './data-requests';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import type { User } from '@/types';
const mocks = vi.hoisted(() => ({ adapter: vi.fn() }));
vi.mock('axios', async original => {
  const axiosModule = await original<typeof import('axios')>(); const actual = axiosModule.default;
  return { ...axiosModule, default: Object.assign((...args: Parameters<typeof actual>) => actual(...args), actual, { create: (config: Parameters<typeof actual.create>[0]) => actual.create({ ...config, adapter: mocks.adapter }) }) };
});
const token = (seconds = 3600) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.sig`;
const command = { response_id: 'response', client_message_nonce: 'nonce', content: 'Original private input' };
const receipt = (fields = {}) => ({ contract: 'request-thread-v1', request_id: 'request', response_id: 'response', client_message_nonce: 'nonce', command_digest: 'a'.repeat(64), state: 'sent', event_id: 'event', message: { request_id: 'request', response_id: 'response', id: 'message', role: 'seller', content: 'Mediated safe text', original_content: 'SECRET ORIGINAL' }, ...fields });
function returns(data: unknown) { mocks.adapter.mockResolvedValueOnce({ data, status: 200, headers: {}, config: {} }); }
beforeEach(() => { mocks.adapter.mockReset(); advanceAuthSessionOwner(); useAuthStore.setState({ token: token(), user: { id: 'principal' } as User, isAuthenticated: true }); });
afterEach(() => vi.restoreAllMocks());
it('uses the proposed scoped selector and projects away private extras', async () => {
  returns({ contract: 'request-thread-v1', request_id: 'request', side: 'seller', availability: 'enabled', threads: [{ response_id: 'response', can_send: true, seller_id: 'SECRET' }], watch: 'SECRET' });
  expect(await getRequestThreadSelector('request')).toEqual({ contract: 'request-thread-v1', request_id: 'request', side: 'seller', availability: 'enabled', threads: [{ response_id: 'response', can_send: true }] });
  expect(mocks.adapter.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/data-requests/request/threads' });
});
it.each([
  { side: 'seller', threads: [{ response_id: 'response', can_send: true }, { response_id: 'other', can_send: true }] },
  { side: 'buyer', threads: [{ response_id: null, can_send: true }] },
  { availability: null }, { contract: undefined }, { request_id: 'other' },
])('rejects malformed, aggregate or unavailable-contract selectors %#', async fields => {
  returns({ contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: [], ...fields });
  await expect(getRequestThreadSelector('request')).rejects.toThrow();
});
it('rejects a deep link selector returning a different response', async () => {
  returns({ contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: [{ response_id: 'wrong', can_send: true }] });
  await expect(getRequestThreadSelector('request', 'response')).rejects.toThrow();
});
it('never reads an omitted response or accepts legacy/null/other-thread history', async () => {
  await expect(getRequestThreadMessages('request', '')).rejects.toThrow(); expect(mocks.adapter).not.toHaveBeenCalled();
  for (const response_id of [null, 'wrong']) {
    returns({ contract: 'request-thread-v1', request_id: 'request', response_id: 'response', can_send: true, items: [{ request_id: 'request', response_id, id: 'old', role: 'buyer', state: 'sent', content: 'Wrong thread' }], next_cursor: null });
    await expect(getRequestThreadMessages('request', 'response')).rejects.toThrow();
  }
  returns({ items: [], total: 0, page: 1, per_page: 50 }); await expect(getRequestThreadMessages('request', 'response')).rejects.toThrow();
});
it('accepts only sent scoped safe history and excludes private originals/moderation', async () => {
  returns({ contract: 'request-thread-v1', request_id: 'request', response_id: 'response', can_send: true, next_cursor: null, items: [{ request_id: 'request', response_id: 'response', state: 'sent', id: 'safe', role: 'buyer', content: '<b>Plain</b>', original_content: 'SECRET', watch: 'SECRET' }] });
  expect((await getRequestThreadMessages('request', 'response')).items).toEqual([{ id: 'safe', role: 'buyer', content: '<b>Plain</b>' }]);
  expect(mocks.adapter.mock.calls[0][0].params).toEqual({ response_id: 'response', contract: 'request-thread-v1', cursor: undefined });
});
it.each(['held', 'clarification_requested', 'refused', 'unusable', 'processing_failed', 'unknown'])('refuses %s history entries', async state => {
  returns({ contract: 'request-thread-v1', request_id: 'request', response_id: 'response', can_send: true, next_cursor: null, items: [{ request_id: 'request', response_id: 'response', state, id: 'unsafe', role: 'buyer', content: 'Held original' }] });
  await expect(getRequestThreadMessages('request', 'response')).rejects.toThrow();
});
it('sends exact command through session+CSRF once, refreshes before admission and strips private response fields', async () => {
  useAuthStore.setState({ token: token(-60) }); const fresh = token(); const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: fresh } });
  returns(receipt()); const result = await sendRequestThreadMessage('request', command);
  expect(refresh).toHaveBeenCalledOnce(); expect(mocks.adapter).toHaveBeenCalledOnce();
  const config = mocks.adapter.mock.calls[0][0];
  expect(config).toMatchObject({ method: 'post', url: '/data-requests/request/message-commands', headers: { Authorization: `Bearer ${fresh}`, 'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0' + fresh).digest('hex') } });
  expect(JSON.parse(config.data)).toEqual(command); expect(JSON.stringify(result)).not.toContain('SECRET');
});
it('never automatically replays a refused C4 mutation', async () => {
  const failure = { response: { status: 401 } }; mocks.adapter.mockRejectedValue(failure); const refresh = vi.spyOn(axios, 'post');
  await expect(sendRequestThreadMessage('request', command)).rejects.toBe(failure); expect(mocks.adapter).toHaveBeenCalledOnce(); expect(refresh).not.toHaveBeenCalled();
});
it('will not send across an owner change during preflight refresh', async () => {
  useAuthStore.setState({ token: token(-60) }); vi.spyOn(axios, 'post').mockImplementation(async () => { advanceAuthSessionOwner(); return { data: { access_token: token() } }; });
  await expect(sendRequestThreadMessage('request', command)).rejects.toThrow(); expect(mocks.adapter).not.toHaveBeenCalled();
});
it.each([
  { response_id: 'wrong' }, { request_id: 'wrong' }, { client_message_nonce: 'wrong' }, { command_digest: 'bad' },
  { state: 'held', message: null, event_id: null }, { state: 'unrecognized' }, { state: 'held' },
  { message: { request_id: 'request', response_id: 'wrong', id: 'message', role: 'seller', content: 'Other history' } },
])('quarantines malformed or wrong command result %#', async fields => {
  returns(receipt(fields)); await expect(sendRequestThreadMessage('request', command)).rejects.toThrow();
});
it.each(['held', 'clarification_requested', 'refused', 'unusable', 'processing', 'processing_failed', 'unknown'])('parses actual typed %s independently from transport failure', async state => {
  returns(receipt({ state, message: null })); expect((await sendRequestThreadMessage('request', command)).state).toBe(state);
});
it('reconciles the same nonce in a scoped read without sending another command', async () => {
  returns(receipt()); await reconcileRequestThreadMessage('request', command);
  expect(mocks.adapter).toHaveBeenCalledOnce(); expect(mocks.adapter.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/data-requests/request/message-commands/nonce', params: { response_id: 'response' } });
});

it('snapshots only command fields and never forwards forged authority or later mutations', async () => {
  const body = { ...command, actor: 'forged', recipient: 'forged', loop_state: 'forged' };
  returns(receipt()); const sent = sendRequestThreadMessage('request', body);
  body.content = 'Changed after admission'; body.response_id = 'other';
  await sent; expect(JSON.parse(mocks.adapter.mock.calls[0][0].data)).toEqual(command);
});
it('refuses a changed principal after refresh even if an external writer omitted the owner advance', async () => {
  useAuthStore.setState({ token: token(-60) });
  vi.spyOn(axios, 'post').mockImplementation(async () => { useAuthStore.setState({ user: { id: 'other' } as User }); return { data: { access_token: token() } }; });
  await expect(sendRequestThreadMessage('request', command)).rejects.toThrow(); expect(mocks.adapter).not.toHaveBeenCalled();
});
it.each(['thread switched', 'request closed'])('rechecks caller admission after refresh: %s', async reason => {
  useAuthStore.setState({ token: token(-60) }); let current = true;
  vi.spyOn(axios, 'post').mockImplementation(async () => { current = false; return { data: { access_token: token() } }; });
  await expect(sendRequestThreadMessage('request', command, () => { if (!current) throw new Error(reason); })).rejects.toThrow(reason);
  expect(mocks.adapter).not.toHaveBeenCalled();
});
