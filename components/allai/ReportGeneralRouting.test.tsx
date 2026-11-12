// @vitest-environment jsdom
import '@/tests/support-network-trap';
import '@/tests/fixtures/request-thread-network-guard';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const route = vi.hoisted(() => ({ path: '/dashboard/orders/order-fixture' }));
const ports = vi.hoisted(() => ({
  recover: vi.fn(), conversation: vi.fn(), reply: vi.fn(), receipt: vi.fn(), open: vi.fn(), guide: vi.fn(), create: vi.fn(), send: vi.fn(), stream: vi.fn(),
  notifications: vi.fn(), count: vi.fn(), mark: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => route.path, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/api/support', async original => ({ ...await original<typeof import('@/api/support')>(),
  support: ports }));
vi.mock('@/api/anonymousChat', () => ({ createAnonymousSession: ports.create,
  sendAnonymousMessage: ports.send, readAnonymousMessageStream: ports.stream, getAnonymousChatStatus: vi.fn() }));
vi.mock('@/api/notifications', () => ({ getNotifications: ports.notifications,
  getUnreadNotificationCount: ports.count, markNotificationRead: ports.mark, markAllNotificationsRead: ports.mark }));
vi.mock('./WizardAllAIBridge', () => ({ useWizardBridge: () => null }));
import { AllAIProvider, useAllAI } from './AllAIContext';
import AllAIPanel from './AllAIPanel';
import NotificationCenter from '@/components/NotificationCenter';
import { principal, proposal, confirmed, conversation, deferred } from '@/tests/support-fixtures';
let context: ReturnType<typeof useAllAI>;
function Probe() { context = useAllAI(); return <><NotificationCenter enabled /><AllAIPanel /></>; }
const tree = () => <AllAIProvider><Probe /></AllAIProvider>;
beforeEach(() => {
  vi.clearAllMocks(); principal(); sessionStorage.clear(); localStorage.clear();
  route.path = '/dashboard/orders/order-fixture';
  ports.open.mockResolvedValue(proposal());
  ports.guide.mockResolvedValue(proposal({ revision: 2 }));
  ports.recover.mockResolvedValue(proposal());
  ports.create.mockResolvedValue('fake-general-session');
  ports.send.mockResolvedValue({ ok: true, status: 200, body: {} });
  ports.stream.mockImplementation(async (_body, receive) => receive({ type: 'answer', text: 'General ticket status answer' }));
  ports.notifications.mockResolvedValue({ items: [{ id: 'notice', type: 'support_ticket_message',
    title: 'Support update', body: 'Ticket status available', metadata: { public_ref: 'SUP-OTHER' },
    created_at: '2026-11-07T00:00:00Z', read_at: '2026-11-07T00:00:00Z', link_url: null }] });
  ports.count.mockResolvedValue({ unread_count: 0 });
});
afterEach(cleanup);
it.each(['away', 'same-closed', 'same-open'] as const)('actual notification action uses general chat from %s and never spends a private guidance turn', async mode => {
  const view = render(tree());
  await act(async () => { context.openReportIssue('order-fixture'); });
  const visit = context.reportSession!;
  if (mode !== 'same-open') await act(async () => { context.close(); });
  if (mode === 'away') { route.path = '/dashboard'; view.rerender(tree()); }
  fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Support update/ }));
  await waitFor(() => expect(ports.send).toHaveBeenCalledTimes(1));
  expect(ports.send.mock.calls[0][0]).toMatchObject({ message: 'status of ticket SUP-OTHER', context: { page: route.path } });
  expect(ports.guide).not.toHaveBeenCalled();
  expect(context.messages.some(m => m.content === 'status of ticket SUP-OTHER')).toBe(true);
  expect(await screen.findByText('General ticket status answer')).toBeTruthy();
  expect(screen.queryByLabelText('Private order issue report')).toBeNull();
  expect(context.reportSession).toBeNull(); expect(visit.current()).toBe(mode !== 'away');
  if (mode !== 'away') { await act(async () => context.openReportIssue('order-fixture')); expect(context.reportSession).toBe(visit); }
});
it('the actual report composer keeps guidance private while general callers use their own lane', async () => {
  render(tree()); await act(async () => { context.openReportIssue('order-fixture'); });
  fireEvent.change(screen.getByLabelText('Ask allAI about this report'), { target: { value: 'Private symptom' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to private guidance' }));
  await waitFor(() => expect(ports.guide).toHaveBeenCalledTimes(1));
  expect(ports.guide.mock.calls[0].slice(0, 3)).toEqual(['order-fixture', 'proposal-one', 1]);
  expect(ports.guide.mock.calls[0][4]).toBe('Private symptom');
  expect(ports.send).not.toHaveBeenCalled(); expect(ports.create).not.toHaveBeenCalled();
  expect(context.messages.some(m => m.content === 'Private symptom')).toBe(false);
  await act(async () => { await context.sendMessage('General caller text'); });
  expect(ports.send).toHaveBeenCalledTimes(1); expect(ports.guide).toHaveBeenCalledTimes(1);
  expect(ports.send.mock.calls[0][0].message).toBe('General caller text');
});

const canonicalId = '01234567-89ab-cdef-0123-456789abcdef';
it.each([canonicalId, canonicalId.toUpperCase(), canonicalId.replaceAll('-', ''), canonicalId + '/'])('admits button and recovery on equivalent route %s and retains only that order', async spelling => {
  route.path = '/dashboard/orders/' + spelling;
  ports.recover.mockResolvedValue(proposal());
  const view = render(tree());
  await act(async () => context.openReportIssue(canonicalId));
  const visit = context.reportSession!;
  expect(visit).toBeTruthy(); expect(ports.open).toHaveBeenCalledTimes(1);
  route.path = '/dashboard/orders/' + canonicalId.toUpperCase() + '/'; view.rerender(tree());
  expect(context.reportSession).toBe(visit); expect(visit.current()).toBe(true);
  await act(async () => context.leaveReportIssue());
  await act(async () => context.openReportIssue(canonicalId, 'proposal-one'));
  expect(ports.recover).toHaveBeenCalledWith(canonicalId, 'proposal-one');
  const recovered = context.reportSession!;
  route.path = '/dashboard/orders/' + canonicalId + '/extra'; view.rerender(tree());
  expect(recovered.current()).toBe(false);
  await act(async () => context.openReportIssue(canonicalId)); expect(context.reportSession).toBeNull();
});
it('notification shows general chat while retaining unknown reply; only explicit read and retry reuses exact command', async () => {
  ports.open.mockResolvedValue(proposal({ confirmation: confirmed() }));
  ports.conversation.mockResolvedValue(conversation()); ports.reply.mockRejectedValue(new Error('unknown'));
  const view = render(tree()); await act(async () => context.openReportIssue('order-fixture'));
  const visit = context.reportSession!;
  const input = () => screen.getByLabelText('Reply or report that the fix still fails') as HTMLTextAreaElement;
  await waitFor(() => expect(visit.getSnapshot().reply.validated).toBe(true));
  fireEvent.change(input(), { target: { value: 'Private unresolved original' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(visit.getSnapshot().reply.unknown).toBe(true));
  const command = ports.reply.mock.calls[0];
  fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Support update/ }));
  await screen.findByText('General ticket status answer');
  expect(visit.current()).toBe(true); expect(context.reportSession).toBeNull();
  expect(ports.send).toHaveBeenCalledTimes(1); expect(ports.guide).not.toHaveBeenCalled();
  expect(JSON.stringify(ports.send.mock.calls)).not.toContain(command[2]);
  expect(JSON.stringify(context.messages)).not.toContain(command[2]);
  await act(async () => context.openReportIssue('order-fixture'));
  expect(context.reportSession).toBe(visit); expect(input().value).toBe(command[2]);
  expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(true);
  expect(ports.reply).toHaveBeenCalledTimes(1); expect(ports.open).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
  await waitFor(() => expect(visit.getSnapshot().reply.retryReady).toBe(true));
  const late = deferred<ReturnType<typeof conversation>>(); ports.reply.mockReturnValueOnce(late.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(ports.reply).toHaveBeenCalledTimes(2)); expect(ports.reply.mock.calls[1]).toEqual(command);
  route.path = '/dashboard'; view.rerender(tree()); expect(visit.current()).toBe(false);
  await act(async () => late.resolve(conversation({ next_action: 'LATE PRIVATE' })));
  expect(screen.queryByText('LATE PRIVATE')).toBeNull(); expect(JSON.stringify(visit.getSnapshot())).not.toContain(command[2]);
});
it('general caller retains unsaved edits and unresolved guidance privately until explicit leave', async () => {
  ports.guide.mockRejectedValue(new Error('unknown'));
  render(tree()); await act(async () => context.openReportIssue('order-fixture')); const visit = context.reportSession!;
  await act(async () => visit.guide('Private pending guidance')); const command = ports.guide.mock.calls[0];
  await act(async () => context.sendMessage('Wizard general turn'));
  await screen.findByText('General ticket status answer'); expect(visit.current()).toBe(true);
  expect(visit.getSnapshot().guidanceRetry).toBe(true); expect(ports.guide).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(context.messages)).not.toContain(command[4]);
  await act(async () => context.openReportIssue('order-fixture')); expect(context.reportSession).toBe(visit);
  await act(async () => { await visit.recover(); await visit.retryGuidance(); });
  expect(ports.guide.mock.calls[1]).toEqual(command);
  await act(async () => { await visit.recover(); visit.plain(); visit.edit({ category: 'other', description: 'Private local unsaved' }); });
  await act(async () => context.sendMessage('Another general turn'));
  expect(visit.getSnapshot().draft.description).toBe('Private local unsaved');
  expect(JSON.stringify(context.messages)).not.toContain('Private local unsaved');
  await act(async () => context.openReportIssue('order-fixture')); expect(context.reportSession).toBe(visit);
  expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Private local unsaved');
  await act(async () => context.leaveReportIssue()); expect(visit.current()).toBe(false);
});

it.each(['principal', 'session', 'different-order', 'foreign-path'] as const)('retires a hidden retained visit on %s and fences late private guidance', async boundary => {
  const late = deferred<ReturnType<typeof proposal>>(); ports.guide.mockReturnValueOnce(late.promise);
  const view = render(tree()); await act(async () => context.openReportIssue('order-fixture')); const visit = context.reportSession!;
  let pending!: Promise<void>;
  await act(async () => { pending = visit.guide('Private late guidance'); });
  await act(async () => context.sendMessage('General wizard turn'));
  expect(visit.current()).toBe(true); expect(context.reportSession).toBeNull();
  if (boundary === 'principal' || boundary === 'session') {
    await act(async () => principal('buyer', boundary === 'session' ? 'buyer-fixture' : 'other-principal'));
  } else {
    route.path = boundary === 'different-order' ? '/dashboard/orders/other-order' : '/listings/order-fixture'; view.rerender(tree());
  }
  expect(visit.current()).toBe(false);
  await act(async () => { late.resolve(proposal({ guidance: [{ id: 'late', body: 'PRIVATE LATE RESULT' }] })); await pending; });
  expect(visit.getSnapshot().proposal).toBeNull();
  expect(JSON.stringify(context.messages)).not.toContain('PRIVATE LATE RESULT');
  await act(async () => context.openReportIssue('order-fixture'));
  if (boundary === 'different-order' || boundary === 'foreign-path') expect(context.reportSession).toBeNull();
  expect(ports.guide).toHaveBeenCalledTimes(1); expect(ports.send).toHaveBeenCalledTimes(1);
});
