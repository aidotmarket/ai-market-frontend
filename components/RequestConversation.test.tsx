// @vitest-environment jsdom
import "@/tests/support-network-trap";
import "@/tests/fixtures/request-thread-network-guard";
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import RequestConversation from './RequestConversation';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import type { User } from '@/types';
import type { RequestCommandResult, RequestMessageCommand } from '@/api/data-requests';
const mocks = vi.hoisted(() => ({ selector: vi.fn(), history: vi.fn(), send: vi.fn(), check: vi.fn() }));
vi.mock('@/api/data-requests', async () => ({
  ...await vi.importActual<typeof import('@/api/data-requests')>('@/api/data-requests'), getRequestThreadSelector: mocks.selector, getRequestThreadMessages: mocks.history, sendRequestThreadMessage: mocks.send, reconcileRequestThreadMessage: mocks.check }));
const user = { id: 'buyer', role: 'buyer' } as User;
const selector = (fields = {}) => ({ contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: [{ response_id: 'one', can_send: true }, { response_id: 'two', can_send: true }], ...fields });
const history = (response = 'one', fields = {}) => ({ contract: 'request-thread-v1', request_id: 'request', response_id: response, can_send: true, items: [], next_cursor: null, ...fields });
const result = (command: RequestMessageCommand, state = 'sent', fields = {}) => ({ contract: 'request-thread-v1', request_id: 'request', response_id: command.response_id, client_message_nonce: command.client_message_nonce, command_digest: 'a'.repeat(64), event_id: 'event', state, message: state === 'sent' ? { request_id: 'request', response_id: command.response_id, id: 'safe', role: 'buyer', content: 'Approved safe text' } : null, ...fields }) as RequestCommandResult;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function mount(status = 'open') {
  const view = render(<RequestConversation requestId="request" requestStatus={status} />);
  await screen.findByRole('combobox'); return view;
}
async function select(response = 'one') { fireEvent.change(screen.getByRole('combobox'), { target: { value: response } }); await screen.findByText('No messages in this conversation.'); }
function write(body = 'Private original draft') { fireEvent.change(screen.getByRole('textbox'), { target: { value: body } }); fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); }
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState({}, '', '/requests/example');
  advanceAuthSessionOwner(); useAuthStore.setState({ user, token: 'token', isAuthenticated: true });
  mocks.selector.mockResolvedValue(selector()); mocks.history.mockImplementation((_request, response) => Promise.resolve(history(response)));
  mocks.send.mockImplementation((_request, command) => Promise.resolve(result(command)));
});
afterEach(cleanup);
describe('private request conversation', () => {
  it.each(['principal', 'owner', 'signout'])('quarantines a private history read after %s changes', async kind => {
    const slow = deferred<ReturnType<typeof history>>(); mocks.history.mockReturnValueOnce(slow.promise);
    await mount(); fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } }); await waitFor(() => expect(mocks.history).toHaveBeenCalledOnce());
    await act(async () => {
      if (kind === 'principal') useAuthStore.setState({ user: { ...user, id: 'other' } });
      else if (kind === 'owner') advanceAuthSessionOwner();
      else useAuthStore.setState({ token: null, isAuthenticated: false });
    });
    await act(async () => slow.resolve(history('one', { items: [{ id: 'late', role: 'seller', content: 'Old private history' }] })));
    expect(screen.queryByText('Old private history')).toBeNull();
  });
  it('keeps a pending private read through token rotation for the same owner', async () => {
    const slow = deferred<ReturnType<typeof history>>(); mocks.history.mockReturnValueOnce(slow.promise);
    await mount(); fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } });
    await act(async () => useAuthStore.setState({ token: 'fresh' }));
    await act(async () => slow.resolve(history('one', { items: [{ request_id: 'request', response_id: 'one', id: 'safe', role: 'seller', content: 'Current safe history' }] })));
    expect(screen.getByText('Current safe history')).not.toBeNull(); expect(mocks.history).toHaveBeenCalledOnce();
  });
  it('quarantines a result check after switching to another thread', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Unknown')); const slow = deferred<RequestCommandResult>(); mocks.check.mockReturnValueOnce(slow.promise);
    await mount(); await select(); write(); await screen.findByText(/We could not confirm/); const original = mocks.send.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'Check message result' })); await select('two');
    await act(async () => slow.resolve(result(original))); expect(screen.queryByText('Approved safe text')).toBeNull();
    await select('one'); expect(screen.queryByText(/Message sent/)).toBeNull(); expect(screen.getByRole('textbox')).toHaveProperty('value', original.content);
  });
  it.each(['switch', 'close'])('blocks the actual mutation admission when a pending send is still refreshing and the thread changes: %s', async action => {
    const slow = deferred<RequestCommandResult>(); let admit!: () => void;
    mocks.send.mockImplementationOnce((_r, _c, assertAdmission) => { admit = assertAdmission; return slow.promise; });
    const view = await mount(); await select(); write();
    if (action === 'switch') await select('two'); else view.rerender(<RequestConversation requestId="request" requestStatus="closed" />);
    expect(() => admit()).toThrow('Conversation changed');
    await act(async () => slow.reject(new Error('Not admitted'))); expect(screen.queryByText(/Message sent/)).toBeNull();
  });

  it('requires buyer selection, reads exact response, renders only safe inert text and sends that thread', async () => {
    await mount(); expect(mocks.history).not.toHaveBeenCalled();
    await select(); expect(mocks.history).toHaveBeenCalledWith('request', 'one');
    mocks.send.mockImplementation((_r, c) => Promise.resolve(result(c, 'sent', { message: { request_id: 'request', response_id: c.response_id, id: 'safe', role: 'seller', content: '<img src=x onerror=alert(1)> **plain**' }, internal_reason: 'SECRET' })));
    write(); await screen.findByText(/Message sent/);
    expect(screen.getByText('<img src=x onerror=alert(1)> **plain**')).not.toBeNull(); expect(document.querySelector('img')).toBeNull(); expect(screen.queryByText('SECRET')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
    expect(mocks.send.mock.calls[0][1]).toEqual({ response_id: 'one', content: 'Private original draft', client_message_nonce: expect.any(String) });
  });
  it('discovers only the responding seller’s own thread without a buyer response list', async () => {
    useAuthStore.setState({ user: { ...user, id: 'seller', role: 'seller' } });
    mocks.selector.mockResolvedValue(selector({ side: 'seller', threads: [{ response_id: 'own', can_send: true }] }));
    render(<RequestConversation requestId="request" requestStatus="open" />);
    await screen.findByText('No messages in this conversation.'); expect(screen.queryByRole('combobox')).toBeNull(); expect(mocks.history).toHaveBeenCalledExactlyOnceWith('request', 'own');
    write(); await screen.findByText(/Message sent/); expect(mocks.send.mock.calls[0][1].response_id).toBe('own');
  });
  it('quarantines a read completing after a thread switch, even on return to the original thread', async () => {
    const slow = deferred<ReturnType<typeof history>>(); mocks.history.mockReturnValueOnce(slow.promise);
    await mount(); fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } });
    await waitFor(() => expect(mocks.history).toHaveBeenCalled()); await select('two'); await select('one');
    await act(async () => slow.resolve(history('one', { items: [{ id: 'old', role: 'seller', content: 'Retired history' }] })));
    expect(screen.queryByText('Retired history')).toBeNull();
  });
  it.each(['principal', 'signout', 'owner'])('clears all private state and quarantines pending send on %s change', async kind => {
    const slow = deferred<RequestCommandResult>(); mocks.send.mockReturnValueOnce(slow.promise);
    await mount(); await select(); write(); const command = mocks.send.mock.calls[0][1];
    await act(async () => {
      if (kind === 'principal') useAuthStore.setState({ user: { ...user, id: 'other' } });
      else if (kind === 'signout') useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
      else advanceAuthSessionOwner();
    });
    await act(async () => slow.resolve(result(command)));
    expect(screen.queryByText('Approved safe text')).toBeNull(); expect(screen.queryByText(/Message sent/)).toBeNull();
    expect(screen.queryByDisplayValue('Private original draft')).toBeNull();
  });
  it('preserves the same command and original text after uncertainty and token rotation; no automatic replay', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Lost response'));
    await mount(); await select(); write(); await screen.findByText(/We could not confirm/);
    const original = mocks.send.mock.calls[0][1];
    await act(async () => useAuthStore.setState({ token: 'rotated' }));
    expect(mocks.send).toHaveBeenCalledTimes(1); expect(screen.getByRole('textbox')).toHaveProperty('readOnly', true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same message' })); await screen.findByText(/Message sent/);
    expect(mocks.send.mock.calls[1][1]).toEqual(original);
  });
  it('keeps an uncertain command tied to its thread while a late send completes elsewhere', async () => {
    const slow = deferred<RequestCommandResult>(); mocks.send.mockReturnValueOnce(slow.promise);
    await mount(); await select(); write(); const original = mocks.send.mock.calls[0][1]; await select('two');
    await act(async () => slow.resolve(result(original))); expect(screen.queryByText('Approved safe text')).toBeNull();
    await select('one'); expect(screen.getByRole('textbox')).toHaveProperty('value', original.content);
    mocks.check.mockResolvedValue(result(original));
    fireEvent.click(screen.getByRole('button', { name: 'Check message result' }));
    await screen.findByText(/Message sent/); expect(mocks.check).toHaveBeenCalledExactlyOnceWith('request', original);
  });
  it.each(['response_id', 'client_message_nonce', 'request_id', 'command_digest'])('quarantines wrong %s result and retains an explicit same-command retry', async field => {
    mocks.send.mockImplementation((_r, c) => Promise.resolve(result(c, 'processing_failed')));
    await mount(); await select(); write(); await screen.findByText(/message check is unavailable/);
    mocks.check.mockImplementation((_r, c) => Promise.resolve(result(c, 'sent', { [field]: field === 'command_digest' ? 'b'.repeat(64) : 'wrong' })));
    fireEvent.click(screen.getByRole('button', { name: 'Check message result' }));
    await screen.findByText(/We could not confirm/); expect(screen.queryByText('Approved safe text')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Private original draft');
  });
  it.each(['held', 'clarification_requested', 'refused', 'unusable'])('shows completed %s nondelivery, drops the original and allows a distinct new command', async state => {
    mocks.send.mockImplementation((_r, c) => Promise.resolve(result(c, state)));
    await mount(); await select(); write('First original'); await screen.findByText(/^Message not sent/);
    expect(screen.getByRole('textbox')).toHaveProperty('value', ''); expect(screen.queryByText('Approved safe text')).toBeNull();
    write('Second original'); await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    expect(mocks.send.mock.calls[1][1].client_message_nonce).not.toBe(mocks.send.mock.calls[0][1].client_message_nonce);
  });
  it.each(['processing', 'processing_failed', 'unknown'])('keeps %s separate from sent and retains local draft only', async state => {
    mocks.send.mockImplementation((_r, c) => Promise.resolve(result(c, state)));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await mount(); await select(); write(); await screen.findByRole('button', { name: 'Check message result' });
    expect(screen.queryByText(/Message sent/)).toBeNull(); expect(screen.getByRole('textbox')).toHaveProperty('value', 'Private original draft'); expect(storage).not.toHaveBeenCalled();
  });
  it('handles digest conflict without changing payload or claiming delivery', async () => {
    mocks.send.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'SECRET' } } });
    await mount(); await select(); write(); await screen.findByText(/service refused this attempt/);
    expect(screen.queryByText('SECRET')).toBeNull(); expect(screen.queryByText(/Message sent/)).toBeNull();
    expect(screen.getByRole('textbox')).toHaveProperty('readOnly', true);
  });
  it.each(['closed', 'expired', 'fulfilled'])('refuses new sends and uncertain retries when request becomes %s', async state => {
    mocks.send.mockRejectedValueOnce(new Error('Lost'));
    const view = await mount(); await select(); write(); await screen.findByText(/We could not confirm/);
    view.rerender(<RequestConversation requestId="request" requestStatus={state} />);
    expect(screen.getByRole('button', { name: 'Retry same message' })).toHaveProperty('disabled', true); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('keeps an authorized in-app conversation usable while email is proof-blocked, with internal metadata excluded', async () => {
    mocks.selector.mockResolvedValue(selector({ email_state: 'proof_blocked', watch_id: 'SECRET WATCH', moderation_reason: 'SECRET REASON' }));
    await mount(); await select(); write(); await screen.findByText(/Message sent/);
    expect(screen.queryByText(/SECRET/)).toBeNull(); expect(document.activeElement?.textContent).toMatch(/Message sent/);
  });
  it('allows matched active requests when the server authorizes messages, independent of publication', async () => {
    await mount('matched'); await select(); write(); await screen.findByText(/Message sent/);
  });
  it('honors server refusal for an apparently active request', async () => {
    mocks.history.mockResolvedValue(history('one', { can_send: false })); await mount('open'); await select();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft retained' } });
    expect(screen.getByRole('button', { name: 'Send private message' })).toHaveProperty('disabled', true); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('reauthorizes an exact deep link and does not fall back after denial', async () => {
    window.history.replaceState({}, '', '/requests/example?response_id=denied'); mocks.selector.mockRejectedValue(new Error('Private denial'));
    render(<RequestConversation requestId="request" requestStatus="open" />); await screen.findByText('Private conversations are currently unavailable.');
    expect(mocks.selector).toHaveBeenCalledWith('request', 'denied'); expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('selects an authorized exact deep link with no extra authentication step', async () => {
    window.history.replaceState({}, '', '/requests/example?response_id=two'); mocks.selector.mockResolvedValue(selector({ threads: [{ response_id: 'two', can_send: true }] }));
    render(<RequestConversation requestId="request" requestStatus="matched" />); await screen.findByText('No messages in this conversation.');
    expect(mocks.history).toHaveBeenCalledExactlyOnceWith('request', 'two'); expect(screen.queryByText(/sign in|code/i)).toBeNull();
  });
  it.each(['off', 'unavailable', 'unknown'])('truthfully disables new messages for %s while leaving authorized reads available', async availability => {
    mocks.selector.mockResolvedValue(selector({ availability })); await mount(); await select();
    expect(screen.getByText('Sending private messages is currently unavailable.')).not.toBeNull(); write(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['?response_id=', '?response_id=one&response_id=two'])('rejects ambiguous or empty deep links %s before reading any thread', async search => {
    window.history.replaceState({}, '', '/requests/example' + search); render(<RequestConversation requestId="request" requestStatus="open" />);
    await screen.findByText('Private conversations are currently unavailable.'); expect(mocks.selector).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
  });
  it('does no conversation work for an anonymous visit', async () => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false }); render(<RequestConversation requestId="request" requestStatus="open" />);
    expect(mocks.selector).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('preserves outage drafts after 429 without raw error text or generic relay', async () => {
    mocks.send.mockRejectedValueOnce({ response: { status: 429, data: { detail: 'Private reason' } } });
    await mount(); await select(); write(); await screen.findByText(/Too many attempts/);
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Private original draft'); expect(document.querySelector('a')).toBeNull(); expect(screen.queryByText(/Private reason|allAI|email support/)).toBeNull();
  });
});

it.each([{ state: ['sent'], message: null }, { message: null }, { state: null }, { state: 1 }, { contract: 'wrong' }, { command_digest: ['a'.repeat(64)] }, { event_id: null }, { message: { request_id: 'request', response_id: 'one', id: 'safe', role: ['buyer'], content: 'Forged' } }])('rejects malformed alternative transport success %# and preserves the command', async fields => {
  mocks.send.mockImplementation((_r, c) => Promise.resolve(result(c, 'sent', fields)));
  await mount(); await select(); write(); await screen.findByText(/We could not confirm/);
  expect(screen.queryByText(/Message sent/)).toBeNull(); expect(screen.getByRole('textbox')).toHaveProperty('value', 'Private original draft');
});
it.each(['send', 'retry'])('retains live %s ownership across departure and return until settlement, then explicitly reconciles', async mode => {
  const slow = deferred<RequestCommandResult>();
  if (mode === 'retry') mocks.send.mockImplementationOnce((_r, c) => Promise.resolve(result(c, 'processing_failed')));
  mocks.send.mockReturnValueOnce(slow.promise);
  await mount(); await select(); write();
  if (mode === 'retry') { await screen.findByText(/message check is unavailable/); fireEvent.click(screen.getByRole('button', { name: 'Retry same message' })); }
  const command = mocks.send.mock.calls.at(-1)![1];
  await select('two'); await select('one');
  expect(screen.getByText('Checking message… Delivery is not confirmed.')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Check message result' })).toHaveProperty('disabled', true);
  expect(screen.queryByText(/Your message was not sent/)).toBeNull();
  await act(async () => slow.resolve(result(command)));
  await screen.findByText(/We could not confirm/);
  expect(screen.queryByText(/Message sent/)).toBeNull();
  mocks.check.mockResolvedValue(result(command)); fireEvent.click(screen.getByRole('button', { name: 'Check message result' }));
  await screen.findByText(/Message sent/); expect(mocks.send).toHaveBeenCalledTimes(mode === 'retry' ? 2 : 1);
  expect(mocks.check).toHaveBeenCalledWith('request', command);
});
it('does not restore stale nondelivery when a retry settles on another thread', async () => {
  mocks.send.mockImplementationOnce((_r, c) => Promise.resolve(result(c, 'processing_failed')));
  const slow = deferred<RequestCommandResult>(); mocks.send.mockReturnValueOnce(slow.promise);
  await mount(); await select(); write(); await screen.findByText(/message check is unavailable/);
  const original = mocks.send.mock.calls[0][1]; fireEvent.click(screen.getByRole('button', { name: 'Retry same message' }));
  await select('two'); await act(async () => slow.resolve(result(original))); await select('one');
  expect(screen.queryByText(/Your message was not sent/)).toBeNull(); expect(screen.getByText(/We could not confirm/)).not.toBeNull();
  expect(mocks.send.mock.calls[1][1]).toEqual(original);
});
it.each(['off', 'thread', 'history'])('rechecks current %s denial after deferred admission and refresh with zero dispatch', async kind => {
  const slow = deferred<RequestCommandResult>(); let admit!: () => void; const dispatch = vi.fn();
  mocks.send.mockImplementationOnce((_r, _c, admission) => { admit = admission; return slow.promise; });
  mocks.selector.mockResolvedValue(selector({ side: 'seller', threads: [{ response_id: 'one', can_send: true }] }));
  render(<RequestConversation requestId="request" requestStatus="open" />);
  await screen.findByText('No messages in this conversation.'); write();
  if (kind === 'off') mocks.selector.mockResolvedValue(selector({ side: 'seller', availability: 'off', threads: [{ response_id: 'one', can_send: true }] }));
  if (kind === 'thread') mocks.selector.mockResolvedValue(selector({ side: 'seller', threads: [{ response_id: 'one', can_send: false }] }));
  if (kind === 'history') mocks.history.mockResolvedValue(history('one', { can_send: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  await waitFor(() => expect(mocks.history.mock.calls.length).toBeGreaterThan(1));
  await screen.findByText('No messages in this conversation.');
  try { admit(); dispatch(); } catch { /* exact pre-POST gate refused */ }
  expect(dispatch).not.toHaveBeenCalled(); await act(async () => slow.reject(new Error('Refused')));
});
it('preserves authorized selection and unsent draft through refresh and response arrival', async () => {
  const view = await mount(); await select(); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Long unsent draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  await waitFor(() => expect(mocks.selector).toHaveBeenCalledTimes(2)); await screen.findByText('No messages in this conversation.');
  expect(screen.getByRole('combobox')).toHaveProperty('value', 'one'); expect(screen.getByRole('textbox')).toHaveProperty('value', 'Long unsent draft');
  view.rerender(<RequestConversation requestId="request" requestStatus="open" quoteRevision={2} />);
  await waitFor(() => expect(mocks.selector).toHaveBeenCalledTimes(3));
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Long unsent draft');
});
it('returns settled processing to unknown on a later visit without replay', async () => {
  mocks.send.mockImplementationOnce((_r, c) => Promise.resolve(result(c, 'processing')));
  await mount(); await select(); write(); await screen.findByText(/still being checked/);
  await select('two'); await select('one'); expect(screen.getByText(/We could not confirm/)).not.toBeNull(); expect(mocks.send).toHaveBeenCalledOnce();
});
it.each(['request_inactive', 'nonce_digest_conflict', 'SECRET'])('uses neutral refusal for 409 %s', async detail => {
  mocks.send.mockRejectedValueOnce({ response: { status: 409, data: { detail } } });
  await mount(); await select(); write(); await screen.findByText(/service refused this attempt/); expect(screen.queryByText(/differs|SECRET/)).toBeNull();
});
it('allows explicit check after an authorized read refresh without reselection', async () => {
  mocks.send.mockRejectedValueOnce({ response: { status: 403 } });
  await mount(); await select(); write(); await screen.findByText(/This conversation is unavailable/);
  expect(screen.getByRole('button', { name: 'Check message result' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' })); await screen.findByText('No messages in this conversation.');
  const command = mocks.send.mock.calls[0][1]; mocks.check.mockResolvedValue(result(command));
  fireEvent.click(screen.getByRole('button', { name: 'Check message result' })); await screen.findByText(/Message sent/);
});

// C4 advisory followthrough: real user selection and lookup semantics.
it.each(['refresh', 'quotes'])('keeps manual selection and its draft after a deep link then %s', async trigger => {
  window.history.replaceState({}, '', '/requests/example?response_id=one&keep=yes');
  const view = await mount(); await screen.findByText('No messages in this conversation.');
  await select('two'); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsent second draft' } });
  if (trigger === 'refresh') fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  else view.rerender(<RequestConversation requestId="request" requestStatus="open" quoteRevision={3} />);
  await waitFor(() => expect(mocks.selector).toHaveBeenCalledTimes(2)); await screen.findByText('No messages in this conversation.');
  expect(screen.getByRole('combobox')).toHaveProperty('value', 'two');
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Unsent second draft'); expect(mocks.send).not.toHaveBeenCalled();
  expect(new URLSearchParams(window.location.search).get('response_id')).toBe('two');
  expect(new URLSearchParams(window.location.search).get('keep')).toBe('yes');

});
it('does not read or send an unlisted deep link or silently choose another thread', async () => {
  window.history.replaceState({}, '', '/requests/example?response_id=missing');
  await mount(); await waitFor(() => expect(mocks.selector).toHaveBeenCalledWith('request', 'missing'));
  expect(screen.getByRole('combobox')).toHaveProperty('value', ''); expect(mocks.history).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull(); expect(mocks.send).not.toHaveBeenCalled();
});
it.each([403, 404])('keeps initial %s absence quiet throughout deferred reauthorization', async status => {
  mocks.selector.mockRejectedValueOnce({ response: { status } }); const view = render(<RequestConversation requestId="request" requestStatus="open" />);
  await waitFor(() => expect(screen.queryByText('Private conversation')).toBeNull());
  const slow = deferred<ReturnType<typeof selector>>(); mocks.selector.mockReturnValueOnce(slow.promise);
  view.rerender(<RequestConversation requestId="request" requestStatus="open" quoteRevision={1} />);
  await waitFor(() => expect(mocks.selector).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Private conversation')).toBeNull(); expect(screen.queryByText('Loading conversations…')).toBeNull();
  await act(async () => slow.resolve(selector())); await screen.findByRole('combobox');
});
it.each(['command_not_found', 'thread_unavailable', undefined])('scopes lookup 404 %s without inventing nondelivery', async detail => {
  mocks.send.mockRejectedValueOnce(new Error('Lost response'));
  await mount(); await select(); write(); await screen.findByText(/We could not confirm/);
  mocks.check.mockRejectedValueOnce({ response: { status: 404, data: { detail } } });
  fireEvent.click(screen.getByRole('button', { name: 'Check message result' }));
  if (detail === 'command_not_found') {
    await screen.findByText(/No record of this attempt/); expect(screen.getByText('No messages in this conversation.')).not.toBeNull();
    expect(screen.queryByText(/This conversation is unavailable/)).toBeNull();
  } else await screen.findByText(/This conversation is unavailable/);
  expect(screen.queryByText(/^Message not sent/)).toBeNull(); expect(screen.getByRole('textbox')).toHaveProperty('value', 'Private original draft');
  expect(mocks.send).toHaveBeenCalledOnce();
});

it.each(['refresh', 'quotes'])('retains an unrelated selected draft and live command memory through %s after deep-link navigation', async trigger => {
  window.history.replaceState({}, '', '/requests/example?response_id=one');
  const slow = deferred<RequestCommandResult>(); mocks.send.mockReturnValueOnce(slow.promise);
  const view = await mount(); await screen.findByText('No messages in this conversation.'); write('Pending first command');
  const original = mocks.send.mock.calls[0][1]; await select('two');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsent unrelated draft' } });
  if (trigger === 'refresh') fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  else view.rerender(<RequestConversation requestId="request" requestStatus="open" quoteRevision={2} />);
  await waitFor(() => expect(mocks.selector).toHaveBeenCalledTimes(2)); await screen.findByText('No messages in this conversation.');
  expect(screen.getByRole('combobox')).toHaveProperty('value', 'two'); expect(screen.getByRole('textbox')).toHaveProperty('value', 'Unsent unrelated draft');
  await act(async () => slow.resolve(result(original)));
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Unsent unrelated draft'); expect(screen.queryByText(/Message sent/)).toBeNull();
  await act(async () => { window.history.replaceState({}, '', '?response_id=one'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await screen.findByText(/We could not confirm/); await screen.findByText('No messages in this conversation.');
  expect(screen.getByRole('textbox')).toHaveProperty('value', original.content);
  expect(mocks.selector).toHaveBeenLastCalledWith('request', 'one');
  mocks.check.mockResolvedValueOnce(result(original)); fireEvent.click(screen.getByRole('button', { name: 'Check message result' }));
  await screen.findByText(/Message sent/); expect(mocks.send).toHaveBeenCalledOnce(); expect(mocks.check).toHaveBeenCalledWith('request', original);
});
