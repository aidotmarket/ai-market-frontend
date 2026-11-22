"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { sessionLifecycle } from "@/api/connector-seller-settings";
import { reviewError, reviewStatus, retryReviewRequest, uncertainReviewMutation } from "@/api/listingPolish";
import type { SavedListingDraft } from "@/api/sellerListingDraft";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";

export type ReloadDraft = (signal: AbortSignal, onLoaded?: () => void,
  verify?: (draft: SavedListingDraft | null) => void) => Promise<SavedListingDraft | null>;

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

  const reloadDraft = useCallback(async (reload: ReloadDraft, signal: AbortSignal,
    receipt?: { draft_id: string; draft_version: number; draft_moved: boolean }) => {
    const sameSession = sessionLifecycle();
    const verify = (draft: SavedListingDraft | null) => {
      if (receipt && !receipt.draft_moved && (!draft || draft.draft_id === receipt.draft_id &&
          draft.version < receipt.draft_version)) throw new Error("Draft read predates the mutation");
    };
    for (let delay = 1000; !signal.aborted && sameSession(); delay = Math.min(delay * 2, 10_000)) {
      try {
        const draft = await reload(signal, undefined, verify);
        signal.throwIfAborted();
        if (!sameSession()) throw new Error("SESSION_CHANGED");
        verify(draft);
        return draft;
      } catch (error) {
        if (signal.aborted || !sameSession()) break;
        const status = reviewStatus(error);
        setStatus(status === 401 || status === 403 ? copy.reloadSession : copy.reloading);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    signal.throwIfAborted();
    throw new Error("SESSION_CHANGED");
  }, []);

  const mutate = useCallback(async <T extends { draft_moved: boolean }>(
    send: () => Promise<T>, signal: AbortSignal, reload: ReloadDraft,
    receipt: (result: T) => { draft_id: string; draft_version: number; draft_moved: boolean } | undefined,
    { accept = false, replaying = false, confirmDraftId }: {
      accept?: boolean; replaying?: boolean; confirmDraftId?: string | null;
    } = {},
  ) => {
    let unknown = replaying;
    let retries = 0;
    let result: T;
    try {
      result = await retryReviewRequest(send, signal, error => {
        if (accept && unknown) {
          // Only a recorded refusal proves that the same request reached the
          // replay lookup. Admission can fail before that lookup.
          const { code, draft_moved } = reviewError(error);
          if (reviewStatus(error) === 409 && (code === "REQUEST_REUSED" ||
            typeof code === "string" && typeof draft_moved === "boolean")) return false;
          return true;
        }
        return uncertainReviewMutation(error);
      }, () => {
        unknown = true;
        if (accept) {
          retries += 1;
          setStatus(retries >= 4 ? copy.acceptRetryLong : copy.acceptRetry);
        }
      });
    } catch (error) {
      const refusal = reviewError(error);
      const staleConfirmation = !!confirmDraftId && refusal.code === "REVIEW_STALE";
      if (!signal.aborted && (unknown || refusal.draft_moved || staleConfirmation)) {
        const minimum = staleConfirmation && refusal.draft_version !== undefined
          ? { draft_id: confirmDraftId, draft_version: refusal.draft_version, draft_moved: false } : undefined;
        await reloadDraft(reload, signal, minimum);
      }
      throw error;
    }
    const saved = receipt(result);
    const draft = saved || result.draft_moved ? await reloadDraft(reload, signal, saved) : undefined;
    return { result, draft };
  }, [reloadDraft]);

  const run = useCallback(async (message: string, action: (signal: AbortSignal) => Promise<void>) => {
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
  }, [editorLock, onBusy]);
  return { status, run, mutate, reloadDraft };
}

export function polishFailure(error: unknown, fallback = copy.actionFailed, confirming = false) {
  const { code, message } = reviewError(error);
  switch (code) {
    case "REQUEST_REUSED": return copy.reused;
    case "REVIEW_STALE": return confirming ? copy.confirmationStale : copy.stale;
    case "REVIEW_SELECTION_INCOMPLETE": return copy.incomplete;
    case "REVIEW_CONFLICT": return message || copy.conflict;
    case "FACT_CONFIRMATION_REQUIRED": return confirming ? message || copy.facts : copy.acceptFacts;
    case "REVIEW_DISCARDED": return copy.discarded;
    case "REVIEW_SUPERSEDED": return copy.superseded;
    case "REVIEW_DRAFT_IN_PROGRESS": return copy.inProgress;
    case "REVIEW_VALIDATION_FAILED": return message || copy.validation;
    default: return fallback;
  }
}
