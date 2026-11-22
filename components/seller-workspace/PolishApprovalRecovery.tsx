"use client";

import { useEffect, useState, type RefObject } from "react";
import { confirmPolishRemovals, readPolishReview, reviewError, type CompletedReview, type ReviewError } from "@/api/listingPolish";
import type { SavedListingDraft } from "@/api/sellerListingDraft";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";
import { PolishDiscard, polishButton } from "./PolishDiscard";
import { pendingPolishAccept } from "./pendingPolishAccept";
import { polishFailure, usePolishAction, type ReloadDraft } from "./usePolishAction";

export function PolishApprovalRecovery({ refusal, draft, displayedVersion, reload, active, dirty, lock, onBusy, onResolved, onDiscarded, onEdit }: {
  refusal: ReviewError;
  draft: SavedListingDraft | null;
  displayedVersion: number;
  reload?: ReloadDraft;
  active: boolean;
  dirty?: boolean;
  lock?: RefObject<boolean>;
  onBusy?: (busy: boolean) => void;
  onResolved: () => void;
  onDiscarded: (draft: SavedListingDraft | null) => void;
  onEdit?: () => void;
}) {
  const [reviews, setReviews] = useState<Record<string, CompletedReview>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [done, setDone] = useState(new Set<string>());
  const [checked, setChecked] = useState(new Set<string>());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [refreshedDraft, setRefreshedDraft] = useState<SavedListingDraft | null>(null);
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
        if (run.status !== "completed" || run.run_id !== id) throw new Error("Review unavailable");
        if (!request.signal.aborted) setReviews(current => ({ ...current, [id]: run }));
      }).catch(() => { if (!request.signal.aborted) setUnavailable(true); });
    }
    return () => request.abort();
  }, [active, refusal]);

  const required = [
    ...refusal.stale_removals?.flatMap(group => group.change_ids.map(id => removalKey(group.review_run_id, id))) ?? [],
    ...refusal.facts?.map(fact => factKey(fact.review_run_id, fact.fact_id)) ?? [],
  ];
  const blocked = !active || dirty || !draft?.draft_id || !reload || !!action.status || stale;
  function confirm(runId: string, removals: string[], facts: string[]) {
    if (blocked || !draft?.draft_id || !reload || pendingPolishAccept()) return;
    void action.run(copy.confirming, async signal => {
      setError("");
      setNotice("");
      const version = refreshedDraft && refreshedDraft.draft_id === draft.draft_id && refreshedDraft.review_run_id === draft.review_run_id
        ? Math.max(draft.version, refreshedDraft.version) : draft.version;
      const body = { request_id: crypto.randomUUID(), draft_version: version, change_ids: removals, fact_confirmations: facts };
      let refreshed: SavedListingDraft | null | undefined;
      try {
        const { result } = await action.mutate(() => confirmPolishRemovals(runId, body, signal),
          signal, async signal => { refreshed = await reload(signal); return refreshed; },
          () => undefined, { confirmDraftId: draft.draft_id });
        if (result.draft_moved) { setStale(true); setError(copy.confirmationStale); return; }
        const next = new Set([...done,
          ...result.confirmed_change_ids.map(id => removalKey(runId, id)),
          ...result.confirmed_fact_ids.map(id => factKey(runId, id)),
        ]);
        setDone(next);
        if (required.every(key => next.has(key))) onResolved();
      } catch (failure) {
        if (signal.aborted) return;
        if (reviewError(failure).code === "REVIEW_STALE" && refreshed) {
          if (refreshed.draft_id !== draft.draft_id || refreshed.review_run_id !== draft.review_run_id) {
            setStale(true);
            setError(copy.confirmationStale);
            return;
          }
          setRefreshedDraft(refreshed);
          setDone(new Set());
          setChecked(new Set());
          setNotice(copy.confirmationRefreshed);
        } else setError(polishFailure(failure, copy.actionFailed, true));
      }
    });
  }

  const factRuns = new Set(refusal.facts?.map(fact => fact.review_run_id));
  return <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-900">
    <p role="alert">{refusal.message || (refusal.stale_removals?.length ? copy.staleRemovals :
      refusal.facts?.length ? copy.facts : copy.conflict)}</p>
    {unavailable && <p role="alert">{copy.recoveryUnavailable}</p>}
    {draft?.review_run_id && reload && <PolishDiscard
      key={`${draft.draft_id}:${draft.review_run_id}`} runId={draft.review_run_id} version={draft.version}
      disabled={!active || dirty || draft.version !== displayedVersion || !!action.status}
      reload={reload} lock={lock} onSharedBusy={onBusy} onRemoved={onDiscarded} />}
    {refusal.stale_removals?.map(group => <ul key={group.review_run_id} className="space-y-2">
      {group.change_ids.map(id => {
        if (done.has(removalKey(group.review_run_id, id))) return null;
        const change = reviews[group.review_run_id]?.proposal.changes.find(item => item.change_id === id);
        return change && <li key={id} className="flex flex-wrap items-center gap-3">
          <del className="whitespace-pre-wrap break-words">{change.text}</del>
          <button type="button" className={polishButton} disabled={blocked}
            onClick={() => confirm(group.review_run_id, [id], [])}>{copy.confirmRemoval}</button>
        </li>;
      })}
    </ul>)}
    {[...factRuns].flatMap(runId => {
      const missing = new Set(refusal.facts?.filter(item => item.review_run_id === runId && !done.has(factKey(runId, item.fact_id)))
        .map(item => item.fact_id));
      const changes = reviews[runId]?.proposal.changes.filter(change =>
        change.fact_units.some(fact => missing.has(fact.fact_id))) ?? [];
      return changes.map(change => {
        const selection = change.fact_units.map(fact => fact.fact_id);
        return <fieldset key={`${runId}:${change.change_id}`} className="space-y-2" disabled={blocked}>
          <legend className="mb-2 whitespace-pre-wrap break-words font-medium">{change.text}</legend>
          {change.fact_units.map(fact => {
            const key = factKey(runId, fact.fact_id);
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
          <button type="button" className={polishButton} disabled={!selection.every(id => checked.has(factKey(runId, id)))}
            onClick={() => confirm(runId, [], selection)}>{copy.confirmFacts}</button>
        </fieldset>;
      });
    })}
    {onEdit && <button type="button" className={polishButton} disabled={!active || !!action.status} onClick={onEdit}>{copy.reword}</button>}
    {action.status && <p role="status">{action.status}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
  </div>;
}

const removalKey = (runId: string, id: string) => `${runId}:removal:${id}`;
const factKey = (runId: string, id: string) => `${runId}:fact:${id}`;
