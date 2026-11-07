'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { reportView, type ViewReport, type ViewReportReceipt, type ViewReportTarget } from '@/api/view-reports';
import { support } from '@/api/support';
import { OrderIssueSession } from '@/lib/order-issue-report';
import { useOptionalAllAI } from '@/components/allai/AllAISupportBridge';
import type { RecoveryPort } from '@/api/support-recovery';
import { authSessionOwner, isAuthSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { useAuthStore } from '@/store/auth';
import type { RecoveryAdapter, RecoveryBinding } from '@/lib/session-view-recovery';
import { selectedRecoveryTicket } from '@/lib/session-view-recovery';

export const viewTargetKey = (target: ViewReportTarget) => target.view === 'wallet' ? 'wallet:' + target.wallet_offset
  : target.view === 'request_thread' ? target.request_id + ':' + target.response_id : target.support_ref;

interface ReportMemory {
  description: string; reviewed: boolean; command: ViewReport | null; unknown: boolean; receipt: ViewReportReceipt | null;
}
interface RetainedReport {
  owner: number; principal: string | undefined; id: string; report: ReportMemory; target: ViewReportTarget;
  failure: ViewReport['failure']; conversation: OrderIssueSession | null;
}
// Same-owner memory also survives a mounted request/wallet controller replacement.
// It contains no executable recovery packet and never enters browser storage.
const retainedReports: RetainedReport[] = [];
let memoryIdentity = 0;
const memoryListeners = new Set<() => void>();
const clearRetainedReports = () => {
  memoryIdentity++;
  retainedReports.forEach(r => r.conversation?.retire());
  retainedReports.splice(0);
  memoryListeners.forEach(listener => listener());
};
subscribeAuthSessionOwner(clearRetainedReports);
let watchingPrincipal = false;
function watchReportPrincipal() {
  if (watchingPrincipal) return;
  watchingPrincipal = true;
  let principal = useAuthStore.getState().user?.id;
  useAuthStore.subscribe(state => {
    if (state.user?.id === principal) return;
    principal = state.user?.id;
    clearRetainedReports();
  });
}

// Visit memory owns the exact POST, draft and immutable receipt across uncertainty.
// A selection generation can retire this visit; returning to its key cannot revive it.
export function useReportedView(failed: boolean, adapter: RecoveryAdapter): { binding: RecoveryBinding | null; control: ReactNode } {
  const allai = useOptionalAllAI();
  const conversation = useRef<OrderIssueSession | null>(null);
  const latest = useRef(adapter); latest.current = adapter;
  const scope = adapter.reportTarget ? viewTargetKey(adapter.reportTarget) : null;
  const selectionGeneration = adapter.selectionGeneration?.();
  const serial = useRef(0);
  const [identityRevision, setIdentityRevision] = useState(memoryIdentity);
  const generation = useRef({ scope, value: 0 });
  if (generation.current.scope !== scope) generation.current = { scope, value: generation.current.value + 1 };
  const [visit, setVisit] = useState<{
    identity: number; serial: number; generation: number; owner: number; principal: string | undefined; target: ViewReportTarget;
    failure: ViewReport['failure']; id: string; selectionGeneration: unknown;
  } | null>(null);
  const [open, setOpen] = useState(false), [description, setDescription] = useState(''), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ViewReportReceipt | null>(null);
  const [binding, setBinding] = useState<RecoveryBinding | null>(null);
  const command = useRef<ViewReport | null>(null);
  const flight = useRef(false);
  const live = useRef(true);
  const reportState = useRef({ description, reviewed, command: command.current, unknown, receipt });
  reportState.current = { description, reviewed, command: command.current, unknown, receipt };
  const retained = useRef(retainedReports);
  const retention = useRef({ visit, open }); retention.current = { visit, open };
  const retainVisit = () => {
    const v = retention.current.visit;
    if (!v || v.identity !== memoryIdentity || v.principal !== useAuthStore.getState().user?.id || !isAuthSessionOwner(v.owner) || !(retention.current.open || command.current || reportState.current.receipt)) return;
    if (retained.current.some(r => r.owner === v.owner && r.id === v.id)) return;
    retained.current.push({ owner: v.owner, principal: v.principal, id: v.id,
      report: { ...reportState.current, command: command.current, unknown: reportState.current.unknown || (!!command.current && !reportState.current.receipt) },
      target: v.target, failure: v.failure, conversation: conversation.current });
  };
  useEffect(() => { live.current = true; return () => { retainVisit(); live.current = false; }; }, []);
  useEffect(() => {
    if (!adapter.reportTarget) return;
    watchReportPrincipal();
    const changed = () => setIdentityRevision(memoryIdentity);
    memoryListeners.add(changed); changed();
    return () => { memoryListeners.delete(changed); };
  }, [!!adapter.reportTarget]);
  const valid = (v: NonNullable<typeof visit>) => live.current && v.identity === memoryIdentity && v.serial === serial.current && v.generation === generation.current.value
    && isAuthSessionOwner(v.owner) && !!v.principal && useAuthStore.getState().user?.id === v.principal
    && latest.current.selectionGeneration?.() === v.selectionGeneration
    && !!useAuthStore.getState().token && latest.current.current();
  useEffect(() => {
    if (!adapter.reportTarget || (visit && valid(visit)) || (!failed && !visit && !retained.current.length)) return;
    retainVisit();
    const label = adapter.view === 'wallet' ? 'wallet' : adapter.view === 'request_thread' ? 'request conversation' : 'support conversation';
    setVisit({ identity: memoryIdentity, serial: ++serial.current, generation: generation.current.value, owner: authSessionOwner(), principal: useAuthStore.getState().user?.id,
      target: adapter.reportTarget, failure: adapter.failure ?? 'normal_read_failed', id: crypto.randomUUID(), selectionGeneration });
    conversation.current = null;
    setDescription('My ' + label + ' could not be displayed.'); setOpen(false); setReviewed(false);
    setBusy(false); setUnknown(false); setReceipt(null); setBinding(null); setError(null); command.current = null; flight.current = false;
  }, [failed, scope, selectionGeneration, adapter.failure, identityRevision]); // The owning controller supplies scope and failure.
  useEffect(() => {
    if (!visit || !receipt || !valid(visit)) return;
    const unrelatedSelection = selectedRecoveryTicket();
    const b: RecoveryBinding = { ref: receipt.public_ref, conversation: receipt.conversation_id,
      operation: { view: visit.target.view, failure: visit.failure, target: viewTargetKey(visit.target) },
      current: () => valid(visit) && selectedRecoveryTicket() === unrelatedSelection,
      snapshot: () => ({ saved_drafts: { report: reportState.current, retained: retained.current.map(r => ({ owner: r.owner, report: r.report, target: r.target, failure: r.failure, conversation: r.conversation?.recoverySnapshot() })), conversation: conversation.current?.recoverySnapshot(), unrelated: unrelatedSelection?.snapshot() }, unsent_text: reportState.current.description,
        conversation_selection: { target: visit.target, report: visit.id, receipt, unrelated: unrelatedSelection?.ref },
        unknown_mutations: { command: command.current, unknown: reportState.current.unknown }, generation: visit.generation }),
      port: support as RecoveryPort };
    setBinding(b);
  }, [visit, receipt]);
  if (!visit || !valid(visit)) return { binding: null, control: null };
  const send = async () => {
    if (!valid(visit) || flight.current || receipt || !reviewed || !description.trim()) return;
    flight.current = true;
    command.current ??= Object.freeze({ ...visit.target, report_id: visit.id, failure: visit.failure, description });
    const submitted = command.current;
    const assert = () => { if (!valid(visit) || command.current !== submitted) throw new Error('Report visit changed'); };
    setBusy(true); setError(null);
    try {
      const result = await reportView(submitted, assert); assert();
      setReceipt(result); setUnknown(false);
      conversation.current = OrderIssueSession.conversation(result, support);
    } catch { if (valid(visit)) { setUnknown(true); setError('The report result is unknown. Your text and report identity are retained. You can retry this same report.'); } }
    finally { if (valid(visit)) { flight.current = false; setBusy(false); } }
  };
  const resumeReport = (r: typeof retained.current[number]) => {
    if (r.principal !== useAuthStore.getState().user?.id || !isAuthSessionOwner(r.owner) || viewTargetKey(r.target) !== scope || !latest.current.current() || flight.current) return;
    // A new visit owns the old immutable command; executable recovery is never restored.
    const index = retained.current.indexOf(r);
    if (index < 0) return;
    retained.current.splice(index, 1);
    if (open || command.current || receipt)
      retained.current.push({ owner: visit.owner, principal: visit.principal, id: visit.id, report: { ...reportState.current }, target: visit.target, failure: visit.failure, conversation: conversation.current });
    setVisit({ ...visit, serial: ++serial.current, target: r.target, failure: r.failure, id: r.id });
    command.current = r.report.command;
    setDescription(r.report.description); setReviewed(r.report.reviewed); setUnknown(r.report.unknown);
    setReceipt(r.report.receipt); setBinding(null); setOpen(true); setError(null);
    conversation.current = r.conversation;
  };
  const control = <section aria-label="Report this view issue">
    {retained.current.filter(r => isAuthSessionOwner(r.owner) && r.principal === useAuthStore.getState().user?.id).map((r, i) => <details key={i}><summary>Earlier report retained for its original selection</summary>
      <p>{r.report.description}</p>{r.report.receipt && <p>Report {r.report.receipt.public_ref}</p>}
      {r.report.unknown && <p>Its result remains unknown. No command has been replayed.</p>}
      {viewTargetKey(r.target) === scope && <button onClick={() => resumeReport(r)}>Reconcile this earlier report</button>}</details>)}
    {failed && !open && !receipt && <button type="button" onClick={() => setOpen(true)}>Report Issue</button>}
    {open && !receipt && <>
      <p>Tell allAI support what happened. The view and selection are included automatically.</p>
      <label>Description<textarea value={description} maxLength={4000} disabled={busy || !!command.current}
        onChange={e => { setDescription(e.target.value); setReviewed(false); }} /></label>
      <label><input type="checkbox" checked={reviewed} disabled={busy || !!command.current}
        onChange={e => setReviewed(e.target.checked)} />I have reviewed this report and want to send it.</label>
      <button type="button" disabled={busy || !reviewed || !description.trim()} onClick={() => void send()}>{unknown ? 'Retry same report' : 'Confirm and send report'}</button>
      {error && <p role="alert">{error}</p>}
    </>}
    {receipt && <div role="status"><p>{receipt.acknowledgement.body}</p><p>Report {receipt.public_ref}. Important email is pending.</p>
      <p>Your report is retained in its own support conversation. Your original selections and drafts remain here.</p>
      <button type="button" onClick={() => {
        if (!valid(visit) || !conversation.current?.current()) return;
        allai?.openSupportConversation?.(conversation.current);
      }}>Open report conversation in allAI</button></div>}
  </section>;
  return { binding, control };
}
