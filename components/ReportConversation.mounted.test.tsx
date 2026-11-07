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
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/orders/' + nav.order, useParams: () => ({ id: nav.order }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ TermsGatePrompt: () => null }) }));
// Ancillary order widgets do not supply the failing order read or its rendering.
vi.mock('@/components/orders/GatewayDeliverySection', () => ({ default: () => null }));
vi.mock('@/components/orders/OrderVersionAccessSummary', () => ({ default: () => null }));
import { AllAIProvider, useAllAI } from './allai/AllAIContext';
import AllAIPanel from './allai/AllAIPanel';
import { useReportedView } from './ViewIssueReport';
import { support, issueDigest } from '@/api/support';
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
const freshId = '00000000-0000-4000-8000-000000000028';
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
const reportConv = '00000000-0000-4000-8000-000000000026';
let viewReport: any = null;
const ownConv = () => kind === 'order_detail' ? conv : reportConv;
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
  kind = 'support_conversation'; context = null; mode = ''; failedRead = true; viewReport = null; replies.length = 0;
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
    if (url.endsWith('/issue-reports/proposals')) return response(c, proposal({ conversation_id: conv, confirmation: confirmed({ conversation_id: conv, original: kind === 'order_detail' && mode !== 'unrelatedOrder' ? { category: 'other', description: 'Order view failed', failed_operation: mode === 'renderOrder' ? 'order_detail:render_failed' : 'order_detail:normal_read_failed' } : { category: 'download_delivery', description: 'My order file was not delivered' } }) }));
    if (url.endsWith('/support/view-reports')) {
      viewReport = body(c);
      if (mode === 'lostReport' && calls('/support/view-reports').length === 1) throw new Error('lost report response');
      return response(c, { public_ref: 'SUP-VIEW-42', conversation_id: reportConv, received_at: '2026-11-07T00:00:00Z', status: 'in_progress', next_action: 'Support is reviewing.',
        original: { category: 'other', description: viewReport.description, failed_operation: viewReport.view + ':' + viewReport.failure }, email_state: 'pending',
        acknowledgement: { id: 'view-ack', version: 'v1', direction: 'outbound', body: 'Your view report is saved with support.' } });
    }
    if (url.endsWith('/recovery/context')) { context = body(c); return response(c, { context_id: context!.context_id, state: 'context_retained', revision: context!.expected_revision }); }
    if (url.endsWith('/recovery/current') && mode === 'route401') fail(c, 401);
    if (url.endsWith('/recovery/current')) return response(c, { ticket_context: { expected_revision: context && mode === 'successor' ? 13 : 12, symptom_message_id: read, conversation_id: ownConv() },
      action: context && mode !== 'waiting' ? { operation_id: op, state: 'admitted_waiting_client', execute_once: false, refresh_count: 1, reload_count: 1, view: kind } : null,
      context_id: context && mode === 'successor' ? reportConv : context?.context_id, client_epoch: context?.client_epoch });
    if (url.endsWith('/client')) {
      if (mode === 'route401') fail(c, 401);
      const s = body(c); replies.push(s.phase);
      expect(c.headers.get('X-CSRF-Token')).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(s)).not.toContain(token);
      if (s.phase === 'start' && mode === 'lostStart') throw new Error('lost start');
      const r = { operation_id: op, view: kind, refresh_count: 1, reload_count: 1, execute_once: s.phase === 'start',
        state: s.phase === 'start' ? 'attempt_started' : s.phase === 'reload' ? 'read_observed' : s.phase === 'render' ? mode === 'unverified' ? 'view_loaded_original_unverified' : 'verified_view_loaded' : s.phase };
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
    if (url.endsWith('/customer-messages')) {
      if (mode === 'lostReply' && calls('/customer-messages').length === 1) throw new Error('lost reply');
      return response(c, ownConversation([{ id: 'reply-result', version: 'v1', direction: 'inbound', body: body(c).body }]));
    }
    if (url.endsWith('/customer-receipts')) return response(c, {});
    if (url.endsWith('/threads')) return response(c, selection);
    if (url.endsWith('/messages')) { if (failedRead) fail(c); return response(c, threadHistory); }
    if (url.endsWith('/events')) return response(c, []);
    if (url.endsWith('/orders/' + nav.order)) {
      if (failedRead) fail(c);
      return response(c, mode === 'renderOrder' ? { ...dataForView(), listing_title: { invalidReactChild: true } } : dataForView());
    }
    if (url.endsWith('/conversation')) {
      if (url.includes('SUP-VIEW-42')) return response(c, mode === 'wrongConversation' ? currentConversation() : ownConversation(c.params?.cursor ? [{ id: 'page2', version: 'v1', direction: 'outbound', body: 'Own second page' }] : undefined, c.params?.cursor ? null : 'page2'));
      if (failedRead) fail(c); return response(c, currentConversation());
    }
    throw new Error('Unexpected synthetic network route: ' + url);
  });
});
afterEach(async () => { cleanup(); session?.retire(); await act(async () => { await Promise.resolve(); }); vi.restoreAllMocks(); });

let allai: ReturnType<typeof useAllAI>;
function Probe() { allai = useAllAI(); return null; }
function ownConversation(messages = [{ id: 'own-message', version: 'v1', direction: 'outbound', body: 'Own support answer' }], next_cursor: string | null = null) {
  return conversation({ public_ref: 'SUP-VIEW-42', conversation_id: reportConv, messages: messages as import('@/api/support').CustomerMessage[], next_cursor });
}
const observers: { callback: IntersectionObserverCallback; target?: Element }[] = [];
class VisibleObserver {
  item: typeof observers[number];
  constructor(callback: IntersectionObserverCallback) { this.item = { callback }; observers.push(this.item); }
  observe(target: Element) { this.item.target = target; }
  disconnect() { this.item.target = undefined; }
  unobserve() {}
}
class SyntheticChannel {
  static current: SyntheticChannel;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = vi.fn(); close = vi.fn();
  constructor() { SyntheticChannel.current = this; }
}
beforeEach(() => { observers.length = 0; vi.stubGlobal('IntersectionObserver', VisibleObserver); vi.stubGlobal('BroadcastChannel', SyntheticChannel); });
afterEach(() => vi.unstubAllGlobals());
async function visibleMessages() {
  await waitFor(() => expect(document.querySelector('[role="dialog"]')?.getAttribute('style')).toContain('opacity: 1'));
  await act(async () => { for (const o of observers) if (o.target?.isConnected) o.callback([{ target: o.target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver); });
}
async function mount(view: RecoveryKind, linked = true) {
  kind = view; mode = 'waiting';
  window.history.replaceState(null, '', linked ? '/?response_id=' + responseId : '/');
  const tree = (selected: RecoveryKind) => <AllAIProvider><Probe />
    {selected === 'wallet' && <WalletFunding />}
    {selected === 'request_thread' && <RequestConversation requestId={request} requestStatus="open" />}
    {selected === 'order_detail' && <OrderDetailPage />}
    <AllAIPanel /></AllAIProvider>;
  const ui = render(tree(view));
  await act(async () => { allai.openReportIssue(nav.order); });
  session = allai.reportSession!;
  if (view !== 'support_conversation' && view !== 'order_detail') await act(async () => allai.close());
  return ui;
}
async function reportFailure() {
  fireEvent.click(await screen.findByRole('button', { name: 'Report Issue' }));
  fireEvent.click(screen.getByLabelText('I have reviewed this report and want to send it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and send report' }));
  await screen.findByText('Your view report is saved with support.');
}
it.each(['wallet', 'request_thread', 'support_conversation'] as const)('mounted provider/panel %s uses only its own conversation, pagination, reply and visible receipt; preserves unrelated report', async view => {
  await mount(view);
  const original = session, before = original.getSnapshot();
  await reportFailure();
  expect(allai.reportSession).toBe(original);
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  await screen.findByText('Own support answer');
  expect(allai.supportSession?.getConfirmation()?.conversation_id).toBe(reportConv);
  expect(calls('/customer-receipts')).toHaveLength(0);
  await visibleMessages();
  await waitFor(() => expect(calls('/customer-receipts')).toHaveLength(1));
  expect(calls('/customer-receipts')[0].url).toContain('SUP-VIEW-42');
  expect(body(calls('/customer-receipts')[0])).toEqual({ message_id: 'own-message', version: 'v1' });
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  await screen.findByText('Own second page'); expect(screen.getByText('Own support answer')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'Please explain this view fix' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByText('Please explain this view fix');
  expect(calls('/customer-messages')[0].url).toContain('SUP-VIEW-42');
  expect(calls('/customer-messages')[0].headers.get('X-CSRF-Token')).toMatch(/^[a-f0-9]{64}$/);
  expect(original.getSnapshot().draft).toBe(before.draft);
  expect(original.getSnapshot().proposal).toBe(before.proposal);
  fireEvent.click(screen.getByRole('button', { name: 'Return to previous allAI conversation' }));
  expect(allai.reportSession).toBe(original);
});
it('own uncertain reply keeps exact nonce/body through reads and explicit identical retry in actual panel', async () => {
  await mount('wallet'); await reportFailure();
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  await screen.findByText('Own support answer'); mode = 'lostReply';
  fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'Immutable reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByText(/Reply result is unknown/);
  const command = body(calls('/customer-messages')[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  await waitFor(() => expect(allai.supportSession?.getSnapshot().reply.retryReady).toBe(true));
  expect(allai.supportSession?.getSnapshot().reply.unknown).toBe(true);
  expect(calls('/customer-messages')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'Changed forbidden' } });
  expect(allai.supportSession?.getSnapshot().reply.body).toBe('Immutable reply');
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByText('Immutable reply');
  expect(body(calls('/customer-messages')[1])).toEqual(command);
});
it('wrong own conversation refuses reply and auth owner ABA fences private panel state', async () => {
  await mount('wallet'); await reportFailure(); mode = 'wrongConversation';
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  await screen.findByText('Conversation could not be loaded. Your ticket is retained.');
  expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(true);
  const prior = allai.supportSession;
  await act(async () => { advanceAuthSessionOwner(); });
  expect(allai.supportSession).toBeNull(); expect(prior?.current()).toBe(false);
  expect(screen.queryByText('Own support answer')).toBeNull();
  expect(calls('/customer-messages')).toHaveLength(0);
});

it.each([false, true])('occupied order report (confirmed=%s) offers distinct failed-operation review and keeps original unknown command; lost open uses same nonce', async confirmedOriginal => {
  const real = net.adapter.getMockImplementation()!;
  let fresh: ReturnType<typeof proposal> | null = null;
  let openAttempts = 0;
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    const url = c.url ?? '';
    if (url.endsWith('/issue-reports/proposals')) {
      const b = body(c);
      if (b.resume_latest) return response(c, proposal({ draft: { category: 'download_delivery', description: 'Original delivery complaint' }, confirmation: confirmedOriginal ? confirmed({ conversation_id: conv, original: { category: 'download_delivery', description: 'Original delivery complaint' } }) : null, conversation_id: conv }));
      fresh ??= proposal({ proposal_id: freshId, conversation_id: reportConv, draft: { category: 'other', description: '' } });
      if (++openAttempts === 1) throw new Error('lost fresh open');
      return response(c, fresh);
    }
    if (url.endsWith('/' + freshId) && c.method === 'patch') {
      fresh = { ...fresh!, revision: fresh!.revision + 1, draft: body(c).draft }; return response(c, fresh);
    }
    if (url.endsWith('/issue-reports')) {
      fresh = { ...fresh!, revision: fresh!.revision + 1, confirmation: confirmed({ public_ref: 'SUP-VIEW-42', conversation_id: reportConv, original: fresh!.draft }) }; return response(c, fresh);
    }
    return real(c);
  });
  await mount('order_detail');
  const original = allai.reportSession!;
  if (confirmedOriginal) {
    // A lost original reply remains part of the original visit throughout switching.
    failedRead = false; await act(async () => { await original.loadConversation(); original.editReply('Original unknown reply'); await original.sendReply(); });
  } else await act(async () => original.edit({ category: 'download_delivery', description: 'Nonblank unsaved original' }));
  const retained = original.getSnapshot(), originalMemory = original.recoverySnapshot();
  fireEvent.click(screen.getAllByRole('button', { name: 'Report Issue' }).find(button => !button.closest('[role="dialog"]'))!);
  fireEvent.click(await screen.findByRole('button', { name: 'Report the display problem separately' }));
  const separate = allai.reportSession!;
  expect(separate).not.toBe(original);
  await waitFor(() => expect(separate.getSnapshot().reconcile).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Recover saved proposal' }));
  await screen.findByDisplayValue('My order details could not be displayed.');
  const opens = calls('/issue-reports/proposals').map(body).filter(b => b.resume_latest === false);
  expect(opens).toHaveLength(2); expect(opens[1]).toEqual(opens[0]);
  expect(separate.getSnapshot().draft.failed_operation).toBe('order_detail:normal_read_failed');
  expect(original.getSnapshot().draft).toBe(retained.draft);
  expect(original.recoverySnapshot().unknown_mutations).toEqual(originalMemory.unknown_mutations);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(separate.getSnapshot().saved).toBe(true));
  fireEvent.click(screen.getByLabelText('I have reviewed this exact saved report and want to file it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and file report' }));
  await waitFor(() => expect(separate.getConfirmation()?.public_ref).toBe('SUP-VIEW-42'));
  expect(separate.getConfirmation()).toMatchObject({ original: { failed_operation: 'order_detail:normal_read_failed' } });
  expect(body(calls('/issue-reports')[0])).toEqual({ proposal_id: freshId, confirmed_revision: 2,
    content_digest: await issueDigest(separate.getSnapshot().draft) });
  await screen.findByText('Own support answer'); await visibleMessages();
  expect(calls('/customer-receipts').some(c => c.url?.includes('SUP-VIEW-42'))).toBe(true);
  fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'Separate order display reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByText('Separate order display reply');
  fireEvent.click(screen.getByRole('button', { name: 'Return to retained order report' }));
  expect(allai.reportSession).toBe(original);
  expect(original.getSnapshot().draft.category).toBe('download_delivery');
  expect(original.getSnapshot().draft.failed_operation).toBeUndefined();
  if (confirmedOriginal) expect(original.getSnapshot().reply.unknown).toBe(true);
});
it('returning request A after lost POST explicitly reconciles the immutable command and creates only a fresh recovery context', async () => {
  const other = '00000000-0000-4000-8000-000000000027';
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    if (c.url?.endsWith('/threads')) return response(c, { ...selection, threads: [...selection.threads, { response_id: other, can_send: true }] });
    const r = await real(c);
    if (c.url?.endsWith('/support/view-reports') && calls('/support/view-reports').length === 1) await held;
    return r;
  });
  await mount('request_thread', false);
  fireEvent.change(await screen.findByLabelText('Response for private conversation'), { target: { value: responseId } });
  fireEvent.click(await screen.findByRole('button', { name: 'Report Issue' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Exact response A problem' } });
  fireEvent.click(screen.getByLabelText('I have reviewed this report and want to send it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and send report' }));
  await waitFor(() => expect(calls('/support/view-reports')).toHaveLength(1));
  const immutable = body(calls('/support/view-reports')[0]);
  const selector = screen.getByLabelText('Response for private conversation');
  fireEvent.change(selector, { target: { value: other } });
  await screen.findByRole('button', { name: 'Report Issue' });
  fireEvent.change(selector, { target: { value: responseId } });
  await screen.findByRole('button', { name: 'Reconcile this earlier report', hidden: true });
  await act(async () => { release(); await held; });
  expect(calls('/recovery/context')).toHaveLength(0);
  expect(screen.queryByText('Your view report is saved with support.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile this earlier report', hidden: true }));
  expect(screen.getByLabelText('Description')).toHaveProperty('value', immutable.description);
  expect(calls('/support/view-reports')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same report' }));
  await screen.findByText('Your view report is saved with support.');
  expect(calls('/support/view-reports').map(body)).toEqual([immutable, immutable]);
  await waitFor(() => expect(calls('/recovery/context')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  await screen.findByText('Own support answer');
});
it('hidden own messages produce no display receipts; visible transition emits only exact own message versions', async () => {
  await mount('wallet'); await reportFailure();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  await screen.findByText('Own support answer'); await visibleMessages();
  expect(calls('/customer-receipts')).toHaveLength(0);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(calls('/customer-receipts')).toHaveLength(1));
});

it.each(['context', 'diagnosis', 'start', 'reload', 'render'] as const)('mounted provider delayed %s completes only for current original epoch and hashes', async phase => {
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void, reached = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    const match = phase === 'context' ? c.url?.endsWith('/recovery/context') : phase === 'diagnosis' ? c.url?.endsWith('/recovery/current') && !!context : c.url?.endsWith('/client') && body(c).phase === phase;
    if (match && !reached) { reached = true; await held; }
    return real(c);
  });
  await mount('wallet'); mode = 'successor'; await reportFailure();
  await waitFor(() => expect(reached).toBe(true));
  await act(async () => { release(); await held; });
  await waitFor(() => expect(replies).toEqual(['start', 'reload', 'render']));
  expect(calls('/auth/refresh')).toHaveLength(1); expect(calls('/recovery/context')).toHaveLength(1);
  for (const c of calls('/client')) expect(body(c)).toMatchObject({ client_epoch: context!.client_epoch, preserved: context!.preserved });
});
it.each(['context', 'diagnosis', 'start', 'reload', 'render'] as const)('mounted provider delayed %s refuses after unrelated private draft changes', async phase => {
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void, reached = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    const match = phase === 'context' ? c.url?.endsWith('/recovery/context') : phase === 'diagnosis' ? c.url?.endsWith('/recovery/current') && !!context : c.url?.endsWith('/client') && body(c).phase === phase;
    if (match && !reached) { reached = true; await held; }
    return real(c);
  });
  await mount('wallet'); mode = 'successor'; await reportFailure();
  await waitFor(() => expect(reached).toBe(true));
  await act(async () => { session.editReply('Keep this newer unrelated draft'); release(); await held; });
  await screen.findByText(/Recovery stopped/);
  expect(session.getSnapshot().reply.body).toBe('Keep this newer unrelated draft');
  expect(calls('/auth/refresh').length).toBeLessThanOrEqual(1);
  expect(calls('/client').filter(c => body(c).phase === 'start').length).toBeLessThanOrEqual(1);
  expect(calls('/client').filter(c => body(c).phase === 'reload').length).toBeLessThanOrEqual(1);
  expect(calls('/support/view-reports')).toHaveLength(1);
});
it.each(['start', 'reload', 'render'] as const)('lost %s response stays uncertain without another report or execution', async phase => {
  const real = net.adapter.getMockImplementation()!;
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    const value = await real(c);
    if (c.url?.endsWith('/client') && body(c).phase === phase) throw new Error('lost response');
    return value;
  });
  await mount('wallet'); mode = 'successor'; await reportFailure();
  await screen.findByText(/Recovery stopped/);
  expect(calls('/client').filter(c => body(c).phase === phase)).toHaveLength(1);
  expect(calls('/auth/refresh').length).toBeLessThanOrEqual(1);
  expect(calls('/support/view-reports')).toHaveLength(1);
  expect(screen.queryByText(/verified.*fixed/i)).toBeNull();
});

it.each(['cross-tab', 'restored-page'] as const)('%s lifecycle invalidates private prior owner state and delayed own reply', async signal => {
  await mount('wallet'); await reportFailure();
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  await screen.findByText('Own support answer');
  const original = allai.reportSession, own = allai.supportSession;
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    if (c.url?.endsWith('/customer-messages')) await held;
    return real(c);
  });
  fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'Prior owner private reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(calls('/customer-messages')).toHaveLength(1));
  await act(async () => {
    if (signal === 'cross-tab') SyntheticChannel.current.onmessage?.({ data: { type: 'owner_changed' } });
    else window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    release(); await held;
  });
  expect(own?.current()).toBe(false); expect(original?.current()).toBe(false);
  expect(allai.supportSession).toBeNull(); expect(allai.reportSession).toBeNull();
  expect(screen.queryByText('Prior owner private reply')).toBeNull();
  expect(calls('/customer-messages')).toHaveLength(1);
});
it('wallet offset A to B to A offers exact report reconciliation without replaying payment uncertainty or old response', async () => {
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    if (c.url?.endsWith('/wallet/transactions')) {
      if (c.params.offset === 20) fail(c);
      return response(c, { ...transactions, has_more: true, total: 41 });
    }
    const r = await real(c);
    if (c.url?.endsWith('/support/view-reports') && calls('/support/view-reports').length === 1) await held;
    return r;
  });
  await mount('wallet');
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Report Issue' }));
  fireEvent.click(screen.getByLabelText('I have reviewed this report and want to send it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and send report' }));
  await waitFor(() => expect(calls('/support/view-reports')).toHaveLength(1));
  const command = body(calls('/support/view-reports')[0]); expect(command.wallet_offset).toBe(20);
  // Refresh returns to offset 0 through the existing read action; it is not a mutation retry.
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(calls('/wallet/transactions').filter(c => c.params.offset === 0).length).toBe(2));
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
  await screen.findByRole('button', { name: 'Reconcile this earlier report', hidden: true });
  await act(async () => { release(); await held; });
  expect(calls('/recovery/context')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile this earlier report', hidden: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry same report' }));
  await screen.findByText('Your view report is saved with support.');
  expect(calls('/support/view-reports').map(body)).toEqual([command, command]);
  expect(calls('/wallet/topup')).toHaveLength(0);
});

it('own conversation A to original B to A fences a delayed reply while allowing explicit identical reconciliation', async () => {
  await mount('wallet'); await reportFailure();
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  await screen.findByText('Own support answer');
  const own = allai.supportSession!;
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    if (c.url?.endsWith('/customer-messages') && calls('/customer-messages').length === 1) await held;
    return real(c);
  });
  fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'Exact pending own reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(calls('/customer-messages')).toHaveLength(1));
  const command = body(calls('/customer-messages')[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Return to previous allAI conversation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open report conversation in allAI' }));
  expect(allai.supportSession).toBe(own);
  await act(async () => { release(); await held; });
  expect(own.getSnapshot().reply.unknown).toBe(true);
  expect(own.getSnapshot().reply.body).toBe(command.body);
  expect(own.getSnapshot().reply.conversation?.messages.some(m => m.body === command.body)).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  await waitFor(() => expect(own.getSnapshot().reply.retryReady).toBe(true));
  expect(calls('/customer-messages')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByText('Exact pending own reply');
  expect(calls('/customer-messages').map(body)).toEqual([command, command]);
});

it('same-owner request controller A to B to A retains the exact uncertain report through actual unmounts', async () => {
  const otherRequest = '00000000-0000-4000-8000-000000000029';
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    if (c.url?.includes(otherRequest) && c.url.endsWith('/threads')) return response(c, { ...selection, request_id: otherRequest });
    const value = await real(c);
    if (c.url?.endsWith('/support/view-reports') && calls('/support/view-reports').length === 1) await held;
    return value;
  });
  const ui = await mount('request_thread');
  fireEvent.click(await screen.findByRole('button', { name: 'Report Issue' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Retained across request pages' } });
  fireEvent.click(screen.getByLabelText('I have reviewed this report and want to send it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and send report' }));
  await waitFor(() => expect(calls('/support/view-reports')).toHaveLength(1));
  const command = body(calls('/support/view-reports')[0]);
  const tree = (id: string) => <AllAIProvider><Probe /><RequestConversation requestId={id} requestStatus="open" /><AllAIPanel /></AllAIProvider>;
  ui.rerender(tree(otherRequest));
  await screen.findByRole('button', { name: 'Report Issue' });
  ui.rerender(tree(request));
  await screen.findByRole('button', { name: 'Reconcile this earlier report', hidden: true });
  await act(async () => { release(); await held; });
  expect(calls('/recovery/context')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile this earlier report', hidden: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry same report' }));
  await screen.findByText('Your view report is saved with support.');
  expect(calls('/support/view-reports').map(body)).toEqual([command, command]);
});

it('fresh proposal A to retained original B to A ignores delayed open and reconciles only the identical open nonce', async () => {
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let freshCalls = 0;
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    if (c.url?.endsWith('/issue-reports/proposals')) {
      if (body(c).resume_latest) return response(c, proposal({ conversation_id: conv, draft: { category: 'download_delivery', description: 'Original delivery issue' }, confirmation: confirmed({ conversation_id: conv, original: { category: 'download_delivery', description: 'Original delivery issue' } }) }));
      if (++freshCalls === 1) await held;
      return response(c, proposal({ proposal_id: freshId, conversation_id: reportConv, draft: { category: 'other', description: '' } }));
    }
    return real(c);
  });
  await mount('order_detail');
  fireEvent.click(screen.getAllByRole('button', { name: 'Report Issue' }).find(button => !button.closest('[role="dialog"]'))!);
  fireEvent.click(await screen.findByRole('button', { name: 'Report the display problem separately' }));
  const fresh = allai.reportSession;
  await waitFor(() => expect(freshCalls).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Return to retained order report' }));
  fireEvent.click(screen.getByRole('button', { name: 'Return to retained order report' }));
  expect(allai.reportSession).toBe(fresh);
  await act(async () => { release(); await held; });
  expect(fresh?.getSnapshot().proposal).toBeNull();
  expect(fresh?.getSnapshot().reconcile).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Recover saved proposal' }));
  await screen.findByDisplayValue('My order details could not be displayed.');
  const commands = calls('/issue-reports/proposals').map(body).filter(b => b.resume_latest === false);
  expect(commands).toHaveLength(2); expect(commands[0]).toEqual(commands[1]);
});

function StableReportedView() {
  const report = useReportedView(true, { view: 'wallet', target: 'wallet:0', reportTarget: { view: 'wallet', wallet_offset: 0 },
    current: () => true, selectionGeneration: () => 0,
    snapshot: () => ({ saved_drafts: {}, unsent_text: '', conversation_selection: {}, unknown_mutations: {}, generation: 0 }),
    install: value => value as object });
  return report.control;
}
it('a stale reconciliation control cannot consume another retained report or attach a command twice', async () => {
  await mount('wallet'); mode = 'lostReport';
  fireEvent.click(await screen.findByRole('button', { name: 'Report Issue' }));
  fireEvent.click(screen.getByLabelText('I have reviewed this report and want to send it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and send report' }));
  await screen.findByText(/report result is unknown/);
  cleanup();
  render(<AllAIProvider><Probe /><StableReportedView /><StableReportedView /><AllAIPanel /></AllAIProvider>);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reconcile this earlier report', hidden: true })).toHaveLength(2));
  const staleControls = screen.getAllByRole('button', { name: 'Reconcile this earlier report', hidden: true });
  fireEvent.click(staleControls[0]);
  expect(screen.getAllByRole('button', { name: 'Retry same report' })).toHaveLength(1);
  fireEvent.click(staleControls[1]);
  expect(screen.getAllByRole('button', { name: 'Retry same report' })).toHaveLength(1);
  expect(calls('/support/view-reports')).toHaveLength(1);
});

it('principal A to B to A without a generation signal fences a delayed private report and never exposes its old draft', async () => {
  const real = net.adapter.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  net.adapter.mockImplementation(async (c: InternalAxiosRequestConfig) => {
    const result = await real(c);
    if (c.url?.endsWith('/support/view-reports')) await held;
    return result;
  });
  await mount('wallet');
  fireEvent.click(await screen.findByRole('button', { name: 'Report Issue' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Private prior principal report' } });
  fireEvent.click(screen.getByLabelText('I have reviewed this report and want to send it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and send report' }));
  await waitFor(() => expect(calls('/support/view-reports')).toHaveLength(1));
  const originalUser = useAuthStore.getState().user;
  await act(async () => {
    useAuthStore.setState({ user: { id: 'principal-B', role: 'buyer' } as User });
    useAuthStore.setState({ user: originalUser });
    release(); await held;
  });
  expect(screen.queryByDisplayValue('Private prior principal report')).toBeNull();
  expect(screen.queryByText('Private prior principal report')).toBeNull();
  expect(screen.queryByText('Your view report is saved with support.')).toBeNull();
  expect(calls('/recovery/context')).toHaveLength(0);
  expect(calls('/support/view-reports')).toHaveLength(1);
});
