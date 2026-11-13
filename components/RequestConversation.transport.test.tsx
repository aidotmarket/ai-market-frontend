// @vitest-environment jsdom
import '@/tests/support-network-trap';
import '@/tests/fixtures/request-thread-network-guard';
import React from 'react';
import axios from 'axios';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import RequestConversation from './RequestConversation';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import type { User } from '@/types';
const mocks = vi.hoisted(() => ({ adapter: vi.fn() }));
vi.mock('axios', async original => {
  const axiosModule = await original<typeof import('axios')>(); const actual = axiosModule.default;
  return { ...axiosModule, default: Object.assign((...args: Parameters<typeof actual>) => actual(...args), actual, { create: (config: Parameters<typeof actual.create>[0]) => actual.create({ ...config, adapter: mocks.adapter }) }) };
});
const token = (seconds = 3600) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.sig`;
let availability: string, threadSend: boolean, historySend: boolean, malformed: boolean;
beforeEach(() => {
  vi.clearAllMocks(); advanceAuthSessionOwner(); window.history.replaceState(null, '', '/requests/example');
  useAuthStore.setState({ user: { id: 'seller', role: 'seller' } as User, token: token(), isAuthenticated: true });
  availability = 'enabled'; threadSend = true; historySend = true; malformed = false;
  mocks.adapter.mockImplementation(async config => {
    const data = config.url.endsWith('/threads')
      ? { contract: 'request-thread-v1', request_id: 'request', side: 'seller', availability, threads: [{ response_id: 'one', can_send: threadSend }] }
      : config.method === 'post'
      ? { contract: 'request-thread-v1', request_id: 'request', ...JSON.parse(config.data), command_digest: 'a'.repeat(64), event_id: 'event', state: malformed ? ['sent'] : 'sent', message: malformed ? null : { request_id: 'request', response_id: 'one', id: 'safe', role: 'seller', content: 'Server approved text' } }
      : { contract: 'request-thread-v1', request_id: 'request', response_id: 'one', can_send: historySend, items: [], next_cursor: null };
    return { data, status: 200, headers: {}, config };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function mount() {
  render(<RequestConversation requestId="request" requestStatus="open" />);
  await screen.findByText('No messages in this conversation.');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Exact private command' } });
}
it.each([false, true])('real parser and component handle typed success vs malformed array state: %s', async bad => {
  malformed = bad; await mount(); fireEvent.click(screen.getByRole('button', { name: 'Send private message' }));
  await screen.findByText(bad ? /We could not confirm/ : /Message sent/);
  expect(screen.queryByText('Server approved text') !== null).toBe(!bad);
  expect(screen.getByRole('textbox')).toHaveProperty('value', bad ? 'Exact private command' : '');
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(1);
});
it.each(['off', 'thread', 'history'])('real deferred session refresh refuses POST after current %s denial', async denial => {
  await mount(); let release!: (value: { data: { access_token: string } }) => void;
  const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(new Promise(yes => { release = yes; }));
  await act(async () => { useAuthStore.setState({ token: token(-60) }); });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  if (denial === 'off') availability = 'off';
  if (denial === 'thread') threadSend = false;
  if (denial === 'history') historySend = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  // Read transport now waits behind the shared rotation. The local read phase
  // still retires this send before any mutation is admitted.
  await act(async () => { release({ data: { access_token: token() } }); });
  await waitFor(() => expect(mocks.adapter.mock.calls.filter(([c]) => c.url.endsWith('/threads'))).toHaveLength(2));
  await screen.findByText('No messages in this conversation.');
  await screen.findByText(/Message not sent.*conversation is not ready/);
  expect(screen.queryByRole('button', { name: 'Check message result' })).toBeNull();
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(0);
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Exact private command');
});

it.each(['selecting', 'reading', 'readError'])('exact local %s admission refusal preserves one explicit retry without a nonce lookup', async phase => {
  await mount(); const nonce = 'local-only-nonce'; vi.spyOn(crypto, 'randomUUID').mockReturnValue(nonce as ReturnType<typeof crypto.randomUUID>);
  let release!: (value: { data: { access_token: string } }) => void;
  const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(new Promise(yes => { release = yes; }));
  await act(async () => { useAuthStore.setState({ token: token(-60) }); });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  const original = mocks.adapter.getMockImplementation()!;
  let finishRead!: () => void;
  mocks.adapter.mockImplementation(async config => {
    if ((phase === 'selecting' && config.url.endsWith('/threads')) || (phase === 'reading' && config.url.endsWith('/messages'))) {
      await new Promise<void>(yes => { finishRead = yes; });
    }
    if (phase === 'readError' && config.url.endsWith('/messages')) throw new Error('PRIVATE READ ERROR');
    return original(config);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  await act(async () => release({ data: { access_token: token() } }));
  if (phase === 'readError') await screen.findByRole('alert');
  else await waitFor(() => expect(finishRead).toBeTypeOf('function'));
  await screen.findByText(/Message not sent.*conversation is not ready/);
  expect(screen.queryByText(/We could not confirm|PRIVATE READ ERROR/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check message result' })).toBeNull();
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(0);
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Exact private command');
  if (phase === 'readError') {
    mocks.adapter.mockImplementation(original); fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  } else await act(async () => finishRead());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry same message' })).toHaveProperty('disabled', false));
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' })); await screen.findByText(/Message sent/);
  const posts = mocks.adapter.mock.calls.filter(([c]) => c.method === 'post'); expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][0].data)).toEqual({ response_id: 'one', client_message_nonce: nonce, content: 'Exact private command' });
  expect(mocks.adapter.mock.calls.some(([c]) => c.url.includes('/message-commands/'))).toBe(false);
});
it('keeps an earlier dispatched loss unknown when a later retry is locally refused', async () => {
  await mount(); const original = mocks.adapter.getMockImplementation()!;
  mocks.adapter.mockImplementation(async config => { if (config.method === 'post') throw new Error('Lost network response'); return original(config); });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await screen.findByText(/We could not confirm/);
  const body = mocks.adapter.mock.calls.find(([c]) => c.method === 'post')![0].data;
  let release!: (value: { data: { access_token: string } }) => void;
  vi.spyOn(axios, 'post').mockReturnValueOnce(new Promise(yes => { release = yes; }));
  await act(async () => { useAuthStore.setState({ token: token(-60) }); });
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' }));
  historySend = false; fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  await act(async () => release({ data: { access_token: token() } }));
  await screen.findByText('New messages are not available for this conversation.');
  await screen.findByText(/We could not confirm/); expect(screen.queryByText(/Message not sent/)).toBeNull();
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(1);
  expect(mocks.adapter.mock.calls.find(([c]) => c.method === 'post')![0].data).toBe(body);
  expect(screen.getByRole('button', { name: 'Check message result' })).toHaveProperty('disabled', false);
});

it.each(['owner', 'principal', 'signout'])('retires a deferred predispatch attempt on %s departure with zero POST and no late adoption', async kind => {
  await mount(); let release!: (value: { data: { access_token: string } }) => void;
  const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(new Promise(yes => { release = yes; }));
  await act(async () => useAuthStore.setState({ token: token(-60) }));
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  await act(async () => {
    if (kind === 'owner') advanceAuthSessionOwner();
    else if (kind === 'principal') useAuthStore.setState({ user: { id: 'other', role: 'seller' } as User });
    else useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  });
  await act(async () => release({ data: { access_token: token() } }));
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(0);
  expect(screen.queryByDisplayValue('Exact private command')).toBeNull(); expect(screen.queryByText(/Message sent|Message not sent/)).toBeNull();
});
it.each([
  [404, 'command_not_found', true], [404, 'thread_unavailable', false], [404, ['command_not_found'], false], [403, 'command_not_found', false],
])('real lookup status %s detail %s preserves history only for exact nonce absence', async (status, detail, absent) => {
  await mount(); const original = mocks.adapter.getMockImplementation()!;
  mocks.adapter.mockImplementation(async config => {
    if (config.method === 'post') throw new Error('Lost response');
    if (config.url.includes('/message-commands/')) throw { response: { status, data: { detail, private_error: 'SECRET' } } };
    return original(config);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await screen.findByText(/We could not confirm/);
  fireEvent.click(screen.getByRole('button', { name: 'Check message result' }));
  await screen.findByText(absent ? /No record of this attempt/ : /This conversation is unavailable/);
  expect(screen.queryByText('No messages in this conversation.') !== null).toBe(absent);
  expect(screen.queryByText(/Message not sent|SECRET/)).toBeNull();
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(1);
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Exact private command');
});
