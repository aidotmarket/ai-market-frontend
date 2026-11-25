// @vitest-environment jsdom
import "@/tests/support-network-trap";
import "@/tests/fixtures/request-thread-network-guard";
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import DataRequestDetailClient from './DataRequestDetailClient';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import type { DataRequestDetail, User } from '@/types';
const mocks = vi.hoisted(() => ({ get: vi.fn(), responses: vi.fn(), selector: vi.fn(), history: vi.fn(), send: vi.fn(), quote: vi.fn(), suppressOwnerNotification: false }));
vi.mock('@/api/data-requests', async () => ({
  ...await vi.importActual<typeof import('@/api/data-requests')>('@/api/data-requests'), getDataRequest: mocks.get, getDataRequestResponses: mocks.responses, getRequestThreadSelector: mocks.selector, getRequestThreadMessages: mocks.history, sendRequestThreadMessage: mocks.send, reconcileRequestThreadMessage: vi.fn(), submitDataRequestResponse: mocks.quote, updateDataRequest: vi.fn(), publishDataRequest: vi.fn(), deleteDataRequest: vi.fn(), confirmDataRequestPublication: vi.fn(), withdrawDataRequestPublication: vi.fn() }));
vi.mock('@/lib/auth-session-owner', async original => {
  const actual = await original<typeof import('@/lib/auth-session-owner')>();
  return { ...actual, subscribeAuthSessionOwner: (listener: () => void) => actual.subscribeAuthSessionOwner(() => { if (!mocks.suppressOwnerNotification) listener(); }) };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => {
    const search = React.useSyncExternalStore(listener => {
      window.addEventListener('popstate', listener);
      return () => window.removeEventListener('popstate', listener);
    }, () => window.location.search);
    return new URLSearchParams(search);
  },
}));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const request = { id: 'request', slug: 'example', buyer_id: 'buyer', title: 'Buyer data request', description: 'Public safe request description', status: 'open', urgency: 'normal', categories: [], format_preferences: [], currency: 'USD', created_at: '2026-11-07T00:00:00Z', response_count: 1, provenance_requirements: null, published_at: null, price_range_min: null, price_range_max: null, updated_at: null, buyer_display_name: 'Buyer' } satisfies DataRequestDetail;
const response = { id: 'response', request_id: 'request', proposal: 'An existing nonbinding quote', status: 'submitted', created_at: '2026-11-07T00:00:00Z' };
const history = { contract: 'request-thread-v1', request_id: 'request', response_id: 'response', can_send: true, items: [], next_cursor: null };
beforeEach(() => {
  vi.clearAllMocks(); mocks.suppressOwnerNotification = false; window.history.replaceState({}, '', '/requests/example'); advanceAuthSessionOwner();
  useAuthStore.setState({ user: { id: 'buyer', role: 'buyer' } as User, token: 'synthetic', isAuthenticated: true });
  mocks.get.mockResolvedValue(request); mocks.responses.mockResolvedValue([response]);
  mocks.selector.mockResolvedValue({ contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: [{ response_id: 'response', can_send: true }] });
  mocks.history.mockResolvedValue(history); mocks.send.mockImplementation((_r, c) => Promise.resolve({ contract: 'request-thread-v1', request_id: 'request', response_id: c.response_id, client_message_nonce: c.client_message_nonce, command_digest: 'a'.repeat(64), event_id: 'event', state: 'sent', message: { request_id: 'request', response_id: c.response_id, id: 'safe', role: 'seller', content: 'Approved private message' } }));
});
afterEach(cleanup);
it('makes the bilateral conversation reachable from the real page while preserving the buyer quote list', async () => {
  render(<DataRequestDetailClient slug="example" initialRequest={request} />);
  expect(await screen.findByText(response.proposal)).not.toBeNull();
  expect(screen.getByRole('link', { name: 'Open private conversation for this response' }).getAttribute('href')).toBe('?response_id=response#private-conversation-heading');
  expect(await screen.findByText('Choose a response to read its private conversation history.')).not.toBeNull();
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'response' } });
  await screen.findByText('No messages in this conversation.'); fireEvent.change(screen.getByLabelText('Private message for selected response'), { target: { value: 'Private buyer message' } });
  expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Private conversation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await screen.findByText('Approved private message');
  expect(mocks.send.mock.calls[0][1].response_id).toBe('response'); expect(screen.getByText(response.proposal)).not.toBeNull(); expect(mocks.quote).not.toHaveBeenCalled();
});
it('provides seller discovery and messaging on the page after an existing quote, including authorized matched state', async () => {
  const matched = { ...request, status: 'matched' } as DataRequestDetail; mocks.get.mockResolvedValue(matched);
  useAuthStore.setState({ user: { id: 'seller', role: 'seller' } as User });
  mocks.selector.mockResolvedValue({ contract: 'request-thread-v1', request_id: 'request', side: 'seller', availability: 'enabled', threads: [{ response_id: 'response', can_send: true }] });
  mocks.history.mockResolvedValue({ ...history, items: [{ request_id: 'request', response_id: 'response', id: 'prior', role: 'buyer', content: 'Earlier approved message' }] });
  let resolveQuotes!: (value: typeof response[]) => void;
  mocks.responses.mockReturnValue(new Promise<typeof response[]>(resolve => { resolveQuotes = resolve; }));
  render(<DataRequestDetailClient slug="example" initialRequest={matched} />);
  const messages = within(await screen.findByRole('list', { name: 'Private messages' }));
  expect(messages.getByText('Earlier approved message')).not.toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.change(screen.getByLabelText('Private message for selected response'), { target: { value: 'Private seller reply' } });
  expect(screen.getByRole('button', { name: 'Send private message' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' }));
  await messages.findByText('Approved private message');

  await act(async () => { resolveQuotes([response]); });
  expect(await screen.findByText(response.proposal)).not.toBeNull();
  const currentMessages = within(screen.getByRole('list', { name: 'Private messages' }));
  expect(currentMessages.getAllByText('Earlier approved message')).toHaveLength(1);
  expect(currentMessages.getAllByText('Approved private message')).toHaveLength(1);
  expect(mocks.history).toHaveBeenCalledWith('request', 'response'); expect(mocks.quote).not.toHaveBeenCalled();
});

it('restores the seller conversation when checking saved quotes recovers an uncertain submission', async () => {
  const initialRequest = { ...request, response_count: 0 };
  useAuthStore.setState({ user: { id: 'seller', role: 'seller' } as User });
  mocks.get.mockResolvedValueOnce(initialRequest);
  mocks.responses.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Reconciliation read failed'));
  mocks.quote.mockRejectedValueOnce(new Error('Lost quote POST result'));
  mocks.selector.mockRejectedValueOnce({ response: { status: 403 } }).mockResolvedValue({
    contract: 'request-thread-v1', request_id: 'request', side: 'seller', availability: 'enabled',
    threads: [{ response_id: 'response', can_send: true }],
  });
  const message = 'Approved message in the recovered conversation';
  mocks.history.mockResolvedValue({ ...history, items: [{ request_id: 'request', response_id: 'response', id: 'prior', role: 'buyer', content: message }] });

  await act(async () => { render(<DataRequestDetailClient slug="example" initialRequest={initialRequest} />); });
  expect(screen.queryByRole('heading', { name: 'Private conversation' })).toBeNull();
  expect(mocks.selector).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByRole('textbox', { name: 'Proposal' }), { target: { value: response.proposal } });
  const submit = screen.getByRole('button', { name: 'Submit Response' });
  fireEvent.click(submit);
  const check = await screen.findByRole('button', { name: 'Check saved quotes' });
  await waitFor(() => expect(submit).toHaveProperty('disabled', false));
  expect(mocks.responses).toHaveBeenCalledTimes(2);
  expect(mocks.history).not.toHaveBeenCalled();

  fireEvent.click(check);

  expect(await screen.findByText(response.proposal)).not.toBeNull();
  expect(within(await screen.findByRole('list', { name: 'Private messages' })).getByText(message)).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Check saved quotes' })).toBeNull();
  expect(mocks.quote).toHaveBeenCalledOnce();
});

it('keeps the existing page and quote independent when C4 routes are absent', async () => {
  mocks.selector.mockRejectedValue({ response: { status: 404 } });
  render(<DataRequestDetailClient slug="example" initialRequest={request} />);
  await waitFor(() => expect(mocks.selector).toHaveBeenCalled()); expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByRole('heading', { name: request.title })).not.toBeNull();
  expect(await screen.findByText(response.proposal)).not.toBeNull(); expect(mocks.send).not.toHaveBeenCalled();
});
it('retires the surrounding page’s owner-only response read on same-principal owner supersession', async () => {
  let resolve!: (value: typeof response[]) => void;
  const pending = new Promise<typeof response[]>(yes => { resolve = yes; }); mocks.responses.mockReturnValueOnce(pending).mockResolvedValue([]);
  render(<DataRequestDetailClient slug="example" initialRequest={request} />); await waitFor(() => expect(mocks.responses).toHaveBeenCalled());
  await act(async () => { advanceAuthSessionOwner(); });
  await act(async () => resolve([{ ...response, proposal: 'Retired owner-only quote' }]));
  expect(screen.queryByText('Retired owner-only quote')).toBeNull(); await screen.findByRole('heading', { name: request.title });
});

it.each([403, 404, 500])('keeps the pre-quote seller public page usable for selector %s with appropriate alert semantics', async status => {
  useAuthStore.setState({ user: { id: 'seller', role: 'seller' } as User }); mocks.responses.mockResolvedValue([]);
  mocks.selector.mockRejectedValue({ response: { status } });
  render(<DataRequestDetailClient slug="example" initialRequest={request} />);
  await screen.findByRole('button', { name: 'Submit Response' }); await act(async () => { await Promise.resolve(); });
  expect(screen.queryByRole('alert') !== null).toBe(status === 500); expect(screen.getByRole('textbox', { name: 'Proposal' })).not.toBeNull();
});

it('checks current owner before applying a quote mutation even before subscriber presentation catches up', async () => {
  useAuthStore.setState({ user: { id: 'seller', role: 'seller' } as User }); mocks.responses.mockResolvedValue([]);
  let resolve!: (value: typeof response) => void; mocks.quote.mockReturnValueOnce(new Promise<typeof response>(yes => { resolve = yes; }));
  render(<DataRequestDetailClient slug="example" initialRequest={request} />);
  await screen.findByRole('button', { name: 'Submit Response' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Proposal' }), { target: { value: 'Current draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Response' })); expect(mocks.quote).toHaveBeenCalledOnce();
  mocks.suppressOwnerNotification = true;
  await act(async () => { advanceAuthSessionOwner(); resolve({ ...response, proposal: 'Retired mutation quote' }); });
  expect(screen.queryByText('Retired mutation quote')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Proposal' })).toHaveProperty('value', 'Current draft');
});
it('quote-card navigation and back/forward reauthorize exact threads without losing pending command memory', async () => {
  const second = { ...response, id: 'second', proposal: 'Second quote' }; mocks.responses.mockResolvedValue([response, second]);
  mocks.selector.mockImplementation((_request, linked) => Promise.resolve({ contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: (linked ? [linked] : ['response', 'second']).map(response_id => ({ response_id, can_send: true })) }));
  mocks.history.mockImplementation((_r, response_id) => Promise.resolve({ ...history, response_id }));
  mocks.send.mockRejectedValueOnce(new Error('Uncertain'));
  render(<DataRequestDetailClient slug="example" initialRequest={request} />); await screen.findByText(second.proposal);
  expect(fireEvent.click(screen.getAllByRole('link', { name: 'Open private conversation for this response' })[0])).toBe(false);
  await screen.findByText('No messages in this conversation.'); expect(window.location.search).toBe('?response_id=response');
  fireEvent.change(screen.getByLabelText('Private message for selected response'), { target: { value: 'Pending private exact input' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await screen.findByText(/We could not confirm/);
  const original = mocks.send.mock.calls[0][1];
  fireEvent.click(screen.getAllByRole('link', { name: 'Open private conversation for this response' })[1]);
  await waitFor(() => expect(mocks.history).toHaveBeenLastCalledWith('request', 'second'));
  expect(screen.getByLabelText('Private message for selected response')).toHaveProperty('value', '');
  window.history.back();
  await screen.findByText(/We could not confirm/);
  expect(window.location.hash).toBe('#private-conversation-heading');
  expect(screen.getByLabelText('Private message for selected response')).toHaveProperty('value', original.content);
  expect(mocks.selector).toHaveBeenLastCalledWith('request', 'response'); expect(mocks.send).toHaveBeenCalledOnce();
  expect(window.location.search).not.toContain(original.content); expect(window.location.search).not.toContain(original.client_message_nonce);
  expect(screen.getByText(/Leaving or reloading this page/)).not.toBeNull();
  window.history.forward();
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('value', 'second'));
  expect(window.location.search).toBe('?response_id=second');
  mocks.selector.mockRejectedValueOnce({ response: { status: 403 } });
  await act(async () => { window.history.replaceState(null, '', '?response_id=denied'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await waitFor(() => expect(screen.queryByLabelText('Private message for selected response')).toBeNull());
  expect(mocks.history).not.toHaveBeenCalledWith('request', 'denied'); expect(mocks.send).toHaveBeenCalledOnce();
});

it.each([403, 404])('focuses a valid quote history after landing on a response denied with %s', async status => {
  window.history.replaceState({}, '', '?response_id=denied');
  const selector = { contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: [{ response_id: 'response', can_send: true }] };
  let resolveSelector!: (value: typeof selector) => void;
  mocks.selector.mockRejectedValueOnce({ response: { status } })
    .mockReturnValueOnce(new Promise<typeof selector>(resolve => { resolveSelector = resolve; }));
  const message = 'Approved history for the valid response';
  mocks.history.mockResolvedValue({ ...history, items: [{ request_id: 'request', response_id: 'response', id: 'prior', role: 'seller', content: message }] });
  const scroll = vi.fn();
  const restoreScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  try {
    render(<DataRequestDetailClient slug="example" initialRequest={request} />);
    const link = await screen.findByRole('link', { name: 'Open private conversation for this response' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Private conversation' })).toBeNull());
    expect(mocks.history).not.toHaveBeenCalled();
    link.focus();
    // Native keyboard activation of an anchor dispatches a click with detail 0.
    expect(fireEvent.click(link, { detail: 0 })).toBe(false);
    expect(document.activeElement).toBe(link);
    expect(scroll).not.toHaveBeenCalled();

    await act(async () => { resolveSelector(selector); });
    expect(within(await screen.findByRole('list', { name: 'Private messages' })).getByText(message)).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Private conversation' }));
    expect(scroll).toHaveBeenCalledOnce();
    expect(mocks.selector.mock.calls).toEqual([['request', 'denied'], ['request', 'response']]);
    expect(mocks.history).toHaveBeenCalledExactlyOnceWith('request', 'response');
  } finally {
    if (restoreScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', restoreScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});

it('keeps quote-card hrefs current across same-page history and native modified clicks', async () => {
  window.history.replaceState({}, '', '?view=first&view=second');
  render(<DataRequestDetailClient slug="example" initialRequest={request} />);
  const link = await screen.findByRole('link', { name: 'Open private conversation for this response' });
  expect(link.getAttribute('href')).toBe('?view=first&view=second&response_id=response#private-conversation-heading');

  window.history.pushState({}, '', '?view=third&view=fourth');
  window.history.back();
  await waitFor(() => expect(window.location.search).toBe('?view=first&view=second'));
  window.history.forward();
  await waitFor(() => expect(link.getAttribute('href')).toBe('?view=third&view=fourth&response_id=response#private-conversation-heading'));

  const observeClick = vi.fn((event: MouseEvent) => {
    const destination = event.defaultPrevented ? null : link.getAttribute('href');
    event.preventDefault();
    return destination;
  });
  window.addEventListener('click', observeClick, { once: true });
  fireEvent.click(link, { ctrlKey: true });
  expect(observeClick).toHaveReturnedWith('?view=third&view=fourth&response_id=response#private-conversation-heading');
  expect(window.location.search).toBe('?view=third&view=fourth');
  expect(mocks.history).not.toHaveBeenCalled();

  window.history.replaceState({}, '', '?view=fifth&view=sixth');
  fireEvent.click(link);
  await screen.findByText('No messages in this conversation.');
  expect(window.location.search).toBe('?view=fifth&view=sixth&response_id=response');
});

it('brings the buyer to readable private history on a closed request while preserving native modified clicks', async () => {
  const closed = { ...request, status: 'closed' } as const;
  const priorMessage = 'Approved message from before this request closed';
  const initialUrl = '/requests/example?page=3&category=retail&view=compact&view=quotes';
  window.history.replaceState({}, '', initialUrl);
  mocks.get.mockResolvedValue(closed);
  mocks.history.mockResolvedValue({ ...history, items: [{ request_id: 'request', response_id: 'response', id: 'prior', role: 'seller', content: priorMessage }] });
  render(<DataRequestDetailClient slug="example" initialRequest={closed} boardQuery="page=3&category=retail" />);
  const link = await screen.findByRole('link', { name: 'Open private conversation for this response' });
  const heading = screen.getByRole('heading', { name: 'Private conversation' });
  const scroll = vi.fn();
  Object.defineProperty(heading, 'scrollIntoView', { value: scroll });
  const destination = `${initialUrl}&response_id=response#private-conversation-heading`;
  expect(link.getAttribute('href')).toBe(destination.slice('/requests/example'.length));
  expect(await screen.findByText('This request is closed. New messages cannot be sent. You can still read existing history for available responses.')).not.toBeNull();

  const modifiedClicks = vi.fn((event: MouseEvent) => {
    const wasPrevented = event.defaultPrevented;
    event.preventDefault(); // Suppress navigation only after the React handler has run.
    return wasPrevented;
  });
  window.addEventListener('click', modifiedClicks);
  try {
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      fireEvent.click(link, modifier);
    }
  } finally {
    window.removeEventListener('click', modifiedClicks);
  }
  expect(modifiedClicks.mock.results.map(result => result.value)).toEqual([false, false, false, false, false]);
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(initialUrl);
  expect(scroll).not.toHaveBeenCalled();
  expect(mocks.selector).toHaveBeenCalledTimes(1);

  const entries = window.history.length;
  link.focus();
  expect(fireEvent.click(link, { detail: 0 })).toBe(false);
  expect(document.activeElement).toBe(heading);
  expect(scroll).toHaveBeenCalledOnce();
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(destination);
  expect(window.history.length).toBe(entries + 1);
  await screen.findByText(priorMessage);
  expect(document.activeElement).toBe(heading);
  expect(screen.getByRole('combobox')).toHaveProperty('value', 'response');
  expect(mocks.selector.mock.calls).toEqual([['request', undefined], ['request', 'response']]);
  expect(mocks.history).toHaveBeenCalledExactlyOnceWith('request', 'response');
  fireEvent.change(screen.getByRole('textbox', { name: 'Private message for selected response' }), { target: { value: 'Synthetic draft' } });
  expect(screen.getByRole('button', { name: 'Send private message' })).toHaveProperty('disabled', true);
  expect(mocks.send).not.toHaveBeenCalled();

  fireEvent.click(link);
  expect(window.history.length).toBe(entries + 1);
  expect(scroll).toHaveBeenCalledTimes(2);
  await screen.findByText(priorMessage);
});
