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
  await waitFor(() => expect(mocks.adapter.mock.calls.filter(([c]) => c.url.endsWith('/threads'))).toHaveLength(2));
  await screen.findByText('No messages in this conversation.');
  await act(async () => { release({ data: { access_token: token() } }); });
  await screen.findByText(/We could not confirm/);
  expect(mocks.adapter.mock.calls.filter(([c]) => c.method === 'post')).toHaveLength(0);
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Exact private command');
});
