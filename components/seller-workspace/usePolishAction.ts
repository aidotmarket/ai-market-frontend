"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { reviewError, retryReviewRequest } from "@/api/listingPolish";
import type { SavedListingDraft } from "@/api/sellerListingDraft";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";

export type ReloadDraft = (signal: AbortSignal) => Promise<SavedListingDraft | null>;

export function usePolishAction(editorLock?: RefObject<boolean>, onBusy?: (busy: boolean) => void) {
  const controller = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => () => {
    if (!controller.current) return;
    controller.current.abort();
    controller.current = null;
    if (editorLock) editorLock.current = false;
    onBusy?.(false);
  }, [editorLock, onBusy]);

  async function reloadDraft(reload: ReloadDraft, signal: AbortSignal,
    receipt?: { draft_id: string; draft_version: number; draft_moved: boolean }) {
    // Only the read is retried once the mutation has a definite outcome.
    while (!signal.aborted) {
      try {
        const draft = await reload(signal);
        if (receipt && !receipt.draft_moved && (!draft || draft.draft_id === receipt.draft_id &&
            draft.version < receipt.draft_version)) throw new Error("Draft read predates the mutation");
        return draft;
      } catch {
        if (signal.aborted) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    signal.throwIfAborted();
    return null;
  }

  async function mutate<T extends { draft_moved: boolean }>(
    send: () => Promise<T>, signal: AbortSignal, reload: ReloadDraft,
    receipt: (result: T) => { draft_id: string; draft_version: number; draft_moved: boolean } | undefined,
  ) {
    let unknown = false;
    let result: T;
    try {
      result = await retryReviewRequest(send, signal, () => { unknown = true; });
    } catch (error) {
      if (!signal.aborted && (unknown || reviewError(error).draft_moved)) await reloadDraft(reload, signal);
      throw error;
    }
    const saved = receipt(result);
    const draft = saved || result.draft_moved ? await reloadDraft(reload, signal, saved) : undefined;
    return { result, draft };
  }

  async function run(message: string, action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current || editorLock?.current) return;
    const request = new AbortController();
    controller.current = request;
    if (editorLock) editorLock.current = true;
    onBusy?.(true);
    setStatus(message);
    try {
      await action(request.signal);
    } finally {
      if (controller.current === request) {
        controller.current = null;
        if (editorLock) editorLock.current = false;
        onBusy?.(false);
        if (!request.signal.aborted) setStatus("");
      }
    }
  }
  return { status, run, mutate, reloadDraft };
}

export function polishFailure(error: unknown, fallback = copy.actionFailed) {
  const { code, message } = reviewError(error);
  switch (code) {
    case "REQUEST_REUSED": return copy.reused;
    case "REVIEW_STALE": return message === copy.confirmationStale ? copy.confirmationStale : copy.stale;
    case "REVIEW_SELECTION_INCOMPLETE": return copy.incomplete;
    case "REVIEW_CONFLICT": return message || copy.conflict;
    case "FACT_CONFIRMATION_REQUIRED": return copy.acceptFacts;
    case "REVIEW_DISCARDED": return copy.discarded;
    case "REVIEW_SUPERSEDED": return copy.superseded;
    case "REVIEW_DRAFT_IN_PROGRESS": return copy.inProgress;
    case "REVIEW_VALIDATION_FAILED": return message || copy.validation;
    default: return fallback;
  }
}
