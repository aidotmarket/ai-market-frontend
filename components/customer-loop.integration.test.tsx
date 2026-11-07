// @vitest-environment jsdom
import "@/tests/support-network-trap";
import "@/tests/fixtures/request-thread-network-guard";
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import { createHash } from 'node:crypto';
const route = vi.hoisted(() => ({ path: '/dashboard/orders/order-fixture' }));
const mocks = vi.hoisted(() => ({ adapter: vi.fn(), getMe: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('axios', async original => {
  const actual = (await original<typeof import('axios')>()).default;
  return { ...await original<typeof import('axios')>(), default: Object.assign(
    (...args: Parameters<typeof actual>) => actual(...args), actual,
    { create: (config: Parameters<typeof actual.create>[0]) => actual.create({ ...config, adapter: mocks.adapter }) }
  ) };
});
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
vi.mock('@/api/auth', () => ({ getMe: mocks.getMe, login: mocks.login, logout: mocks.logout, isTwoFactorChallenge: () => false }));
import { api } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { authSessionOwner } from '@/lib/auth-session-owner';
import { AllAIProvider, useAllAI } from './allai/AllAIContext';
import OrderIssueReport from './allai/OrderIssueReport';
import RequestConversation from './RequestConversation';
import { proposal, confirmed, conversation, principal, deferred } from '@/tests/support-fixtures';
import type { User } from '@/types';
let context: ReturnType<typeof useAllAI>;
const token = (seconds: number) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.sig`;
const user = { id: 'buyer-fixture', role: 'buyer' } as User;
function Both() {
  context = useAllAI();
  return <>{context.reportSession && <OrderIssueReport session={context.reportSession} onLeave={context.leaveReportIssue} />}<RequestConversation requestId="request" requestStatus="matched" /></>;
}
const selector = { contract: 'request-thread-v1', request_id: 'request', side: 'buyer', availability: 'enabled', threads: [{ response_id: 'one', can_send: true }, { response_id: 'two', can_send: true }] };
const history = (response: string) => ({ contract: 'request-thread-v1', request_id: 'request', response_id: response, can_send: true, items: [{ id: 'prior', request_id: 'request', response_id: response, role: 'seller', state: 'sent', content: 'Existing safe thread text' }], next_cursor: null });
function mutation(config: { url?: string; data?: string }) {
  const body = JSON.parse(config.data ?? '{}');
  if (config.url?.endsWith('/message-commands')) return { contract: 'request-thread-v1', request_id: 'request', response_id: body.response_id, client_message_nonce: body.client_message_nonce, command_digest: 'a'.repeat(64), event_id: 'event', state: 'sent', message: { id: 'sent', request_id: 'request', response_id: body.response_id, role: 'buyer', content: 'Approved thread reply' } };
  if (config.url?.endsWith('/issue-reports')) return proposal({ revision: 3, confirmation: confirmed({ original: { category: 'other', description: 'Reviewed customer original' } }) });
  if (body.expected_revision) return proposal({ revision: 2, draft: body.draft ?? proposal().draft });
  return proposal();
}
beforeEach(() => {
  route.path = '/dashboard/orders/order-fixture';
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); window.history.replaceState({}, '', '/requests/example');
  principal(); useAuthStore.setState({ token: token(3600) }); mocks.getMe.mockResolvedValue(user); mocks.logout.mockResolvedValue(undefined);
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => ({ data: url.endsWith('/threads') ? selector : url.endsWith('/conversation') ? conversation() : history(String(config?.params?.response_id)) }));
  mocks.adapter.mockImplementation(async config => ({ data: mutation(config), status: 200, headers: {}, config }));
});
afterEach(cleanup);
async function mount() {
  render(<AllAIProvider><Both /></AllAIProvider>);
  await act(async () => { context.openReportIssue('order-fixture'); });
  await screen.findByDisplayValue('Exact customer original');
  fireEvent.change(screen.getByRole('combobox', { name: 'Response for private conversation' }), { target: { value: 'one' } });
  await screen.findByText('Existing safe thread text');
}
function writeThread() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Private message for selected response' }), { target: { value: 'Private thread original' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send private message' }));
}
it('shares one session across actual report save/review/confirm/original conversation and an explicit request send', async () => {
  await mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Reviewed customer original' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByText('Draft saved; not reported');
  fireEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and file report' }));
  await screen.findByRole('region', { name: 'Original private support conversation' });
  expect(screen.getByText('Reviewed customer original')).toBeTruthy();
  writeThread(); await screen.findByText('Approved thread reply');
  const calls = mocks.adapter.mock.calls.map(([config]) => config);
  expect(calls.some(c => c.method === 'patch')).toBe(true);
  expect(calls.some(c => c.url.endsWith('/issue-reports'))).toBe(true);
  expect(calls.some(c => c.url.endsWith('/message-commands'))).toBe(true);
  for (const call of calls) {
    const bearer = useAuthStore.getState().token!;
    expect(call.headers.Authorization).toBe(`Bearer ${bearer}`);
    expect(call.headers['X-CSRF-Token']).toBe(createHash('sha256').update('aim.pending.csrf.v1\0' + bearer).digest('hex'));
  }
  expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
});
it('refreshes once for both legs, preserves C3 PATCH and rejects C4 admission after thread departure', async () => {
  await mount(); const refresh = deferred<{ data: { access_token: string } }>();
  vi.spyOn(axios, 'post').mockReturnValue(refresh.promise);
  await act(async () => { useAuthStore.setState({ token: token(-60) }); }); mocks.adapter.mockClear();
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Edited saved original' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' })); writeThread();
  await waitFor(() => expect(axios.post).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByRole('combobox', { name: 'Response for private conversation' }), { target: { value: 'two' } });
  const fresh = token(7200);
  await act(async () => { refresh.resolve({ data: { access_token: fresh } }); });
  await screen.findByText('Draft saved; not reported');
  expect(mocks.adapter).toHaveBeenCalledOnce();
  const config = mocks.adapter.mock.calls[0][0]; expect(config.method).toBe('patch');
  expect(config.headers.Authorization).toBe(`Bearer ${fresh}`);
  expect(config.headers['X-CSRF-Token']).toBe(createHash('sha256').update('aim.pending.csrf.v1\0' + fresh).digest('hex'));
  expect(screen.queryByText('Approved thread reply')).toBeNull();
});
it.each(['login', 'completeSession', 'logout'] as const)('actual %s retires both private scopes and quarantines late report/thread results', async action => {
  await mount(); const visit = context.reportSession!;
  const report = deferred<unknown>(), thread = deferred<unknown>();
  mocks.adapter.mockImplementation(async config => ({ data: await (config.url.endsWith('/message-commands') ? thread.promise : report.promise), status: 200, headers: {}, config }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Retired report draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' })); writeThread();
  await waitFor(() => expect(mocks.adapter.mock.calls.some(([c]) => c.url.endsWith('/message-commands'))).toBe(true));
  const login = deferred<never>(); mocks.login.mockReturnValue(login.promise);
  await act(async () => {
    if (action === 'login') void useAuthStore.getState().login('fixture@example.invalid', 'fixture-only').catch(() => {});
    else if (action === 'completeSession') await useAuthStore.getState().completeSession({ access_token: token(7200), token_type: 'bearer' });
    else await useAuthStore.getState().logout();
  });
  expect(visit.getSnapshot().retired).toBe(true);
  expect(screen.queryByDisplayValue('Retired report draft')).toBeNull();
  expect(screen.queryByDisplayValue('Private thread original')).toBeNull();
  await act(async () => {
    report.resolve(proposal({ revision: 2, draft: { category: 'other', description: 'Late private report' } }));
    const command = mocks.adapter.mock.calls.find(([c]) => c.url.endsWith('/message-commands'))![0]; thread.resolve(mutation(command));
  });
  const dispatched = mocks.adapter.mock.calls.length;
  await visit.guide('Old retained action'); await visit.save();
  expect(mocks.adapter).toHaveBeenCalledTimes(dispatched);
  expect(screen.queryByDisplayValue('Late private report')).toBeNull(); expect(screen.queryByText('Approved thread reply')).toBeNull();
  expect(visit.getSnapshot().proposal).toBeNull();
  if (action === 'login') await act(async () => { login.reject(new Error('Fixture login ends')); });
});
it('actual same-principal rotation retains both drafts and the owner', async () => {
  await mount(); const owner = authSessionOwner(), visit = context.reportSession;
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Retained order draft' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Private message for selected response' }), { target: { value: 'Retained request draft' } });
  await act(async () => { await useAuthStore.getState().rotateSession({ access_token: token(7200), token_type: 'bearer' }); });
  expect(authSessionOwner()).toBe(owner); expect(context.reportSession).toBe(visit);
  expect(screen.getByDisplayValue('Retained order draft')).toBeTruthy(); expect(screen.getByDisplayValue('Retained request draft')).toBeTruthy();
});

it.each(['save', 'reply'] as const)('router departure fences actual C3 %s admission after shared refresh while C4 remains usable', async command => {
  const view = render(<AllAIProvider><Both /></AllAIProvider>);
  await act(async () => { context.openReportIssue('order-fixture'); });
  const visit = context.reportSession!;
  if (command === 'reply') {
    await act(async () => { visit.review(true); await visit.confirm(); });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh conversation' }) as HTMLButtonElement).disabled).toBe(false));
  }
  const refresh = deferred<{ data: { access_token: string } }>();
  vi.spyOn(axios, 'post').mockReturnValue(refresh.promise);
  await act(async () => { useAuthStore.setState({ token: token(-60) }); }); mocks.adapter.mockClear();
  if (command === 'save') {
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'A draft waiting for refresh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  } else {
    fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'A reply waiting for refresh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  }
  await waitFor(() => expect(axios.post).toHaveBeenCalledOnce());
  route.path = '/dashboard/orders/B'; view.rerender(<AllAIProvider><Both /></AllAIProvider>);
  expect(visit.getSnapshot().retired).toBe(true); expect(context.reportSession).toBeNull();
  await act(async () => { refresh.resolve({ data: { access_token: token(7200) } }); });
  expect(mocks.adapter).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Response for private conversation' }), { target: { value: 'one' } });
  await screen.findByText('Existing safe thread text'); writeThread(); await screen.findByText('Approved thread reply');
  expect(mocks.adapter).toHaveBeenCalledTimes(1);
  expect(mocks.adapter.mock.calls[0][0].url).toMatch(/message-commands$/);
});

it('distinct original supersedes a reply waiting for refresh without admitting the old command', async () => {
  render(<AllAIProvider><Both /></AllAIProvider>);
  await act(async () => { context.openReportIssue('order-fixture'); }); const visit = context.reportSession!;
  await act(async () => { visit.review(true); await visit.confirm(); });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh conversation' }) as HTMLButtonElement).disabled).toBe(false));
  const refresh = deferred<{ data: { access_token: string } }>(); vi.spyOn(axios, 'post').mockReturnValue(refresh.promise);
  await act(async () => { useAuthStore.setState({ token: token(-60) }); }); mocks.adapter.mockClear();
  fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'Retired original reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' })); await waitFor(() => expect(axios.post).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Start a distinct new report' }));
  await act(async () => { refresh.resolve({ data: { access_token: token(7200) } }); });
  await screen.findByRole('textbox', { name: 'Description' });
  expect(mocks.adapter).toHaveBeenCalledTimes(1);
  expect(mocks.adapter.mock.calls[0][0].url).toMatch(/issue-reports\/proposals$/);
  expect(screen.queryByDisplayValue('Retired original reply')).toBeNull();
});
