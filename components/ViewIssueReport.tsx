'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { reportView, type ViewReport, type ViewReportReceipt, type ViewReportTarget } from '@/api/view-reports';
import { support } from '@/api/support';
import type { RecoveryPort } from '@/api/support-recovery';
import { authSessionOwner, isAuthSessionOwner } from '@/lib/auth-session-owner';
import { useAuthStore } from '@/store/auth';
import type { RecoveryAdapter, RecoveryBinding } from '@/lib/session-view-recovery';
import { selectedRecoveryTicket } from '@/lib/session-view-recovery';

export const viewTargetKey = (target: ViewReportTarget) => target.view === 'wallet' ? 'wallet:' + target.wallet_offset
  : target.view === 'request_thread' ? target.request_id + ':' + target.response_id : target.support_ref;

// Visit memory owns the exact POST, draft and immutable receipt across uncertainty.
// A selection generation can retire this visit; returning to its key cannot revive it.
export function useReportedView(failed: boolean, adapter: RecoveryAdapter): { binding: RecoveryBinding | null; control: ReactNode } {
  const latest = useRef(adapter); latest.current = adapter;
  const scope = adapter.reportTarget ? viewTargetKey(adapter.reportTarget) : null;
  const selectionGeneration = adapter.selectionGeneration?.();
  const generation = useRef({ scope, value: 0 });
  if (generation.current.scope !== scope) generation.current = { scope, value: generation.current.value + 1 };
  const [visit, setVisit] = useState<{
    generation: number; owner: number; principal: string | undefined; target: ViewReportTarget;
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
  const retained = useRef<{ owner: number; report: typeof reportState.current; target: ViewReportTarget }[]>([]);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const valid = (v: NonNullable<typeof visit>) => live.current && v.generation === generation.current.value
    && isAuthSessionOwner(v.owner) && !!v.principal && useAuthStore.getState().user?.id === v.principal
    && latest.current.selectionGeneration?.() === v.selectionGeneration
    && !!useAuthStore.getState().token && latest.current.current();
  useEffect(() => {
    if (!failed || !adapter.reportTarget || (visit && valid(visit))) return;
    if (visit) retained.current.push({ owner: visit.owner,
      report: { ...reportState.current, unknown: reportState.current.unknown || (!!command.current && !receipt) }, target: visit.target });
    const label = adapter.view === 'wallet' ? 'wallet' : adapter.view === 'request_thread' ? 'request conversation' : 'support conversation';
    setVisit({ generation: generation.current.value, owner: authSessionOwner(), principal: useAuthStore.getState().user?.id,
      target: adapter.reportTarget, failure: adapter.failure ?? 'normal_read_failed', id: crypto.randomUUID(), selectionGeneration });
    setDescription('My ' + label + ' could not be displayed.'); setOpen(false); setReviewed(false);
    setBusy(false); setUnknown(false); setReceipt(null); setBinding(null); setError(null); command.current = null; flight.current = false;
  }, [failed, scope, selectionGeneration, adapter.failure]); // The owning controller supplies scope and failure.
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
      const unrelatedSelection = selectedRecoveryTicket();
      const b: RecoveryBinding = { ref: result.public_ref, conversation: result.conversation_id,
        operation: { view: visit.target.view, failure: visit.failure, target: viewTargetKey(visit.target) },
        current: () => valid(visit) && selectedRecoveryTicket() === unrelatedSelection,
        snapshot: () => ({ saved_drafts: { report: reportState.current, retained: retained.current, unrelated: unrelatedSelection?.snapshot() }, unsent_text: reportState.current.description,
          conversation_selection: { target: visit.target, report: visit.id, receipt: result, unrelated: unrelatedSelection?.ref },
          unknown_mutations: { command: submitted, unknown: reportState.current.unknown }, generation: visit.generation }),
        port: support as RecoveryPort };
      setBinding(b);
    } catch { if (valid(visit)) { setUnknown(true); setError('The report result is unknown. Your text and report identity are retained. You can retry this same report.'); } }
    finally { if (valid(visit)) { flight.current = false; setBusy(false); } }
  };
  const control = <section aria-label="Report this view issue">
    {retained.current.filter(r => isAuthSessionOwner(r.owner)).map((r, i) => <details key={i}><summary>Earlier report retained for its original selection</summary>
      <p>{r.report.description}</p>{r.report.receipt && <p>Report {r.report.receipt.public_ref}</p>}
      {r.report.unknown && <p>Its result remains unknown. No command has been replayed.</p>}</details>)}
    {!open && !receipt && <button type="button" onClick={() => setOpen(true)}>Report Issue</button>}
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
      <p>Your report is retained in its own support conversation. Your original selections and drafts remain here.</p></div>}
  </section>;
  return { binding, control };
}
