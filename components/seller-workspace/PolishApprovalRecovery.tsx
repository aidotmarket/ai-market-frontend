"use client";

import { useEffect, useState, type RefObject } from "react";
import { confirmPolishRemovals, readPolishReview, type CompletedReview, type ReviewError } from "@/api/listingPolish";
import type { SavedListingDraft } from "@/api/sellerListingDraft";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";
import { PolishDiscard, polishButton } from "./PolishDiscard";
import { polishFailure, usePolishAction, type ReloadDraft } from "./usePolishAction";

export function PolishApprovalRecovery({ refusal, draft, reload, active, dirty, lock, onBusy, onResolved, onDiscarded, onEdit }: {
  refusal: ReviewError;
  draft: SavedListingDraft | null;
  reload?: ReloadDraft;
  active: boolean;
  dirty?: boolean;
  lock?: RefObject<boolean>;
  onBusy?: (busy: boolean) => void;
  onResolved: () => void;
  onDiscarded: () => void;
  onEdit?: () => void;
}) {
  const [reviews, setReviews] = useState<Record<string, CompletedReview>>({});
  const [done, setDone] = useState(new Set<string>());
  const [checked, setChecked] = useState(new Set<string>());
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const action = usePolishAction(lock, onBusy);

  useEffect(() => {
    if (!active) return;
    const request = new AbortController();
    const runIds = new Set([
      ...refusal.stale_removals?.map(group => group.review_run_id) ?? [],
      ...refusal.facts?.map(fact => fact.review_run_id) ?? [],
    ]);
    for (const id of runIds) {
      void readPolishReview(id, request.signal).then(run => {
        if (!request.signal.aborted && run.status === "completed") setReviews(current => ({ ...current, [id]: run }));
      }).catch(() => { /* The edit action remains available if the run cannot be read. */ });
    }
    return () => request.abort();
  }, [active, refusal]);

  const removalCount = refusal.stale_removals?.reduce((total, group) => total + group.change_ids.length, 0) ?? 0;
  const required = removalCount + (refusal.facts?.length ?? 0);
  const evidenceChanged = refusal.removals_required || refusal.message?.startsWith(copy.evidenceChanged);
  function confirm(runId: string, removals: string[], facts: string[]) {
    if (!draft || !reload || stale) return;
    void action.run(copy.confirming, async signal => {
      setError("");
      const body = { request_id: crypto.randomUUID(), draft_version: draft.version, change_ids: removals, fact_confirmations: facts };
      try {
        const { result } = await action.mutate(() => confirmPolishRemovals(runId, body, signal),
          signal, reload, () => undefined);
        if (result.draft_moved) { setStale(true); setError(copy.confirmationStale); return; }
        const next = new Set([...done,
          ...result.confirmed_change_ids.map(id => `${runId}:${id}`),
          ...result.confirmed_fact_ids.map(id => `${runId}:${id}`),
        ]);
        setDone(next);
        if (next.size === required) onResolved();
      } catch (failure) {
        if (!signal.aborted) setError(polishFailure(failure));
      }
    });
  }

  const factRuns = new Set(refusal.facts?.map(fact => fact.review_run_id));
  return <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-900">
    <p role="alert">{evidenceChanged ? refusal.message : removalCount ? copy.staleRemovals : copy.facts}</p>
    {evidenceChanged && draft?.review_run_id && reload && <PolishDiscard
      key={draft.review_run_id} runId={draft.review_run_id} version={draft.version}
      disabled={!active || dirty} reload={reload} lock={lock} onSharedBusy={onBusy} onRemoved={onDiscarded} />}
    {refusal.stale_removals?.map(group => <ul key={group.review_run_id} className="space-y-2">
      {group.change_ids.map(id => {
        if (done.has(`${group.review_run_id}:${id}`)) return null;
        const change = reviews[group.review_run_id]?.proposal.changes.find(item => item.change_id === id);
        return change && <li key={id} className="flex flex-wrap items-center gap-3">
          <del className="whitespace-pre-wrap break-words">{change.text}</del>
          <button type="button" className={polishButton} disabled={!active || !draft || !reload || !!action.status || stale}
            onClick={() => confirm(group.review_run_id, [id], [])}>{copy.confirmRemoval}</button>
        </li>;
      })}
    </ul>)}
    {[...factRuns].map(runId => {
      const missing = new Set(refusal.facts?.filter(item => item.review_run_id === runId && !done.has(`${runId}:${item.fact_id}`))
        .map(item => item.fact_id));
      const facts = [...new Map(reviews[runId]?.proposal.changes.flatMap(change => change.fact_units)
        .filter(fact => missing.has(fact.fact_id)).map(fact => [fact.fact_id, fact])).values()];
      if (!facts.length) return null;
      const selection = facts.filter(fact => checked.has(`${runId}:${fact.fact_id}`)).map(fact => fact.fact_id);
      return <fieldset key={runId} className="space-y-2" disabled={!active || !draft || !reload || !!action.status || stale}>
        {facts.map(fact => {
          const key = `${runId}:${fact.fact_id}`;
          return <label key={key} className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 accent-indigo-700" checked={checked.has(key)}
              onChange={event => {
                const isChecked = event.target.checked;
                setChecked(current => {
                  const next = new Set(current);
                  if (isChecked) next.add(key); else next.delete(key);
                  return next;
                });
              }} />
            <span>{copy.confirmFact} <strong>{fact.value}</strong></span>
          </label>;
        })}
        <button type="button" className={polishButton} disabled={!selection.length}
          onClick={() => confirm(runId, [], selection)}>{copy.confirmFacts}</button>
      </fieldset>;
    })}
    {onEdit && <button type="button" className={polishButton} disabled={!active || !!action.status} onClick={onEdit}>{copy.reword}</button>}
    {action.status && <p role="status">{action.status}</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
  </div>;
}
