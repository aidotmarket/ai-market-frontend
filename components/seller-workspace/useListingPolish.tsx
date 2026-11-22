"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { acceptPolish, reviewAvailable, reviewError, reviewFields, reviewStatus, streamPolishReview,
  type AcceptPolishBody, type CompletedReview, type Provenance, type ReviewLanguage, type ReviewRun, type ReviewTarget } from "@/api/listingPolish";
import type { SavedListingDraft } from "@/api/sellerListingDraft";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";
import { PolishDiscard, polishButton } from "./PolishDiscard";
import { expandReviewSelection, reviewBaseline, sentenceDiff } from "./listingPolishText";
import { finishPolishAccept, pendingPolishAccept, queuePolishAccept, usePendingPolishAccept } from "./pendingPolishAccept";
import { polishFailure, usePolishAction, type ReloadDraft } from "./usePolishAction";

export type ListingPolishOptions = {
  draft: SavedListingDraft | null;
  published?: { listing_id: string; expected_base_version_id: string };
  publishedTitle?: string;
  onPublishedDraft?: (draftId: string) => void;
  reload: ReloadDraft;
  lock: RefObject<boolean>;
  sharedBusy?: boolean;
  onBusy?: (busy: boolean) => void;
};

export function useListingPolish(options: ListingPolishOptions | undefined, active: boolean, dirty: boolean,
  saving: boolean, displayed: { id: string | null | undefined; version: number | undefined },
  adoptDraft: (draft: SavedListingDraft | null, publishedDescription?: string) => void) {
  const [available, setAvailable] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [explanations, setExplanations] = useState<string[]>([]);
  const [selected, setSelected] = useState(new Set<string>());
  const [confirmed, setConfirmed] = useState(new Set<string>());
  const [accepted, setAccepted] = useState(new Set<string>());
  const [provenance, setProvenance] = useState<Provenance>({});
  const [ended, setEnded] = useState(false);
  const [discarding, setDiscarding] = useState<{ draftId: string; runId: string; version: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stream = useRef<AbortController | null>(null);
  const runTarget = useRef<string | undefined>(undefined);
  const action = usePolishAction(options?.lock, options?.onBusy);
  const pending = usePendingPolishAccept(!!options);
  const [settledAccept, setSettledAccept] = useState<typeof pending>(null);
  useLayoutEffect(() => {
    if (settledAccept) finishPolishAccept(settledAccept);
  }, [settledAccept]);
  const enabled = !!options;
  const draftId = options?.draft?.draft_id;
  const target: ReviewTarget | undefined = options?.published ?? (draftId ? { draft_id: draftId } : undefined);
  const targetKey = target && ("draft_id" in target ? target.draft_id :
    `${target.listing_id}:${target.expected_base_version_id}`);
  const canStart = enabled && !!target;

  useEffect(() => {
    if (!canStart || !active) return;
    const request = new AbortController();
    void reviewAvailable(request.signal).then(value => {
      if (!request.signal.aborted) setAvailable(value);
    });
    return () => request.abort();
  }, [canStart, active]);
  useEffect(() => () => stream.current?.abort(), []);
  useEffect(() => {
    if (runTarget.current === targetKey) return;
    stream.current?.abort();
    stream.current = null;
    setStreaming(false);
  }, [targetKey]);
  const binding = options?.draft?.review_run_id;
  const currentRun = runTarget.current === targetKey ? run : null;
  const completed = currentRun?.status === "completed" ? currentRun : null;
  const remaining = completed?.proposal.changes.filter(change => !accepted.has(change.change_id)) ?? [];
  const ownBusy = !!pending || !!action.status || !!discarding;
  const busy = ownBusy || !!options?.sharedBusy;
  const showingDraft = !!draftId && displayed.id === draftId && displayed.version === options?.draft?.version;

  async function requestReview(input: ReviewTarget | { runId: string; language: ReviewLanguage }) {
    if (!active || stream.current || options?.lock.current || pendingPolishAccept() || saving || dirty || draftId && !showingDraft) return;
    const request = new AbortController();
    stream.current = request;
    runTarget.current = targetKey;
    setStreaming(true);
    setError("");
    setNotice("");
    setExplanations([]);
    if (!("runId" in input)) {
      setRun(null);
      setEnded(false);
      setSelected(new Set());
      setConfirmed(new Set());
      setAccepted(new Set());
      setProvenance({});
    }
    try {
      await streamPolishReview(input, request.signal, event => {
        if (request.signal.aborted) return;
        switch (event.event) {
          case "explanation":
            setExplanations(current => [...new Set([...current, event.data.why_for_buyers])]);
            break;
          case "review_completed":
            if (event.data.basis === "published" && !options?.draft) {
              adoptDraft(null, event.data.original.description?.text);
            }
            setRun(event.data);
            break;
          case "language_required":
            setRun(event.data);
            break;
          case "review_failed":
            setRun(null);
            setError(event.data.message || copy.failed);
        }
      });
    } catch (failure) {
      if (request.signal.aborted) return;
      if (reviewStatus(failure) === 404) { setAvailable(false); setRun(null); }
      else {
        const { message, code } = reviewError(failure);
        setError(code ? polishFailure(failure, copy.failed) : reviewStatus(failure) === 422 && message || copy.failed);
      }
    } finally {
      if (stream.current === request) stream.current = null;
      if (!request.signal.aborted) setStreaming(false);
    }
  }

  function toggle(id: string, select: boolean) {
    if (!completed) return;
    const group = expandReviewSelection(completed, [id]);
    setSelected(current => {
      const next = new Set(current);
      for (const member of group) {
        if (select && !accepted.has(member)) next.add(member);
        else next.delete(member);
      }
      return next;
    });
  }

  const accept = () => {
    if (!active || !options || options.lock.current || !completed || ended || dirty || saving || streaming ||
      !selected.size || (draftId ? !showingDraft : !options.published)) return;
    const draft = options.draft;
    const base = completed.revision_ref.base_listing_version_id;
    if (completed.basis === "published" ? !options.published || base !== options.published.expected_base_version_id :
      completed.revision_ref.draft_id !== draftId) return;
    const first = binding !== completed.run_id;
    const version = first ? completed.revision_ref.draft_version : draft?.version;
    const revision = first && completed.basis === "published" && base
      ? { expected_base_version: base } : version ? { expected_draft_version: version } : null;
    if (!revision) return;
    const runId = completed.run_id;
    const change_ids = [...selected];
    const facts = remaining.filter(change => selected.has(change.change_id)).flatMap(change => change.fact_units);
    if (facts.some(fact => !confirmed.has(fact.fact_id))) return;
    const body: AcceptPolishBody = {
      ...revision, request_id: crypto.randomUUID(), change_ids,
      fact_confirmations: [...new Set(facts.map(fact => fact.fact_id))],
    };
    queuePolishAccept(runId, body);
  };

  const executeAccept = useEffectEvent((entry: NonNullable<typeof pending>) => {
    if (!options || !entry.sameSession()) return;
    void action.run(copy.applying, async signal => {
      const { runId, body, sent: replaying } = entry;
      entry.sent = true;
      setError("");
      setNotice("");
      try {
        const { result, draft: saved } = await action.mutate(
          () => acceptPolish(runId, body, signal), signal, options.reload, result => result, { replaying },
        );
        if (!entry.sameSession()) return;
        const matching = saved?.draft_id === result.draft_id;
        if (!options.published || matching) adoptDraft(saved ?? null);
        if (matching && options.published) options.onPublishedDraft?.(result.draft_id);
        setAccepted(current => new Set([...current, ...result.accepted_change_ids]));
        setSelected(new Set());
        setProvenance(matching && saved?.version === result.draft_version
          ? result.provenance_summary : {});
        if (result.draft_moved || !matching) {
          setEnded(true);
          setError(copy.stale);
        } else setNotice(copy.applied);
      } catch (failure) {
        if (signal.aborted || !entry.sameSession()) return;
        if (reviewStatus(failure) === 404) {
          setAvailable(false); setRun(null); setError(copy.unavailable);
          return;
        }
        const { code, change_ids, additional_change_ids } = reviewError(failure);
        if (code === "REVIEW_SELECTION_INCOMPLETE" && completed?.run_id === runId) {
          const named = [...(change_ids ?? []), ...(additional_change_ids ?? [])]
            .filter(id => remaining.some(change => change.change_id === id));
          setSelected(current => expandReviewSelection(completed, [...current, ...named]));
        }
        if (code === "REVIEW_STALE" || code === "REVIEW_SUPERSEDED" || code === "REVIEW_DISCARDED") setEnded(true);
        setError(polishFailure(failure));
      } finally {
        if (!signal.aborted) setSettledAccept(entry);
      }
    });
  });
  useEffect(() => {
    if (pending && active) executeAccept(pending);
  }, [active, pending]);

  function end() {
    stream.current?.abort();
    stream.current = null;
    setStreaming(false);
    setEnded(true);
  }

  const discard = discarding ?? (draftId && binding && options?.draft
    ? { draftId, runId: binding, version: options.draft.version } : null);
  const panel = enabled && (available && target || discard || notice || error || ownBusy) ? <section aria-label={copy.title}
    className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-5">
    <h3 className="text-lg font-semibold text-indigo-950">{copy.title}</h3>
    {available && target && <>
      {binding && <p className="text-sm text-gray-700">{copy.supersession}</p>}
      <button type="button" className={polishButton} disabled={busy || saving || streaming || dirty || !!draftId && !showingDraft}
        onClick={() => void requestReview(target)}>{currentRun || ended ? copy.restart : copy.start}</button>
      {streaming && <div role="status" className="space-y-2 text-sm text-indigo-900">
        <p>{copy.reviewing}</p>{explanations.map(line => <p key={line}>{line}</p>)}
      </div>}
      {currentRun?.status === "awaiting_language" && !streaming && <fieldset disabled={busy || saving} className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-medium">{currentRun.question}</legend>
        {currentRun.choices.map(language => <button key={language} type="button" className={polishButton}
          onClick={() => void requestReview({ runId: currentRun.run_id, language })}>{copy.language[language]}</button>)}
      </fieldset>}
      {completed && !ended && <fieldset disabled={busy || streaming || saving} className="min-w-0 space-y-4">
        {completed.proposal.explanations.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">
          {[...new Set(completed.proposal.explanations.map(item => item.why_for_buyers))].map(item => <li key={item}>{item}</li>)}
        </ul>}
        {!remaining.length && <p className="text-sm">{accepted.size ? copy.allApplied : copy.noSuggestions}</p>}
        {reviewFields.map(field => {
          const changes = remaining.filter(change => change.field === field);
          if (!changes.length) return null;
          const original = completed.original[field];
          return <section key={field} aria-label={copy.fields[field]} className="space-y-2">
            <h4 className="font-semibold">{copy.fields[field]}</h4>
            {changes.map(change => <div key={change.change_id} className="space-y-2 rounded-lg border border-indigo-100 bg-white p-3 text-sm">
              <p className="font-medium text-indigo-900">{copy.suggests}</p>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-indigo-700" checked={selected.has(change.change_id)}
                  aria-label={copy.use + " " + (change.text.trim() || copy.fields[field])}
                  onChange={event => toggle(change.change_id, event.target.checked)} />
                <span className="whitespace-pre-wrap break-words">
                  {original?.sentences.filter(sentence => change.original_ids.includes(sentence.sentence_id)).map(sentence =>
                    <span key={sentence.sentence_id} className="block"><span className="mr-2 text-xs font-medium text-gray-600">{copy.wording}</span>
                      <del className="bg-red-50">{sentence.text}</del></span>)}
                  {change.kind !== "removed" && <ins className="block bg-green-50">{change.text}</ins>}
                  {change.kind === "retained" && original && renderGrouping(completed, field, change.change_id)}
                </span>
              </label>
              {selected.has(change.change_id) && <button type="button" className={polishButton}
                onClick={() => toggle(change.change_id, false)}>{copy.keep}</button>}
              {completed.proposal.atomic_groups.some(group => group.change_ids.length > 1 &&
                group.change_ids.includes(change.change_id)) && <p className="text-xs text-gray-700">{copy.grouped}</p>}
              {change.fact_units.map(fact => <label key={fact.fact_id} className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-indigo-700" checked={confirmed.has(fact.fact_id)}
                  onChange={event => {
                    const checked = event.target.checked;
                    setConfirmed(current => {
                      const next = new Set(current);
                      if (checked) next.add(fact.fact_id); else next.delete(fact.fact_id);
                      return next;
                    });
                  }} />
                <span>{copy.confirmFact} <strong>{fact.value}</strong></span>
              </label>)}
            </div>)}
          </section>;
        })}
        {remaining.length > 0 && <>
          {dirty && <p className="text-sm text-gray-700">{copy.dirty}</p>}
          <button type="button" className={polishButton} disabled={dirty || !!draftId && !showingDraft || !selected.size ||
            remaining.some(change => selected.has(change.change_id) && change.fact_units.some(fact => !confirmed.has(fact.fact_id)))}
            onClick={accept}>{copy.accept}</button>
        </>}
        <SellerWording run={completed} provenance={provenance} />
        {[...new Set([...completed.proposal.questions, ...completed.proposal.evidence_questions.map(item => item.question)])]
          .map(question => <p key={question} className="text-sm">{question}</p>)}
      </fieldset>}
    </>}
    {(action.status || pending) && <p role="status" className="text-sm font-semibold text-indigo-900">{action.status || copy.applying}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-900">{notice}</p>}
    {discard && options && <PolishDiscard key={`${discard.draftId}:${discard.runId}`} runId={discard.runId} version={discard.version}
      disabled={!active || !showingDraft || dirty || saving || streaming || !!pending || !!action.status}
      lock={options.lock} onBusy={busy => setDiscarding(busy ? discard : null)} onSharedBusy={options.onBusy}
      reload={options.reload} onRemoved={saved => {
        const publicationText = completed?.basis === "published" ? completed.original.description?.text : undefined;
        if (options.published && saved?.draft_id !== discard.draftId) adoptDraft(null, publicationText);
        else adoptDraft(saved);
        setRun(null);
        setError("");
        setNotice(saved?.draft_id === discard.draftId && saved?.review_run_id ? copy.removedWithEarlierReview : copy.removed);
      }} />}
  </section> : null;

  return { panel, busy, ownBusy, hasRemaining: streaming || !!completed && !ended && remaining.length > 0, end };
}

function renderGrouping(run: CompletedReview, field: typeof reviewFields[number], id: string) {
  const after = reviewBaseline(run, field, expandReviewSelection(run, [id]));
  if (after === undefined) return null;
  return sentenceDiff(run.original[field]?.text ?? "", after).map(({ kind, text }, index) => kind === "same" ? null :
    kind === "before" ? <del key={index} className="block bg-red-50">{text}</del> :
      <ins key={index} className="block bg-green-50">{text}</ins>);
}

function SellerWording({ run, provenance }: { run: CompletedReview; provenance: Provenance }) {
  const wording = reviewFields.flatMap(field => {
    const sellerHashes = new Set(provenance[field]?.filter(unit => unit.provenance === "seller-typed").map(unit => unit.sentence_hash));
    return run.original[field]?.sentences.filter(sentence => sellerHashes.has(sentence.sha256)) ?? [];
  });
  return wording.length > 0 && <details className="text-sm">
    <summary className="cursor-pointer font-semibold">{copy.retained}</summary>
    <ul className="ml-5 list-disc">{wording.map(sentence =>
      <li key={sentence.sentence_id} className="whitespace-pre-wrap break-words">{sentence.text}</li>)}</ul>
  </details>;
}
