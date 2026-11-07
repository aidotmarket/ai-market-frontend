// @vitest-environment jsdom
import "@/tests/support-network-trap";
import "@/tests/fixtures/request-thread-network-guard";
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({
  open: vi.fn(), recover: vi.fn(), save: vi.fn(), guide: vi.fn(), confirm: vi.fn(),
  conversation: vi.fn(), reply: vi.fn(), receipt: vi.fn(),
  anonymousCreate: vi.fn(), anonymousSend: vi.fn(), anonymousStatus: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/orders/order-fixture' }));
vi.mock('@/api/support', async original => ({ ...await original<typeof import('@/api/support')>(),
  support: { open: ports.open, recover: ports.recover, save: ports.save, guide: ports.guide, confirm: ports.confirm,
    conversation: ports.conversation, reply: ports.reply, receipt: ports.receipt } }));
vi.mock('@/api/anonymousChat', () => ({
  createAnonymousSession: ports.anonymousCreate, sendAnonymousMessage: ports.anonymousSend,
  getAnonymousChatStatus: ports.anonymousStatus, readAnonymousMessageStream: vi.fn(),
}));
import { AllAIProvider, useAllAI } from './AllAIContext';
import { principal, proposal, deferred, rejection } from '@/tests/support-fixtures';
import type { ReportProposal } from '@/api/support';

let context: ReturnType<typeof useAllAI>;
function Probe() { context = useAllAI(); return null; }
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); principal(); });
afterEach(() => cleanup());

it('private support sends never enter anonymous/generic chat or private browser persistence; close/reopen preserves visit', async () => {
  ports.open.mockResolvedValue(proposal());
  ports.guide.mockResolvedValue(proposal({ revision: 2, guidance: [{ id: 'g1', body: 'Customer-safe prompt' }] }));
  render(<AllAIProvider><Probe /></AllAIProvider>);
  await act(async () => { context.openReportIssue('order-fixture'); });
  expect(context.reportSession?.getSnapshot().proposal?.proposal_id).toBe('proposal-one');
  const visit = context.reportSession;
  await act(async () => { await context.reportSession!.guide('PRIVATE ORDER SYMPTOM'); });
  expect(ports.guide).toHaveBeenCalledWith('order-fixture', 'proposal-one', 1, expect.any(String), 'PRIVATE ORDER SYMPTOM');
  expect(context.messages.some(m => m.content.includes('PRIVATE ORDER SYMPTOM'))).toBe(false);
  expect(ports.anonymousCreate).not.toHaveBeenCalled(); expect(ports.anonymousSend).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  await act(async () => { context.close(); context.openReportIssue('order-fixture'); });
  expect(context.reportSession).toBe(visit); expect(ports.open).toHaveBeenCalledTimes(1);
  await act(async () => { context.leaveReportIssue(); });
  expect(context.reportSession).toBeNull();
  expect(visit?.getSnapshot().draft.description).toBe('');
});

it('interrupted proposal create reuses nonce; no context or guide before authorization; principal change fences late create', async () => {
  const pending = deferred<ReportProposal>(); ports.open.mockReturnValueOnce(pending.promise);
  render(<AllAIProvider><Probe /></AllAIProvider>);
  await act(async () => { context.openReportIssue('order-fixture'); });
  expect(context.reportSession?.getSnapshot().proposal).toBeNull();
  await act(async () => { await context.reportSession!.guide('must not send before authorization'); });
  expect(ports.guide).not.toHaveBeenCalled();
  const visit = context.reportSession;
  await act(async () => { principal('seller', 'new-principal'); });
  await act(async () => { pending.resolve(proposal()); await pending.promise; });
  expect(context.reportSession).toBeNull(); expect(visit?.getSnapshot().proposal).toBeNull();
  expect(ports.anonymousSend).not.toHaveBeenCalled();
});

it('server-unavailable/default-OFF is an unavailable typed report; no generic support/mail fallback is invoked', async () => {
  ports.open.mockRejectedValue(rejection(404));
  render(<AllAIProvider><Probe /></AllAIProvider>);
  await act(async () => { context.openReportIssue('order-fixture'); });
  await waitFor(() => expect(context.reportSession?.getSnapshot().error).toMatch(/Order reporting is unavailable/));
  expect(context.reportSession?.getSnapshot().proposal).toBeNull();
  await act(async () => { await context.reportSession!.guide('private unavailable issue'); });
  expect(ports.anonymousSend).not.toHaveBeenCalled(); expect(ports.guide).not.toHaveBeenCalled();
});

it('unrelated allAI remains usable after leaving report mode', async () => {
  ports.open.mockResolvedValue(proposal());
  ports.anonymousCreate.mockResolvedValue('fake-general-session');
  ports.anonymousSend.mockResolvedValue({ ok: true, status: 200, body: {} });
  render(<AllAIProvider><Probe /></AllAIProvider>);
  await act(async () => { context.openReportIssue('order-fixture'); });
  await act(async () => { context.leaveReportIssue(); await context.sendMessage('General marketplace question'); });
  expect(ports.anonymousSend).toHaveBeenCalledTimes(1);
  expect(ports.anonymousSend.mock.calls[0][0].message).toBe('General marketplace question');
  expect(context.messages.some(m => m.content === 'General marketplace question')).toBe(true);
});
