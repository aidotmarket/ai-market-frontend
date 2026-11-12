// @vitest-environment jsdom
import "@/tests/support-network-trap";
import "@/tests/fixtures/request-thread-network-guard";
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
  expect(screen.getByRole('link', { name: 'Open private conversation for this response' }).getAttribute('href')).toBe('?response_id=response');
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'response' } });
  await screen.findByText('No messages in this conversation.'); fireEvent.change(screen.getByLabelText('Private message for selected response'), { target: { value: 'Private buyer message' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await screen.findByText('Approved private message');
  expect(mocks.send.mock.calls[0][1].response_id).toBe('response'); expect(screen.getByText(response.proposal)).not.toBeNull(); expect(mocks.quote).not.toHaveBeenCalled();
});
it('provides seller discovery and messaging on the page after an existing quote, including authorized matched state', async () => {
  const matched = { ...request, status: 'matched' } as DataRequestDetail; mocks.get.mockResolvedValue(matched);
  useAuthStore.setState({ user: { id: 'seller', role: 'seller' } as User });
  mocks.selector.mockResolvedValue({ contract: 'request-thread-v1', request_id: 'request', side: 'seller', availability: 'enabled', threads: [{ response_id: 'response', can_send: true }] });
  render(<DataRequestDetailClient slug="example" initialRequest={matched} />);
  await screen.findByText('No messages in this conversation.'); expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.change(screen.getByLabelText('Private message for selected response'), { target: { value: 'Private seller reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' })); await screen.findByText('Approved private message');
  expect(mocks.history).toHaveBeenCalledWith('request', 'response'); expect(mocks.quote).not.toHaveBeenCalled();
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
  await act(async () => { window.history.replaceState(null, '', '?response_id=response'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await screen.findByText(/We could not confirm/);
  expect(screen.getByLabelText('Private message for selected response')).toHaveProperty('value', original.content);
  expect(mocks.selector).toHaveBeenLastCalledWith('request', 'response'); expect(mocks.send).toHaveBeenCalledOnce();
  expect(window.location.search).not.toContain(original.content); expect(window.location.search).not.toContain(original.client_message_nonce);
  expect(screen.getByText(/Leaving or reloading this page/)).not.toBeNull();
  mocks.selector.mockRejectedValueOnce({ response: { status: 403 } });
  await act(async () => { window.history.replaceState(null, '', '?response_id=denied'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await waitFor(() => expect(screen.queryByLabelText('Private message for selected response')).toBeNull());
  expect(mocks.history).not.toHaveBeenCalledWith('request', 'denied'); expect(mocks.send).toHaveBeenCalledOnce();
});
