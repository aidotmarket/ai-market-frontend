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
const mocks = vi.hoisted(() => ({ get: vi.fn(), responses: vi.fn(), selector: vi.fn(), history: vi.fn(), send: vi.fn(), quote: vi.fn() }));
vi.mock('@/api/data-requests', () => ({ getDataRequest: mocks.get, getDataRequestResponses: mocks.responses, getRequestThreadSelector: mocks.selector, getRequestThreadMessages: mocks.history, sendRequestThreadMessage: mocks.send, reconcileRequestThreadMessage: vi.fn(), submitDataRequestResponse: mocks.quote, updateDataRequest: vi.fn(), publishDataRequest: vi.fn(), deleteDataRequest: vi.fn(), confirmDataRequestPublication: vi.fn(), withdrawDataRequestPublication: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const request = { id: 'request', slug: 'example', buyer_id: 'buyer', title: 'Buyer data request', description: 'Public safe request description', status: 'open', urgency: 'normal', categories: [], format_preferences: [], currency: 'USD', created_at: '2026-11-07T00:00:00Z', response_count: 1, provenance_requirements: null, published_at: null, price_range_min: null, price_range_max: null, updated_at: null, buyer_display_name: 'Buyer' } satisfies DataRequestDetail;
const response = { id: 'response', request_id: 'request', proposal: 'An existing nonbinding quote', status: 'submitted', created_at: '2026-11-07T00:00:00Z' };
const history = { contract: 'request-thread-v1', request_id: 'request', response_id: 'response', can_send: true, items: [], next_cursor: null };
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState({}, '', '/requests/example'); advanceAuthSessionOwner();
  useAuthStore.setState({ user: { id: 'buyer', role: 'buyer' } as User, token: 'synthetic', isAuthenticated: true });
  mocks.get.mockResolvedValue(request); mocks.responses.mockResolvedValue([response]);
  mocks.selector.mockResolvedValue({ contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: [{ response_id: 'response', can_send: true }] });
  mocks.history.mockResolvedValue(history); mocks.send.mockImplementation((_r, c) => Promise.resolve({ contract: 'request-thread-v1', request_id: 'request', response_id: c.response_id, client_message_nonce: c.client_message_nonce, command_digest: 'a'.repeat(64), event_id: 'event', state: 'sent', message: { id: 'safe', role: 'seller', content: 'Approved private message' } }));
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
  await screen.findByText('Private conversations are currently unavailable.'); expect(screen.getByRole('heading', { name: request.title })).not.toBeNull();
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
