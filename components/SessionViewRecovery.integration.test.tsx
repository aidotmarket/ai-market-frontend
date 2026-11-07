// @vitest-environment jsdom
import '@/tests/support-network-trap';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Component, useSyncExternalStore, type ReactNode } from 'react';
const net = vi.hoisted(() => ({ adapter: vi.fn() }));
vi.mock('axios', async original => {
  const actual = await original<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, create: (config: object) => actual.default.create({ ...config, adapter: net.adapter }) } };
});
const nav = vi.hoisted(() => ({ order: '00000000-0000-4000-8000-000000000010' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: nav.order }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/allai/AllAIContext', () => ({ useAllAI: () => ({ openReportIssue: () => {} }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ TermsGatePrompt: () => null }) }));
// Ancillary order widgets do not supply the failing order read or its rendering.
vi.mock('@/components/orders/GatewayDeliverySection', () => ({ default: () => null }));
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({ default: () => null }));
import { support } from '@/api/support';
import { OrderIssueSession } from '@/lib/order-issue-report';
import OrderIssueReport from '@/components/allai/OrderIssueReport';
import OrderDetailPage from '@/app/dashboard/orders/[id]/page';
import RequestConversation from '@/components/RequestConversation';
import WalletFunding from '@/app/dashboard/settings/wallet/WalletFunding';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { confirmed, proposal, conversation } from '@/tests/support-fixtures';
import type { RecoveryContext, RecoveryKind } from '@/api/support-recovery';
import type { User } from '@/types';

const owner = '00000000-0000-4000-8000-000000000020', conv = '00000000-0000-4000-8000-000000000021';
const responseId = '00000000-0000-4000-8000-000000000022', request = '00000000-0000-4000-8000-000000000023';
const op = '00000000-0000-4000-8000-000000000024', read = '00000000-0000-4000-8000-000000000025';
const token = 'synthetic.' + btoa(JSON.stringify({ exp: 4102444800 })) + '.original';
const rotated = token + '-rotated';
const currentConversation = () => conversation({ conversation_id: conv, messages: [{ id: 'actual-new-message', version: 'v2', direction: 'outbound', body: 'Exact restored conversation' }] });
const selection = { contract: 'request-thread-v1', request_id: request, side: 'buyer', availability: 'enabled', threads: [{ response_id: responseId, can_send: true }] };
const threadHistory = { contract: 'request-thread-v1', request_id: request, response_id: responseId, can_send: true, items: [{ id: 'returned-message', request_id: request, response_id: responseId, role: 'seller', content: 'Exact restored thread', state: 'sent' }], next_cursor: null };
const balance = { user_id: owner, balance_cents: 1234, currency: 'USD' };
const transactions = { transactions: [], total: 0, has_more: false };
let kind: RecoveryKind, context: RecoveryContext | null, mode: string, session: OrderIssueSession;
let failedRead = true;
const replies: string[] = [];
function dataForView() {
  if (kind === 'support_conversation') return mode === 'badReadScope' ? { ...currentConversation(), conversation_id: request } : currentConversation();
  if (kind === 'request_thread') return { selection, history: threadHistory };
  if (kind === 'wallet') return { balance, transactions };
  return { id: nav.order, buyer_id: owner, seller_id: 'seller', listing_id: 'listing', amount_cents: 500,
    listing_title: 'Exact restored order', status: 'pending_fulfillment', created_at: '2026-11-07T00:00:00Z', updated_at: null, workspace_delivery: false };
}
const body = (c: InternalAxiosRequestConfig) => typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
const calls = (suffix: string) => net.adapter.mock.calls.map(([c]) => c as InternalAxiosRequestConfig).filter(c => c.url?.endsWith(suffix));
function fail(c: InternalAxiosRequestConfig, status = 503): never {
  throw new AxiosError('synthetic refusal', 'ERR_BAD_RESPONSE', c, null, { config: c, status, statusText: 'Refused', headers: {}, data: {} });
}
function response(c: InternalAxiosRequestConfig, data: unknown) { return { config: c, data, status: 200, statusText: 'OK', headers: {} }; }
beforeEach(() => {
  kind = 'support_conversation'; context = null; mode = ''; failedRead = true; replies.length = 0;
  advanceAuthSessionOwner();
  useAuthStore.setState({ user: { id: owner, role: 'buyer' } as User, token, isAuthenticated: true, hydrated: true, isLoading: false });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 500, height: 100, top: 0, left: 0, bottom: 100, right: 500, x: 0, y: 0, toJSON: () => ({}) });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  window.history.replaceState(null, '', '/');
  axios.defaults.adapter = net.adapter;
  net.adapter.mockReset();
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    const url = c.url ?? '';
    if (url.endsWith('/auth/refresh')) { if (mode === 'refresh429') fail(c, 429); return response(c, { access_token: rotated }); }
    if (url.endsWith('/issue-reports/proposals')) return response(c, proposal({ conversation_id: conv, confirmation: confirmed({ conversation_id: conv }) }));
    if (url.endsWith('/recovery/context')) { context = body(c); return response(c, { context_id: context!.context_id, state: 'context_retained', revision: context!.expected_revision }); }
    if (url.endsWith('/recovery/current') && mode === 'route401') fail(c, 401);
    if (url.endsWith('/recovery/current')) return response(c, { ticket_context: { expected_revision: 12, symptom_message_id: read, conversation_id: conv },
      action: context && mode !== 'waiting' ? { operation_id: op, state: 'admitted_waiting_client', execute_once: false, refresh_count: 1, reload_count: 1, view: kind } : null,
      context_id: context?.context_id, client_epoch: context?.client_epoch });
    if (url.endsWith('/client')) {
      if (mode === 'route401') fail(c, 401);
      const s = body(c); replies.push(s.phase);
      expect(c.headers.get('X-CSRF-Token')).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(s)).not.toContain(token);
      if (s.phase === 'start' && mode === 'lostStart') throw new Error('lost start');
      const r = { operation_id: op, view: kind, refresh_count: 1, reload_count: 1, execute_once: s.phase === 'start',
        state: s.phase === 'start' ? 'attempt_started' : s.phase === 'reload' ? 'read_observed' : s.phase === 'render' ? 'verified_view_loaded' : s.phase };
      if (s.phase === 'reload') { failedRead = false; return response(c, { ...r, data: dataForView(), read_id: read, content_digest: 'c'.repeat(64) }); }
      return response(c, { ...r, ...(s.phase === 'render' ? { evidence_ref: read } : {}) });
    }
    if (url.endsWith('/auth/me')) return response(c, { id: mode === 'wrongWalletOwner' && c.headers.get('Authorization') === `Bearer ${rotated}` ? 'other' : owner, status: 'active' });
    if (url.endsWith('/wallet/balance')) return response(c, balance);
    if (url.endsWith('/wallet/transactions')) {
      if (mode === 'wallet401' && failedRead) fail(c, 401);
      if (failedRead || (mode === 'paging20' && c.params.offset === 20)) fail(c);
      return response(c, { ...transactions, has_more: mode === 'paging20', total: mode === 'paging20' ? 41 : 0 });
    }
    if (url.endsWith('/wallet/topup')) throw new Error('unknown checkout result');
    if (url.endsWith('/customer-messages')) throw new Error('unknown reply result');
    if (url.endsWith('/threads')) return response(c, selection);
    if (url.endsWith('/messages')) { if (failedRead) fail(c); return response(c, threadHistory); }
    if (url.endsWith('/events')) return response(c, []);
    if (url.endsWith('/orders/' + nav.order)) { if (failedRead) fail(c); return response(c, dataForView()); }
    if (url.endsWith('/conversation')) { if (failedRead) fail(c); return response(c, currentConversation()); }
    throw new Error('Unexpected synthetic network route: ' + url);
  });
});
afterEach(async () => { cleanup(); session?.retire(); await act(async () => { await Promise.resolve(); }); vi.restoreAllMocks(); });
async function selectTicket() { session = new OrderIssueSession(nav.order, support); await session.open(); expect(session.getSnapshot().proposal?.confirmation).toBeTruthy(); }

it.each(['support_conversation', 'order_detail', 'request_thread', 'wallet'] as const)('actual %s controller visibly installs the failing view: exactly one refresh, one reload and one render', async view => {
  kind = view; await selectTicket();
  if (view === 'support_conversation') render(<OrderIssueReport session={session} onLeave={() => {}} />);
  if (view === 'order_detail') render(<OrderDetailPage />);
  if (view === 'request_thread') { window.history.replaceState(null, '', '/?response_id=' + responseId); render(<RequestConversation requestId={request} requestStatus="open" />); }
  if (view === 'wallet') render(<WalletFunding />);
  await waitFor(() => expect(replies).toEqual(['start', 'reload', 'render']));
  expect(calls('/auth/refresh')).toHaveLength(1);
  expect(context?.view).toBe(view);
  for (const value of Object.values(context!.preserved)) expect(value).toMatch(/^[a-f0-9]{64}$/);
  if (view === 'support_conversation') expect(screen.getByText('Exact restored conversation')).toBeTruthy();
  if (view === 'order_detail') expect(screen.getByText('Exact restored order')).toBeTruthy();
  if (view === 'request_thread') expect(screen.getByText('Exact restored thread')).toBeTruthy();
  if (view === 'wallet') { expect(screen.getByText('USD 12.34')).toBeTruthy(); expect(calls('/auth/me')).toHaveLength(2); expect(calls('/wallet/transactions')).toHaveLength(1); }
  const posted = calls('/client').map(body);
  expect(posted[2]).toMatchObject({ read_id: read, content_digest: 'c'.repeat(64), preserved: context!.preserved });
  expect(net.adapter.mock.calls.filter(([c]) => c.method === 'post').map(([c]) => c.url)).toEqual(expect.arrayContaining([expect.stringContaining('/issue-reports/proposals'), expect.stringContaining('/recovery/context')]));
  expect(net.adapter.mock.calls.some(([c]) => /topup|payment|customer-messages|message-commands/.test(c.url))).toBe(false);
});
it.each(['hidden', 'unmount', 'lostStart', 'refresh429', 'wrongWalletOwner'] as const)('%s never emits a successful render receipt or a second attempt', async condition => {
  mode = condition; kind = condition === 'wrongWalletOwner' ? 'wallet' : 'support_conversation'; await selectTicket();
  const ui = render(<div hidden={condition === 'hidden'}>{kind === 'wallet' ? <WalletFunding /> : <OrderIssueReport session={session} onLeave={() => {}} />}</div>);
  if (condition === 'unmount') { await waitFor(() => expect(replies).toContain('reload')); ui.unmount(); }
  else await waitFor(() => expect(replies).toContain(condition === 'hidden' ? 'reload' : condition === 'refresh429' ? 'failed' : 'unknown'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  expect(replies).not.toContain('render'); expect(calls('/auth/refresh').length).toBeLessThanOrEqual(1);
});
it('ordinary support remains usable while owner admission is pending; draft changes stop that context', async () => {
  mode = 'waiting'; await selectTicket(); render(<OrderIssueReport session={session} onLeave={() => {}} />);
  await screen.findByText(/Waiting for support to accept recovery/);
  const reply = screen.getByLabelText('Reply or report that the fix still fails');
  fireEvent.change(reply, { target: { value: 'Keep this unsent reply' } });
  expect((reply as HTMLTextAreaElement).value).toBe('Keep this unsent reply'); expect(replies).toEqual([]); expect(calls('/auth/refresh')).toHaveLength(0);
});
it.each(['current', 'start'] as const)('the real recovery %s route refuses401 without preemptive refresh or replay even with an expired access credential', async route => {
  await selectTicket(); mode = 'route401';
  const expired = 'synthetic.' + btoa(JSON.stringify({ exp: 1 })) + '.expired';
  useAuthStore.setState({ token: expired });
  await expect(route === 'current' ? support.recoveryCurrent!('SUP-42') : support.recoveryStep!('SUP-42', op, {
    client_epoch: read, phase: 'start', preserved: { saved_drafts: 'a'.repeat(64), unsent_text: 'b'.repeat(64), conversation_selection: 'c'.repeat(64), unknown_mutations: 'd'.repeat(64) },
  })).rejects.toThrow('synthetic refusal');
  expect(calls('/auth/refresh')).toHaveLength(0);
  expect(calls(route === 'current' ? '/recovery/current' : '/client')).toHaveLength(1);
  expect(useAuthStore.getState().token).toBe(expired);
});
it('an uncertain real reply retains its body, nonce and unknown state; recovery never replays it', async () => {
  failedRead = false; await selectTicket(); render(<OrderIssueReport session={session} onLeave={() => {}} />);
  await waitFor(() => expect(session.getSnapshot().reply.validated).toBe(true));
  act(() => session.editReply('Exact uncertain reply'));
  await act(async () => { await session.sendReply(); });
  const before = session.recoverySnapshot(); expect(session.getSnapshot().reply.unknown).toBe(true);
  failedRead = true; await act(async () => { await session.loadConversation(); });
  await waitFor(() => expect(replies).toContain('render'));
  const after = session.recoverySnapshot();
  expect(after.unsent_text).toEqual(before.unsent_text);
  expect(after.unknown_mutations).toEqual(before.unknown_mutations);
  expect(calls('/customer-messages')).toHaveLength(1);
  expect(screen.getByLabelText('Reply or report that the fix still fails')).toHaveProperty('value', 'Exact uncertain reply');
});
it('unknown checkout and the actual amount survive the wallet token association change without payment replay', async () => {
  kind = 'wallet'; failedRead = false; await selectTicket(); render(<WalletFunding />);
  await screen.findByText('USD 12.34');
  fireEvent.change(screen.getByLabelText('Amount (USD)'), { target: { value: '9.87' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Fund wallet' }));
  await screen.findByText(/We couldn't confirm whether checkout was created/);
  failedRead = true; fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(replies).toContain('render'));
  expect(screen.getByLabelText('Amount (USD)')).toHaveProperty('value', '9.87');
  expect(screen.getByRole('button', { name: 'Continue to checkout' })).toHaveProperty('disabled', true);
  expect(calls('/wallet/topup')).toHaveLength(1);
  expect(screen.getByText(/We couldn't confirm whether checkout was created/)).toBeTruthy();
});
it('wallet declares the actual failing offset20 and installs that page without another history request', async () => {
  kind = 'wallet'; mode = 'paging20'; failedRead = false; await selectTicket(); render(<WalletFunding />);
  await screen.findByText('No recorded transactions on this page.');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(replies).toContain('render'));
  expect(context!.wallet_offset).toBe(20);
  expect(screen.getByText(/Page 2\./)).toBeTruthy();
  expect(calls('/wallet/transactions').map(c => c.params)).toEqual([{ limit: 20, offset: 0 }, { limit: 20, offset: 20 }]);
});
it('a wallet read401 with a current selected ticket uses A without implicit refresh or replay', async () => {
  kind = 'wallet'; mode = 'wallet401'; await selectTicket(); render(<WalletFunding />);
  await waitFor(() => expect(replies).toEqual(['start', 'reload', 'render']));
  expect(calls('/auth/refresh')).toHaveLength(1); expect(calls('/wallet/transactions')).toHaveLength(1);
  expect(screen.getByText('USD 12.34')).toBeTruthy();
});
it('a returned read for a different conversation never replaces the original selection or emits render', async () => {
  mode = 'badReadScope'; await selectTicket(); render(<OrderIssueReport session={session} onLeave={() => {}} />);
  await waitFor(() => expect(replies).toContain('failed'));
  expect(replies).not.toContain('render'); expect(session.getSnapshot().proposal?.confirmation?.conversation_id).toBe(conv);
  expect(screen.queryByText('Exact restored conversation')).toBeNull();
});
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">View could not render</p> : this.props.children; }
}
it('invalid returned message data is refused by the existing parser before rendering', async () => {
  await selectTicket();
  const real = net.adapter.getMockImplementation()!;
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    const response = await real(c);
    if (c.url?.endsWith('/client') && body(c).phase === 'reload') {
      // Parser failure is still a failing view, rather than a success receipt.
      response.data.data.messages = [{ id: 'bad', version: 'v1', direction: 'outbound', body: { unsafe: true } }];
    }
    return response;
  });
  render(<Boundary><OrderIssueReport session={session} onLeave={() => {}} /></Boundary>);
  await waitFor(() => expect(replies).toContain('failed'));
  expect(replies).not.toContain('render');
});
it('an actual React error boundary prevents a receipt for otherwise valid installed data', async () => {
  await selectTicket();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function FailingRender() {
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
    if (state.reply.conversation) throw new Error('Synthetic failing view render');
    return <OrderIssueReport session={session} onLeave={() => {}} />;
  }
  render(<Boundary><FailingRender /></Boundary>);
  await screen.findByText('View could not render');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  expect(replies).toContain('reload'); expect(replies).not.toContain('render');
});
