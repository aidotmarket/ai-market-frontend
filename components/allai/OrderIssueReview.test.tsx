// @vitest-environment jsdom
import "@/tests/support-network-trap";
import "@/tests/fixtures/request-thread-network-guard";
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const route = vi.hoisted(() => ({ path: '/dashboard/orders/order-fixture' }));
const ports = vi.hoisted(() => ({ open: vi.fn(), recover: vi.fn(), save: vi.fn(), guide: vi.fn(), confirm: vi.fn(), conversation: vi.fn(), reply: vi.fn(), receipt: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
vi.mock('@/api/support', async original => ({ ...await original<typeof import('@/api/support')>(), support: ports }));
vi.mock('./WizardAllAIBridge', () => ({ useWizardBridge: () => null }));
import { AllAIProvider, useAllAI } from './AllAIContext';
import AllAIPanel from './AllAIPanel';
import OrderIssueReport from './OrderIssueReport';
import { OrderIssueSession } from '@/lib/order-issue-report';
import { proposal, confirmed, conversation, principal, fakePort, deferred } from '@/tests/support-fixtures';
import type { CustomerConversation, ReportProposal } from '@/api/support';
let context: ReturnType<typeof useAllAI>;
function Probe() { context = useAllAI(); return <AllAIPanel />; }
const tree = () => <AllAIProvider><Probe /></AllAIProvider>;
const visits: OrderIssueSession[] = [];
beforeEach(() => {
  vi.clearAllMocks(); principal(); route.path = '/dashboard/orders/order-fixture';
  sessionStorage.clear(); localStorage.clear();
  const fake = fakePort(); Object.assign(ports, Object.fromEntries(Object.entries(fake)));
});
afterEach(() => { cleanup(); visits.splice(0).forEach(s => s.retire()); });
async function mountConfirmed() {
  ports.open.mockResolvedValue(proposal({ confirmation: confirmed() }));
  const view = render(tree());
  await act(async () => { context.openReportIssue('order-fixture'); });
  await waitFor(() => expect(ports.conversation).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh conversation' }) as HTMLButtonElement).disabled).toBe(false));
  return view;
}
const replyInput = () => screen.getByLabelText('Reply or report that the fix still fails') as HTMLTextAreaElement;
const sendButton = () => screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement;
async function closeReopen() {
  await act(async () => { context.close(); });
  expect(screen.queryByLabelText('Reply or report that the fix still fails')).toBeNull();
  await act(async () => { context.openReportIssue('order-fixture'); });
}
describe('MED1 retained original reply command', () => {
  it.each(['pending', 'unknown'] as const)('real panel close/reopen during %s preserves command and requires explicit read then same retry', async phase => {
    await mountConfirmed(); const visit = context.reportSession;
    const first = deferred<CustomerConversation>(); ports.reply.mockReturnValueOnce(first.promise);
    fireEvent.change(replyInput(), { target: { value: 'Still fails\nExact original' } });
    fireEvent.click(sendButton()); await waitFor(() => expect(ports.reply).toHaveBeenCalledTimes(1));
    const original = ports.reply.mock.calls[0];
    if (phase === 'unknown') await act(async () => { first.reject(new Error('commit unknown')); });
    await closeReopen(); expect(context.reportSession).toBe(visit);
    expect(replyInput().value).toBe('Still fails\nExact original');
    expect(sendButton().disabled).toBe(true);
    expect(ports.reply).toHaveBeenCalledTimes(1);
    if (phase === 'pending') await act(async () => { first.reject(new Error('commit unknown')); });
    await screen.findByText(/Reply result is unknown/);
    fireEvent.change(replyInput(), { target: { value: 'Different command forbidden' } });
    expect(replyInput().value).toBe(original[2]);
    fireEvent.click(sendButton()); expect(ports.reply).toHaveBeenCalledTimes(1);
    ports.conversation.mockRejectedValueOnce(new Error('read unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
    await screen.findByText(/Conversation could not be loaded/);
    expect(sendButton().disabled).toBe(true); expect(replyInput().value).toBe(original[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    expect(ports.reply).toHaveBeenCalledTimes(1);
    const retry = deferred<CustomerConversation>(); ports.reply.mockReturnValueOnce(retry.promise);
    fireEvent.click(sendButton()); await waitFor(() => expect(ports.reply).toHaveBeenCalledTimes(2));
    expect(ports.reply.mock.calls[1]).toEqual(original);
    await closeReopen(); expect(sendButton().disabled).toBe(true);
    await act(async () => { retry.resolve(conversation()); });
    await waitFor(() => expect(replyInput().value).toBe(''));
    fireEvent.change(replyInput(), { target: { value: original[2] } }); fireEvent.click(sendButton());
    await waitFor(() => expect(ports.reply).toHaveBeenCalledTimes(3));
    expect(ports.reply.mock.calls[2][1]).not.toBe(original[1]);
  });
  it.each(['public_ref', 'conversation_id'] as const)('wrong %s conversation blocks replies and keeps a genuine draft', async field => {
    await mountConfirmed(); fireEvent.change(replyInput(), { target: { value: 'Keep private draft' } });
    ports.conversation.mockResolvedValueOnce(conversation({ [field]: 'OTHER' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
    await screen.findByText(/Conversation could not be loaded/);
    expect(replyInput().value).toBe('Keep private draft'); expect(sendButton().disabled).toBe(true);
    fireEvent.click(sendButton()); expect(ports.reply).not.toHaveBeenCalled();
  });
  it('distinct new original fences old reply completion and finally while the new reply is pending', async () => {
    await mountConfirmed(); const old = deferred<CustomerConversation>(); ports.reply.mockReturnValueOnce(old.promise);
    fireEvent.change(replyInput(), { target: { value: 'Old private reply' } }); fireEvent.click(sendButton());
    await waitFor(() => expect(ports.reply).toHaveBeenCalledTimes(1));
    ports.open.mockResolvedValueOnce(proposal({ proposal_id: 'new-proposal', conversation_id: 'new-conversation', confirmation: confirmed({ public_ref: 'SUP-NEW', conversation_id: 'new-conversation' }) }));
    ports.conversation.mockResolvedValue(conversation({ public_ref: 'SUP-NEW', conversation_id: 'new-conversation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start a distinct new report' }));
    await screen.findByText(/Ticket SUP-NEW/);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh conversation' }) as HTMLButtonElement).disabled).toBe(false));
    expect(replyInput().value).toBe('');
    const fresh = deferred<CustomerConversation>(); ports.reply.mockReturnValueOnce(fresh.promise);
    fireEvent.change(replyInput(), { target: { value: 'Fresh private reply' } }); fireEvent.click(sendButton());
    await waitFor(() => expect(ports.reply).toHaveBeenCalledTimes(2));
    await act(async () => { old.resolve(conversation({ next_action: 'OLD CALLBACK MUST NOT SHOW' })); });
    expect(screen.queryByText('OLD CALLBACK MUST NOT SHOW')).toBeNull(); expect(sendButton().disabled).toBe(true);
    expect(replyInput().value).toBe('Fresh private reply');
    await act(async () => { fresh.resolve(conversation({ public_ref: 'SUP-NEW', conversation_id: 'new-conversation' })); });
    await waitFor(() => expect(replyInput().value).toBe(''));
  });
});
it.each(['principal', 'owner'] as const)('%s departure erases retained reply state and fences late original results', async boundary => {
  await mountConfirmed(); const visit = context.reportSession!;
  const late = deferred<CustomerConversation>(); ports.reply.mockReturnValueOnce(late.promise);
  fireEvent.change(replyInput(), { target: { value: 'Old owner private reply' } }); fireEvent.click(sendButton());
  await waitFor(() => expect(ports.reply).toHaveBeenCalledTimes(1));
  await act(async () => { principal('buyer', boundary === 'owner' ? 'buyer-fixture' : 'another-user'); });
  expect(context.reportSession).toBeNull(); expect(visit.current()).toBe(false);
  await act(async () => { late.resolve(conversation({ next_action: 'OLD OWNER RESULT' })); });
  expect(screen.queryByText('OLD OWNER RESULT')).toBeNull();
  expect(ports.reply).toHaveBeenCalledTimes(1);
  // Retired state contains no necessary reply body from the prior visit.
  expect(JSON.stringify(visit.getSnapshot())).not.toContain('Old owner private reply');
});
describe('MED2 actual persistent provider pathname departure', () => {
  it.each(['guidance', 'confirmation', 'conversation', 'reply'] as const)('retires A during pending %s when router goes to B without opening a report', async operation => {
    ports.open.mockResolvedValue(proposal({ confirmation: ['conversation', 'reply'].includes(operation) ? confirmed() : null }));
    const wait = deferred<ReportProposal>(), read = deferred<CustomerConversation>();
    ports.guide.mockReturnValue(wait.promise); ports.confirm.mockReturnValue(wait.promise); ports.reply.mockReturnValue(read.promise);
    if (operation === 'conversation') ports.conversation.mockReturnValue(read.promise);
    const view = render(tree()); await act(async () => { context.openReportIssue('order-fixture'); });
    const visit = context.reportSession!;
    const oldOpen = context.openReportIssue;
    let pending: Promise<void> | undefined;
    await act(async () => {
      if (operation === 'reply') { fireEvent.change(replyInput(), { target: { value: 'A reply still pending' } }); fireEvent.click(sendButton()); }
      if (operation === 'guidance') pending = visit.guide('Private A question');
      if (operation === 'confirmation') { visit.review(true); pending = visit.confirm(); }
    });
    if (operation === 'confirmation') await waitFor(() => expect(ports.confirm).toHaveBeenCalledTimes(1));
    route.path = '/dashboard/orders/B'; view.rerender(tree());
    expect(context.reportSession).toBeNull(); expect(visit.current()).toBe(false);
    await act(async () => { oldOpen('order-fixture'); }); expect(context.reportSession).toBeNull();
    expect(screen.queryByLabelText('Private order issue report')).toBeNull();
    await act(async () => { wait.resolve(proposal({ revision: 2, confirmation: confirmed() })); read.resolve(conversation({ next_action: 'LATE A PRIVATE' })); await pending; });
    const counts = [ports.save.mock.calls.length, ports.guide.mock.calls.length, ports.confirm.mock.calls.length, ports.reply.mock.calls.length];
    await visit.save(); await visit.guide('Retired action'); visit.review(true); await visit.confirm();
    expect([ports.save.mock.calls.length, ports.guide.mock.calls.length, ports.confirm.mock.calls.length, ports.reply.mock.calls.length]).toEqual(counts);
    expect(screen.queryByText('LATE A PRIVATE')).toBeNull(); expect(visit.getSnapshot().proposal).toBeNull();
    expect(ports.receipt).not.toHaveBeenCalled();
  });
  it('same owning path retains visit across rerenders and panel closure, nonorder departure retires it', async () => {
    ports.open.mockResolvedValue(proposal()); const view = render(tree());
    await act(async () => { context.openReportIssue('order-fixture'); }); const visit = context.reportSession;
    await closeReopen(); view.rerender(tree()); expect(context.reportSession).toBe(visit);
    route.path = '/requests/example'; view.rerender(tree()); expect(context.reportSession).toBeNull();
    expect(visit?.getSnapshot().retired).toBe(true);
  });
});
describe('MED3 durable draft restore versus real local intent', () => {
  it.each([false, true])('interrupted initial %s recovery restores durable text on repeated recover', async linked => {
    const port = fakePort(); principal();
    vi.mocked(linked ? port.recover : port.open).mockRejectedValueOnce(new Error('initial response lost'));
    const session = new OrderIssueSession('order-fixture', port, linked ? 'proposal-one' : null); visits.push(session);
    await session.open(); await session.recover(); await session.recover();
    expect(session.getSnapshot().draft.description).toBe('Exact customer original');
    expect(session.getSnapshot().saved).toBe(true);
    if (!linked) expect(vi.mocked(port.open).mock.calls[1]).toEqual(vi.mocked(port.open).mock.calls[0]);
  });
  it.each(['edited', 'blank', 'plain'] as const)('repeated recover preserves genuine %s intent; save then restores server truth', async mode => {
    principal(); const port = fakePort(), session = new OrderIssueSession('order-fixture', port); visits.push(session); await session.open();
    if (mode === 'plain') session.plain();
    session.edit({ category: 'other', description: mode === 'blank' ? '' : 'Genuine unsaved text' });
    await session.recover(); await session.recover();
    expect(session.getSnapshot().draft.description).toBe(mode === 'blank' ? '' : 'Genuine unsaved text');
    expect(session.getSnapshot().saved).toBe(false);
    if (mode === 'plain') expect(session.getSnapshot().surface).toBe('web');
    if (mode !== 'blank') { await session.save(); expect(session.getSnapshot().saved).toBe(true); vi.mocked(port.recover).mockResolvedValue(proposal({ revision: 3 })); await session.recover(); expect(session.getSnapshot().draft.description).toBe('Exact customer original'); }
  });
});
it('expired copy with interrupted open preserves only the explicitly copied draft, plain intent and fresh identity', async () => {
  principal(); const port = fakePort(); vi.mocked(port.open).mockResolvedValueOnce(proposal({ expires_at: '2000-01-01T00:00:00Z' }));
  const session = new OrderIssueSession('order-fixture', port); visits.push(session); await session.open(); session.plain();
  session.edit({ category: 'other', description: 'Explicit copy draft' });
  vi.mocked(port.open).mockRejectedValueOnce(new Error('copy response lost')).mockResolvedValueOnce(proposal({ proposal_id: 'copy-id', conversation_id: 'copy-conversation', surface: 'web' }));
  await session.copyExpired(); await session.recover();
  expect(session.getSnapshot().proposal?.proposal_id).toBe('copy-id'); expect(session.getSnapshot().draft.description).toBe('Explicit copy draft');
  expect(session.getSnapshot().saved).toBe(false); expect(session.getSnapshot().surface).toBe('web');
  expect(vi.mocked(port.open).mock.calls[1]).toEqual(vi.mocked(port.open).mock.calls[2]);
  expect(vi.mocked(port.open).mock.calls[1][1]).not.toBe(vi.mocked(port.open).mock.calls[0][1]);
  expect(vi.mocked(port.open).mock.calls[1][3]).toBe(false); expect(port.reply).not.toHaveBeenCalled();
});
describe('MED4 requested first recovery identity', () => {
  it.each(['first', 'retry'] as const)('quarantines wrong requested ID on %s acceptance; valid same ID remains usable past filing expiry', async phase => {
    principal(); const port = fakePort();
    const session = new OrderIssueSession('order-fixture', port, 'proposal-A'); visits.push(session);
    if (phase === 'retry') { vi.mocked(port.recover).mockRejectedValueOnce(new Error('lost')); await session.open(); }
    vi.mocked(port.recover).mockResolvedValueOnce(proposal({ proposal_id: 'proposal-B', draft: { category: 'other', description: 'FOREIGN ORIGINAL' }, confirmation: confirmed() }));
    await session.recover();
    render(<OrderIssueReport session={session} onLeave={vi.fn()} />);
    expect(session.getSnapshot().proposal).toBeNull(); expect(session.getSnapshot().draft.description).toBe('');
    expect(screen.queryByText('FOREIGN ORIGINAL')).toBeNull(); expect(port.conversation).not.toHaveBeenCalled();
    session.review(true); await session.save(); await session.confirm(); await session.guide('No action');
    expect(port.save).not.toHaveBeenCalled(); expect(port.confirm).not.toHaveBeenCalled(); expect(port.guide).not.toHaveBeenCalled();
    vi.mocked(port.recover).mockResolvedValueOnce(proposal({ proposal_id: 'proposal-A', expires_at: '2000-01-01T00:00:00Z', confirmation: confirmed() }));
    await act(async () => { await session.recover(); });
    expect(session.getSnapshot().proposal?.proposal_id).toBe('proposal-A');
    expect(session.getSnapshot().proposal?.confirmation?.public_ref).toBe('SUP-42');
    await waitFor(() => expect(port.conversation).toHaveBeenCalledTimes(1));
  });
});
