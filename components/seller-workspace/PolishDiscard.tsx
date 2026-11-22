"use client";

import { useState, type RefObject } from "react";
import { discardPolish, type DiscardPreview } from "@/api/listingPolish";
import type { SavedListingDraft } from "@/api/sellerListingDraft";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";
import { sentenceDiff } from "./listingPolishText";
import { pendingPolishAccept } from "./pendingPolishAccept";
import { polishFailure, usePolishAction, type ReloadDraft } from "./usePolishAction";
import { WorkspaceConfirmation } from "./WorkspacePanel";

export const polishButton = "rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50";
export function PolishDiscard({ runId, version, disabled, reload, onRemoved, lock, onBusy, onSharedBusy }: {
  runId: string;
  version: number;
  disabled?: boolean;
  reload: ReloadDraft;
  onRemoved: (draft: SavedListingDraft | null) => void;
  lock?: RefObject<boolean>;
  onBusy?: (busy: boolean) => void;
  onSharedBusy?: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState<DiscardPreview | null>(null);
  const [error, setError] = useState("");
  const action = usePolishAction(lock, onSharedBusy);
  const send = (confirmation?: DiscardPreview) => {
    if (disabled || pendingPolishAccept()) return;
    void action.run(copy.removing, async signal => {
      onBusy?.(true);
      setError("");
      const body = {
        request_id: crypto.randomUUID(),
        expected_draft_version: confirmation?.draft_version ?? version,
        ...(confirmation ? { preview_receipt: confirmation.preview_receipt } : {}),
      };
      try {
        const { result, draft } = await action.mutate(
          () => discardPolish(runId, body, signal), signal, reload,
          () => undefined, // The discarded draft may be retired. Read the current pointer below.
        );
        if ("preview_receipt" in result) setPreview(result);
        else {
          const saved = result.draft_moved ? draft ?? null : await action.reloadDraft(reload, signal);
          setPreview(null);
          onRemoved(saved);
        }
      } catch (failure) {
        if (!signal.aborted) setError(polishFailure(failure));
      } finally {
        if (!signal.aborted) onBusy?.(false);
      }
    });
  };

  return <div className="space-y-2">
    <button type="button" className={polishButton} disabled={disabled || !!action.status || !!preview}
      onClick={() => send()}>{copy.remove}</button>
    {action.status && <p role="status">{action.status}</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {preview && <WorkspaceConfirmation label={copy.confirmRemove}>
      <p>{preview.lost_edits.length ? copy.loss : copy.updatedPreview}</p>
      <ul className="space-y-3">{preview.lost_edits.map(({ field, current, restored, expected }) => {
        const text = typeof current === "string" ? current : "";
        const diff = typeof expected === "string" ? sentenceDiff(expected, text) : undefined;
        return <li key={field} className="space-y-1">
          <h4 className="font-semibold">{copy.fields[field]}</h4>
          {diff ? <div className="whitespace-pre-wrap break-words">
            <p>{copy.withoutEdits}</p>
            {diff.map(({ kind, text }, i) => kind === "same" ? <span key={i}>{text}</span> :
              kind === "before" ? <del key={i} className="bg-red-100">{text}</del> :
                <ins key={i} className="bg-amber-100">{text}</ins>)}
          </div> : <>
            <p>{copy.unavailableComparison}</p>
            <p className="whitespace-pre-wrap break-words"><strong>{copy.current}</strong> {text || copy.empty}</p>
            <p className="whitespace-pre-wrap break-words"><strong>{copy.restored}</strong> {typeof restored === "string" && restored ? restored : copy.empty}</p>
          </>}
        </li>;
      })}</ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={polishButton} disabled={disabled || !!action.status}
          onClick={() => send(preview)}>{copy.confirmRemove}</button>
        <button type="button" className={polishButton} disabled={!!action.status}
          onClick={() => setPreview(null)}>{copy.cancel}</button>
      </div>
    </WorkspaceConfirmation>}
  </div>;
}
