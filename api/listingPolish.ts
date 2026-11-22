import axios from "axios";
import { nativeRead, sessionLifecycle } from "./connector-seller-settings";
import { postSessionMutation } from "./session-mutation";

const path = "/seller-workspace/listing-review";
export const listingPolishEnabled = () => process.env.NEXT_PUBLIC_LISTING_REVIEW_ENABLED === "true";
export const reviewFields = ["title", "description", "tags"] as const;
export type ReviewField = typeof reviewFields[number];
export type ReviewLanguage = "en" | "es";
export type ReviewTarget = { draft_id: string } | { listing_id: string; expected_base_version_id: string };
type Revision = { expected_draft_version: number } | { expected_base_version: string };
type Explanation = { why_for_buyers: string; rubric_id: string; quote_ids: string[] };
type Edit = { start: number; end: number; order: number; text: string };
export type ReviewChange = {
  change_id: string;
  field: ReviewField;
  text: string;
  kind: "added" | "removed" | "reworded" | "retained";
  original_ids: string[];
  edits?: Edit[];
  requires_confirmation: boolean;
  fact_units: { fact_id: string; value: string }[];
};
type OriginalField = { text: string; sentences: { sentence_id: string; text: string; sha256: string }[] };
type RunIdentity = {
  run_id: string;
  basis: "published" | "successor_draft" | "unpublished_draft";
  revision_ref: { draft_id?: string; draft_version?: number; base_listing_version_id?: string };
  inherited_run_id?: string;
};
export type CompletedReview = RunIdentity & {
  status: "completed";
  original: Partial<Record<ReviewField, OriginalField>>;
  proposal: {
    changes: ReviewChange[];
    explanations: Explanation[];
    questions: string[];
    evidence_questions: { question: string }[];
    atomic_groups: { change_ids: string[] }[];
  };
};
type LanguageReview = RunIdentity & { status: "awaiting_language"; question: string; choices: ReviewLanguage[] };
export type ReviewRun = CompletedReview | LanguageReview | (RunIdentity & {
  status: "running" | "expired" | "failed"; message?: string;
});
export type ReviewEvent =
  | { event: "explanation"; data: Explanation }
  | { event: "language_required"; data: LanguageReview }
  | { event: "review_completed"; data: CompletedReview }
  | { event: "review_failed"; data: { run_id: string; message: string } };

export type Provenance = Partial<Record<ReviewField, {
  sentence_hash: string; provenance: "seller-typed" | "proposed";
}[]>>;
export type AcceptResult = {
  draft_id: string; draft_version: number; draft_moved: boolean;
  accepted_change_ids: string[]; provenance_summary: Provenance;
};
type FieldValue = string | { $absent: true };
export type DiscardPreview = {
  draft_version: number; preview_receipt: string; draft_moved: boolean;
  lost_edits: { field: ReviewField; current: FieldValue; restored: FieldValue; expected?: string }[];
};
export type DiscardResult = DiscardPreview | {
  draft_id: string; draft_version: number; draft_moved: boolean; discarded: true; message: string;
};
export type ReviewError = {
  code?: string; message?: string; change_ids?: string[]; fact_ids?: string[];
  additional_change_ids?: string[];
  draft_moved?: boolean; draft_version?: number; removals_required?: number;
  stale_removals?: { review_run_id: string; change_ids: string[] }[];
  facts?: { review_run_id: string; fact_id: string }[];
};

export function reviewError(error: unknown): ReviewError {
  if (!axios.isAxiosError(error)) return {};
  const detail = error.response?.data?.detail;
  return typeof detail === "object" && detail !== null ? detail :
    typeof detail === "string" ? { message: detail } : {};
}
export const reviewStatus = (error: unknown) => axios.isAxiosError(error) ? error.response?.status : undefined;
export const reviewNetworkFailure = (error: unknown) => axios.isAxiosError(error) &&
  (!error.response && ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "") ||
    [408, 504].includes(error.response?.status ?? 0));

export function uncertainReviewMutation(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (!status || status >= 500 || status === 408 || status === 429) return true;
  const detail = error.response?.data?.detail;
  const { message, code } = reviewError(error);
  const hasRefusal = message || code || status === 422 && Array.isArray(detail);
  return !(status >= 400 && status < 500 && hasRefusal);
}

export async function retryReviewRequest<T>(
  send: () => Promise<T>, signal: AbortSignal, shouldRetry = reviewNetworkFailure, onRetry?: () => void,
): Promise<T> {
  const sameSession = sessionLifecycle();
  for (let delay = 500; ; delay = Math.min(delay * 2, 5000)) {
    signal.throwIfAborted();
    if (!sameSession()) throw new Error("SESSION_CHANGED");
    try {
      const result = await send();
      signal.throwIfAborted();
      if (!sameSession()) throw new Error("SESSION_CHANGED");
      return result;
    } catch (error) {
      signal.throwIfAborted();
      if (!shouldRetry(error)) throw error;
      onRetry?.();
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function reviewAvailable(signal: AbortSignal): Promise<boolean> {
  // The pinned API has no capabilities route. Its read dependencies check the
  // flag and seller allowlist before validating the path UUID. This probe cannot
  // load a run, start a review or reserve quota.
  try {
    await nativeRead(`${path}/availability`, { signal });
    return false;
  } catch (error) {
    return reviewStatus(error) === 422 && !!reviewError(error).message;
  }
}

export const readPolishReview = (runId: string, signal: AbortSignal) =>
  nativeRead<ReviewRun>(`${path}/${encodeURIComponent(runId)}`, { signal });

export async function streamPolishReview(action: ReviewTarget | { runId: string; language: ReviewLanguage },
  signal: AbortSignal, onEvent: (event: ReviewEvent) => void) {
  const request_id = crypto.randomUUID();
  const [url, body] = "runId" in action
    ? [`${path}/${encodeURIComponent(action.runId)}/language`, { request_id, language: action.language }]
    : [path, { request_id, ...action }];

  return retryReviewRequest(async () => {
    const deadline = AbortSignal.timeout(120_000);
    const attempt = AbortSignal.any([signal, deadline]);
    try {
      const stream = await postSessionMutation<ReadableStream<Uint8Array>>(
        url, body, undefined, undefined, undefined, { signal: attempt, adapter: "fetch", responseType: "stream" },
      );
      await readReviewStream(stream, attempt, onEvent);
    } catch (error) {
      if (deadline.aborted && !signal.aborted) throw new axios.AxiosError("Review stream timed out", "ETIMEDOUT");
      if (axios.isAxiosError(error) && error.response?.data instanceof ReadableStream) {
        // Axios returns the failure body as a stream too.
        try { error.response.data = await new Response(error.response.data).json(); } catch { /* Non-JSON HTTP failure. */ }
      }
      throw error;
    }
  }, signal);
}

async function readReviewStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal,
  onEvent: (event: ReviewEvent) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read().catch(() => {
        throw new axios.AxiosError("Review stream interrupted", "ERR_NETWORK");
      });
      signal.throwIfAborted();
      if (done) throw new axios.AxiosError("Review stream ended early", "ERR_NETWORK");
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const lines = frame.split(/\r?\n/);
        const event = lines.find(line => line.startsWith("event: "))?.slice(7);
        if (event !== "language_required" && event !== "review_completed" && event !== "review_failed" && event !== "explanation") continue;
        const data = JSON.parse(lines.filter(line => line.startsWith("data: ")).map(line => line.slice(6)).join("\n"));
        onEvent({ event, data } as ReviewEvent);
        if (event !== "explanation") return;
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function post<T>(runId: string, action: string, body: object, signal: AbortSignal) {
  return postSessionMutation<T>(`${path}/${encodeURIComponent(runId)}/${action}`, body,
    undefined, undefined, undefined, { signal, timeout: 15_000 });
}
export type AcceptPolishBody = Revision & {
  request_id: string; change_ids: string[]; fact_confirmations: string[];
};
export async function acceptPolish(runId: string, body: AcceptPolishBody, signal: AbortSignal) {
  const result = await post<AcceptResult>(runId, "accept", body, signal);
  if (!result || typeof result.draft_id !== "string" || !Number.isSafeInteger(result.draft_version) ||
    typeof result.draft_moved !== "boolean" || !Array.isArray(result.accepted_change_ids)) {
    throw new axios.AxiosError("Accept response could not be verified", "ERR_BAD_RESPONSE");
  }
  return result;
}
export const discardPolish = (runId: string, body: {
  request_id: string; expected_draft_version: number; preview_receipt?: string;
}, signal: AbortSignal) => post<DiscardResult>(runId, "discard", body, signal);
export const confirmPolishRemovals = (runId: string, body: {
  request_id: string; draft_version: number; change_ids: string[]; fact_confirmations: string[];
}, signal: AbortSignal) => post<{
  draft_id: string; draft_version: number; confirmed_change_ids: string[]; confirmed_fact_ids: string[]; draft_moved: boolean;
}>(runId, "confirm-removals", body, signal);
