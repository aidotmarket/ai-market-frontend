// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { AxiosError } from "axios";
import SellerListingEditor from "./SellerListingEditor";
import SellerApproval from "./SellerApproval";
import SavedListingEditor from "./SavedListingEditor";
import SellerPublications from "./SellerPublications";
import { GuidedListingFlow } from "./GuidedListingFlow";
import { resetSellerListingDraftOwnerForTests, SellerListingDraftProvider, useSellerListingDraft } from "./SellerListingDraftStore";
import { WorkspacePanel } from "./WorkspacePanel";
import { advanceAuthSessionOwner } from "@/lib/auth-session-owner";
import type { WorkspaceView } from "./WorkspaceOverview";
import { EMPTY_LISTING_DRAFT, type SavedListingDraft } from "@/api/sellerListingDraft";
import type { ListingReview } from "@/api/sellerListingReview";
import { listingPolishEnabled, type CompletedReview } from "@/api/listingPolish";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";

const mocks = vi.hoisted(() => ({
  post: vi.fn(), read: vi.fn(), reload: vi.fn(), save: vi.fn(), approve: vi.fn(), approvalDraft: null as SavedListingDraft | null,
  readDraft: vi.fn(), saveDraft: vi.fn(), readPublications: vi.fn(),
}));
vi.mock("@/api/session-mutation", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/session-mutation")>(), postSessionMutation: mocks.post,
}));
vi.mock("@/api/connector-seller-settings", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/connector-seller-settings")>(),
  nativeRead: mocks.read,
}));
vi.mock("@/api/sellerListingReview", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/sellerListingReview")>(), approveListingReview: mocks.approve,
}));
vi.mock("@/api/sellerListingDraft", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/sellerListingDraft")>(),
  readListingDraft: mocks.readDraft, saveListingDraft: mocks.saveDraft,
}));
vi.mock("@/api/sellerListingPublication", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/sellerListingPublication")>(), readPublicationPage: mocks.readPublications,
}));
vi.mock("@/api/capabilities", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/capabilities")>(), getCapabilities: async () => ({}),
}));
vi.mock("./SellerListingDraftStore", async importOriginal => ({
  ...await importOriginal<typeof import("./SellerListingDraftStore")>(),
  useOptionalSellerListingDraft: () => ({ draft: mocks.approvalDraft, reload: mocks.reload }),
}));

const path = "/seller-workspace/listing-review";
const original = "Plain sentence. Keep this.";
const applied = "Clear sentence. Keep this.";
const draft: SavedListingDraft = {
  draft_id: "draft", version: 7, updated_at: "", content: { ...EMPTY_LISTING_DRAFT, description: original },
};
const accepted = {
  draft_id: "draft", draft_version: 8, draft_moved: false, accepted_change_ids: ["a"],
  provenance_summary: { description: [{ sentence_hash: "keep-hash", provenance: "seller-typed" }] },
};
const reviewed: SavedListingDraft = {
  ...draft, version: 8, review_run_id: "run", content: { ...draft.content, description: applied },
};
const completed: CompletedReview = {
  run_id: "run", status: "completed", basis: "unpublished_draft",
  revision_ref: { draft_id: "draft", draft_version: 7 },
  original: { description: { text: original, sentences: [
    { sentence_id: "description:0", text: "Plain sentence.", sha256: "old-hash" },
    { sentence_id: "description:1", text: "Keep this.", sha256: "keep-hash" },
  ] } },
  proposal: { explanations: [{ why_for_buyers: "This makes the purpose clearer.", rubric_id: "purpose", quote_ids: [] }],
    questions: [], evidence_questions: [], atomic_groups: [], changes: [{
      change_id: "a", field: "description", kind: "reworded", original_ids: ["description:0"],
      text: "Clear sentence.", fact_units: [], requires_confirmation: false,
      edits: [{ start: 0, end: 15, order: 0, text: "Clear sentence." }],
    }, {
      change_id: "b", field: "description", kind: "removed", original_ids: ["description:1"],
      text: "Keep this.", fact_units: [], requires_confirmation: true,
    }] },
};
function http(status: number, detail: unknown) { return { isAxiosError: true, response: { status, data: { detail } } }; }
function sse(event: string, payload: unknown, lead = "") {
  const text = ": heartbeat\n\n" + lead + "event: " + event + "\ndata: " + JSON.stringify(payload) + "\n\n";
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.subarray(0, 19)); controller.enqueue(bytes.subarray(19)); controller.close();
  } });
}
function pending<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve };
}
function Editor({ initial = draft, refetch = { ...initial, version: initial.version + 1,
  content: { ...initial.content, description: "Another tab saved this." } } }: {
  initial?: SavedListingDraft; refetch?: SavedListingDraft;
}) {
  const [current, setCurrent] = useState(initial);
  const lock = useRef(false);
  return <><button onClick={() => setCurrent(refetch)}>Independent draft refetch</button>
    <SellerListingEditor initialContent={current.content} savedVersion={current.version} onNext={() => {}} onSave={async (fields, baseline) => {
      const version = await mocks.save(fields, baseline);
      setCurrent({ ...current, content: fields, version });
      return version;
    }} listingPolish={listingPolishEnabled() ? { draft: current, lock, reload: async signal => {
      const saved = await mocks.reload(signal);
      if (saved) setCurrent(saved);
      return saved;
    } } : undefined} /></>;
}
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const description = () => screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;
const choose = () => fireEvent.click(screen.getByRole("checkbox", { name: "Use suggestion Clear sentence." }));
const settle = async () => { await act(async () => {}); };
async function start(run = completed) {
  mocks.post.mockResolvedValueOnce(sse("review_completed", run));
  render(<Editor />);
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText(run.proposal.changes[0].text);
}
beforeEach(() => {
  vi.resetAllMocks();
  resetSellerListingDraftOwnerForTests();
  vi.stubEnv("NEXT_PUBLIC_LISTING_REVIEW_ENABLED", "true");
  sessionStorage.clear();
  mocks.read.mockImplementation(path => path.endsWith("/availability")
    ? Promise.reject(http(422, "Request validation failed")) : Promise.resolve(completed));
  mocks.reload.mockResolvedValue(reviewed);
  mocks.save.mockImplementation((_: unknown, version: number) => Promise.resolve(version + 1));
});
afterEach(() => {
  cleanup();
  advanceAuthSessionOwner(false);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("makes no review requests with the frontend flag off", async () => {
  vi.stubEnv("NEXT_PUBLIC_LISTING_REVIEW_ENABLED", "");
  render(<Editor initial={reviewed} />); await settle();
  expect(screen.queryByRole("button", { name: copy.start })).toBeNull();
  expect(screen.queryByRole("button", { name: copy.remove })).toBeNull();
  expect(description().readOnly).toBe(false);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
});
it("uses path validation status without depending on the backend message", async () => {
  mocks.read.mockRejectedValue(http(422, "Invalid review identifier."));
  render(<Editor />);
  expect(await screen.findByRole("button", { name: copy.start })).toBeTruthy();
});
it("hides the entry when the backend responds with 404 before start", async () => {
  mocks.read.mockRejectedValue(http(404, "Listing review not found."));
  render(<Editor />); await settle();
  expect(mocks.read).toHaveBeenCalledWith(path + "/availability", { signal: expect.any(AbortSignal) });
  expect(screen.queryByRole("button", { name: copy.start })).toBeNull();
  expect(mocks.post).not.toHaveBeenCalled();
});
it("keeps bound drafts removable when the backend has disabled new reviews", async () => {
  mocks.read.mockRejectedValue(http(404, "Listing review not found."));
  mocks.post.mockResolvedValueOnce({ draft_id: "draft", draft_version: 9, draft_moved: false, discarded: true });
  mocks.reload.mockResolvedValueOnce({ ...draft, version: 9 });
  render(<Editor initial={reviewed} />);
  await settle();
  expect(screen.queryByRole("button", { name: copy.start })).toBeNull();
  fireEvent.click(button(copy.remove));
  await screen.findByText(copy.removed);
  expect(mocks.post.mock.calls[0].slice(0, 2)).toEqual([path + "/run/discard", {
    request_id: expect.any(String), expected_draft_version: 8,
  }]);
});
it("hides a previously available entry when the backend is turned off", async () => {
  const unavailable = new Response(JSON.stringify({ detail: "Listing review not found." })).body;
  mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404, data: unavailable } });
  render(<Editor />);
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await waitFor(() => expect(screen.queryByRole("region", { name: copy.title })).toBeNull());
});
it("streams the review and submits a fresh request id for the language choice", async () => {
  mocks.post.mockResolvedValueOnce(sse("language_required", {
    run_id: "run", status: "awaiting_language", question: "Choose the review language.", choices: ["en", "es"],
  })).mockResolvedValueOnce(sse("review_completed", completed,
    'event: explanation\ndata: {"why_for_buyers":"This makes the purpose clearer."}\n\n'));
  render(<Editor initial={{ ...draft, review_run_id: "earlier" }} />);
  expect(await screen.findByText(copy.supersession)).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  fireEvent.click(await screen.findByRole("button", { name: "Spanish" }));
  expect(await screen.findByText("This makes the purpose clearer.")).toBeTruthy();
  const [[startPath, startBody], [languagePath, languageBody]] = mocks.post.mock.calls;
  expect(startPath).toBe(path);
  expect(startBody).toEqual({ draft_id: "draft", request_id: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  expect(languagePath).toBe(path + "/run/language");
  expect(languageBody).toEqual({ language: "es", request_id: expect.any(String) });
  expect(languageBody.request_id).not.toBe(startBody.request_id);
});

it("never autosaves, disables accept while dirty, and warns before explicit Save or Next", async () => {
  await start(); choose();
  expect(button(copy.accept).disabled).toBe(false);
  fireEvent.change(description(), { target: { value: "Seller edit" } });
  fireEvent.blur(description()); await settle();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(button(copy.accept).disabled).toBe(true);
  fireEvent.click(button("Next: Review →"));
  const dialog = screen.getByRole("alertdialog", { name: copy.confirmSave });
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: copy.cancel }));
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(button("Save private draft"));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: copy.save }));
  await waitFor(() => expect(screen.queryByRole("button", { name: copy.accept })).toBeNull());
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ description: "Seller edit" }), 7);
});

it("warns before saving during a stream and ignores its later suggestions", async () => {
  const stream = pending<ReadableStream<Uint8Array>>();
  mocks.post.mockReturnValueOnce(stream.promise);
  render(<Editor />);
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  fireEvent.change(description(), { target: { value: "Save during the review." } });
  fireEvent.click(button("Save private draft"));
  const warning = screen.getByRole("alertdialog", { name: copy.confirmSave });
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(within(warning).getByRole("button", { name: copy.save }));
  await waitFor(() => expect(screen.queryByText(copy.reviewing)).toBeNull());
  await act(async () => stream.resolve(sse("review_completed", completed)));
  expect(description().value).toBe("Save during the review.");
  expect(screen.queryByRole("button", { name: copy.accept })).toBeNull();
  expect(button(copy.restart).disabled).toBe(false);
});

it("groups suggestions before sending and requires all selected fact units", async () => {
  await start({ ...completed, proposal: { ...completed.proposal, atomic_groups: [{ change_ids: ["a", "b"] }],
    changes: completed.proposal.changes.map(change => change.change_id === "b"
      ? { ...change, fact_units: [{ fact_id: "fact", value: "2024" }] } : change) } });
  choose();
  expect(screen.getByRole("checkbox", { name: "Use suggestion Keep this." })).toHaveProperty("checked", true);
  expect(button(copy.accept).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Confirm fact 2024" }));
  mocks.post.mockResolvedValueOnce({ ...accepted, accepted_change_ids: ["a", "b"] });
  fireEvent.click(button(copy.accept));
  await screen.findByText(copy.applied);
  expect(mocks.post.mock.lastCall?.[1]).toMatchObject({ change_ids: ["a", "b"], fact_confirmations: ["fact"] });
});

it.each([
  ["REVIEW_STALE", copy.stale], ["REVIEW_CONFLICT", "These suggestions no longer match your draft."],
  ["REVIEW_SELECTION_INCOMPLETE", copy.incomplete], ["FACT_CONFIRMATION_REQUIRED", copy.acceptFacts],
  ["REVIEW_DRAFT_IN_PROGRESS", copy.inProgress], ["REVIEW_VALIDATION_FAILED", "Shorten these tags before trying again."],
  ["REVIEW_SUPERSEDED", copy.superseded], ["REVIEW_DISCARDED", copy.discarded], ["REQUEST_REUSED", copy.reused],
])("handles definite %s with no draft write or reload", async (code, message) => {
  await start(); choose();
  mocks.post.mockRejectedValueOnce(http(409, { code, message, change_ids: ["a"], additional_change_ids: ["b"] }));
  fireEvent.click(button(copy.accept));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", message);
  expect(description().readOnly).toBe(false);
  expect(description().value).toBe(original);
  expect(mocks.reload).not.toHaveBeenCalled();
  if (code === "REVIEW_SELECTION_INCOMPLETE") {
    expect(screen.getByRole("checkbox", { name: "Use suggestion Keep this." })).toHaveProperty("checked", true);
    mocks.post.mockResolvedValueOnce({ ...accepted, accepted_change_ids: ["a", "b"] });
    fireEvent.click(button(copy.accept)); await screen.findByText(copy.applied);
    expect(mocks.post.mock.calls[1][1].request_id).not.toBe(mocks.post.mock.calls[2][1].request_id);
  }
});

it("keeps the editor locked until the accept and its owner draft read both finish", async () => {
  await start(); choose();
  const write = pending<typeof accepted>();
  const read = pending<SavedListingDraft>();
  mocks.post.mockReturnValueOnce(write.promise);
  mocks.reload.mockReturnValueOnce(read.promise);
  fireEvent.click(button(copy.accept));
  expect(screen.getByText(copy.applying)).toBeTruthy();
  expect(description().readOnly).toBe(true);
  fireEvent.change(description(), { target: { value: "While writing" } });
  await act(async () => write.resolve(accepted));
  expect(description().readOnly).toBe(true);
  fireEvent.change(description(), { target: { value: "While reloading" } });
  expect(description().value).toBe(original);
  await act(async () => read.resolve(reviewed));
  expect(description().value).toBe(applied);
  expect(description().readOnly).toBe(false);
  expect(screen.getByText(copy.retained)).toBeTruthy();
  fireEvent.change(description(), { target: { value: applied + " My note." } });
  expect(description().value).toBe(applied + " My note.");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("adopts the newer text observed during Accept after a definite stale refusal", async () => {
  await start(); choose();
  const refusal = pending<typeof accepted>();
  mocks.post.mockReturnValueOnce(refusal.promise.then(() => { throw http(409, { code: "REVIEW_STALE" }); }));
  fireEvent.click(button(copy.accept));
  fireEvent.click(button("Independent draft refetch"));
  expect(description()).toMatchObject({ readOnly: true, value: original });
  await act(async () => refusal.resolve(accepted));
  expect(screen.getByText(copy.stale)).toBeTruthy();
  expect(description()).toMatchObject({ readOnly: false, value: "Another tab saved this." });
  fireEvent.change(description(), { target: { value: "My next edit." } });
  fireEvent.click(button("Save private draft"));
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ description: "My next edit." }), 8);
});

it("shows a visible explanation when Accept returns 404", async () => {
  await start(); choose();
  mocks.post.mockRejectedValueOnce(http(404, "Listing review not found."));
  fireEvent.click(button(copy.accept));
  expect(await screen.findByText(copy.unavailable)).toBeTruthy();
  expect(description()).toMatchObject({ readOnly: false, value: original });
  expect(screen.queryByRole("button", { name: copy.accept })).toBeNull();
});

it("retries a dropped accept using the identical body and ignores a refetch until the outcome is known", async () => {
  await start(); choose();
  const replay = pending<typeof accepted>();
  mocks.post.mockRejectedValueOnce(new AxiosError("connection lost", "ERR_NETWORK")).mockReturnValueOnce(replay.promise);
  mocks.reload.mockResolvedValueOnce({ ...draft, version: 7 }).mockResolvedValueOnce(reviewed);
  fireEvent.click(button(copy.accept));
  fireEvent.click(button("Independent draft refetch"));
  fireEvent.change(description(), { target: { value: "Too early" } });
  expect(description().readOnly).toBe(true);
  expect(description().value).toBe(original);
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(3));
  expect(mocks.post.mock.calls[1][1]).toEqual(mocks.post.mock.calls[2][1]);
  expect(mocks.reload).not.toHaveBeenCalled();
  await act(async () => replay.resolve(accepted));
  expect(description().readOnly).toBe(true);
  await waitFor(() => expect(description().readOnly).toBe(false), { timeout: 2500 });
  expect(description().value).toBe(applied);
  expect(mocks.reload).toHaveBeenCalledTimes(2);
});

it("keeps a version-N editor locked through a timeout and a 503 on replay", async () => {
  mocks.post.mockResolvedValueOnce(sse("review_completed", completed));
  render(<Editor refetch={{ ...draft }} />);
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  choose();
  vi.useFakeTimers();
  const originalWrite = pending<typeof accepted>();
  mocks.post.mockRejectedValueOnce(new AxiosError("timeout before commit", "ECONNABORTED"))
    .mockRejectedValueOnce(http(503, "Gateway unavailable")).mockReturnValueOnce(originalWrite.promise);
  fireEvent.click(button(copy.accept));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.post).toHaveBeenCalledTimes(3);
  fireEvent.click(button("Independent draft refetch"));
  fireEvent.change(description(), { target: { value: "Typed before commit" } });
  expect(description()).toMatchObject({ readOnly: true, value: original });
  expect(mocks.reload).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  const attempts = mocks.post.mock.calls.slice(1).map(call => call.slice(0, 2));
  expect(attempts).toEqual(Array(3).fill(attempts[0]));
  expect(description().readOnly).toBe(true);
  await act(async () => originalWrite.resolve(accepted));
  expect(description()).toMatchObject({ readOnly: false, value: applied });
});

it.each([500, 502, 503, 429])("retries HTTP %s with the same Accept body", async status => {
  await start(); choose();
  vi.useFakeTimers();
  const reload = pending<SavedListingDraft>();
  mocks.post.mockRejectedValueOnce(http(status, "Try again")).mockResolvedValueOnce(accepted);
  mocks.reload.mockReturnValueOnce(reload.promise);
  fireEvent.click(button(copy.accept));
  expect(description()).toMatchObject({ readOnly: true, value: original });
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.post.mock.calls[2].slice(0, 2)).toEqual(mocks.post.mock.calls[1].slice(0, 2));
  expect(description()).toMatchObject({ readOnly: true, value: original });
  await act(async () => reload.resolve(reviewed));
  expect(description()).toMatchObject({ readOnly: false, value: applied });
});

it("reloads after an unknown Accept resolves to a definite refusal", async () => {
  await start(); choose();
  vi.useFakeTimers();
  const reload = pending<SavedListingDraft>();
  mocks.post.mockRejectedValueOnce(http(502, "Gateway unavailable"))
    .mockRejectedValueOnce(http(409, { code: "REVIEW_STALE", draft_moved: false }));
  mocks.reload.mockReturnValueOnce(reload.promise);
  fireEvent.click(button(copy.accept));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.reload).toHaveBeenCalledTimes(1);
  expect(description()).toMatchObject({ readOnly: true, value: original });
  await act(async () => reload.resolve(reviewed));
  expect(screen.getByText(copy.stale)).toBeTruthy();
  expect(description()).toMatchObject({ readOnly: false, value: applied });
});

it("keeps an unknown Accept pending when a retry cannot dispatch without a session", async () => {
  await start(); choose();
  vi.useFakeTimers();
  mocks.post.mockRejectedValueOnce(new AxiosError("Timed out", "ECONNABORTED"))
    .mockRejectedValueOnce(new Error("FIRST_PARTY_SESSION_REQUIRED")).mockResolvedValueOnce(accepted);
  fireEvent.click(button(copy.accept));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(description().readOnly).toBe(true);
  expect(mocks.reload).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByText(copy.applied)).toBeTruthy();
  expect(description()).toMatchObject({ readOnly: false, value: applied });
});

it.each([401, 403])("keeps the editor locked and explains HTTP %s after a successful Accept", async status => {
  await start(); choose();
  vi.useFakeTimers();
  mocks.post.mockResolvedValueOnce(accepted);
  mocks.reload.mockRejectedValueOnce(http(status, "Access could not be verified."));
  fireEvent.click(button(copy.accept));
  await settle();
  expect(screen.getByText(copy.reloadSession)).toBeTruthy();
  expect(description()).toMatchObject({ readOnly: true, value: original });
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(description()).toMatchObject({ readOnly: false, value: applied });
});

it.each(["success", "recorded refusal"] as const)("fences a delayed mount read after a remounted Accept reaches %s", async outcome => {
  mocks.readDraft.mockResolvedValue(draft);
  mocks.saveDraft.mockResolvedValue({ ...reviewed, version: 9 });
  const commit = pending<typeof accepted>();
  const lateMountRead = pending<SavedListingDraft>();
  mocks.post.mockResolvedValueOnce(sse("review_completed", completed))
    .mockImplementationOnce((...args) => new Promise((_resolve, reject) => {
      args[5].signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }))
    .mockImplementationOnce(async () => {
      const result = await commit.promise;
      if (outcome === "recorded refusal") throw http(409, { code: "REVIEW_STALE", draft_moved: false });
      return result;
    });
  const workspace = () => <SellerListingDraftProvider enabled sampleCapability={false}>
    <GuidedListingFlow connections={[]} capabilities={null} view="listing" navigate={() => {}}>
      <SavedListingEditor active />
    </GuidedListingFlow>
  </SellerListingDraftProvider>;
  const first = render(workspace());
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  choose();
  fireEvent.click(button(copy.accept));
  const firstAttempt = mocks.post.mock.calls[1];
  first.unmount();
  expect(firstAttempt[5].signal.aborted).toBe(true);
  mocks.readDraft.mockReturnValueOnce(lateMountRead.promise).mockResolvedValue(reviewed);
  render(workspace());
  expect(description().readOnly).toBe(true);
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(3));
  expect(mocks.post.mock.calls[2].slice(0, 2)).toEqual(firstAttempt.slice(0, 2));
  expect(description()).toMatchObject({ readOnly: true, value: original });
  fireEvent.change(description(), { target: { value: "Too early" } });
  expect(description().value).toBe(original);
  expect(mocks.readDraft).toHaveBeenCalledTimes(2);
  await act(async () => commit.resolve(accepted));
  expect(description()).toMatchObject({ readOnly: false, value: applied });
  await act(async () => lateMountRead.resolve(draft));
  expect(description()).toMatchObject({ readOnly: false, value: applied });
  fireEvent.change(description(), { target: { value: "Save from the verified version." } });
  fireEvent.click(button("Save private draft"));
  await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
    description: "Save from the verified version.",
  }), 8, expect.any(String)));
});

function ReadCurrentDraft() {
  const { reload } = useSellerListingDraft();
  return <button onClick={() => void reload()}>Read the current draft</button>;
}

it("keeps a timed-out Accept unresolved across a gated replay and an owner read of N", async () => {
  const firstCommit = pending<typeof accepted>();
  mocks.readDraft.mockResolvedValue(draft);
  mocks.post.mockResolvedValueOnce(sse("review_completed", completed));
  render(<SellerListingDraftProvider enabled sampleCapability={false}><SavedListingEditor active /><ReadCurrentDraft /></SellerListingDraftProvider>);
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  choose();
  vi.useFakeTimers();
  mocks.post.mockRejectedValueOnce(new AxiosError("Timed out while the server was still working", "ECONNABORTED"))
    .mockRejectedValueOnce(http(404, "Listing review not found.")).mockReturnValueOnce(firstCommit.promise);
  fireEvent.click(button(copy.accept));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.post.mock.calls[2].slice(0, 2)).toEqual(mocks.post.mock.calls[1].slice(0, 2));
  fireEvent.click(button("Read the current draft"));
  await settle();
  expect(mocks.readDraft).toHaveBeenCalledTimes(2);
  expect(description()).toMatchObject({ readOnly: true, value: original });
  expect(screen.queryByRole("button", { name: "Save private draft" })).toBeNull();
  expect(screen.getByText(copy.acceptRetry)).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(mocks.post.mock.calls[3].slice(0, 2)).toEqual(mocks.post.mock.calls[1].slice(0, 2));
  mocks.readDraft.mockResolvedValue(reviewed);
  await act(async () => firstCommit.resolve(accepted));
  expect(description()).toMatchObject({ readOnly: false, value: applied });
});

it.each([null, { draft_id: "draft", draft_version: 8 }, { ...accepted, draft_version: "8" }])(
  "keeps retrying an unverifiable Accept success body %j", async response => {
    await start(); choose();
    vi.useFakeTimers();
    mocks.post.mockResolvedValueOnce(response).mockResolvedValue(accepted);
    fireEvent.click(button(copy.accept));
    await settle();
    expect(description()).toMatchObject({ readOnly: true, value: original });
    expect(mocks.reload).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.post.mock.calls[2].slice(0, 2)).toEqual(mocks.post.mock.calls[1].slice(0, 2));
    expect(description()).toMatchObject({ readOnly: false, value: applied });
  },
);

it.each([http(429, "Try later"), http(400, undefined), http(403, undefined), http(500, undefined)])(
  "explains repeated uncertain Accept responses", async response => {
    await start(); choose();
    vi.useFakeTimers();
    mocks.post.mockRejectedValue(response);
    fireEvent.click(button(copy.accept));
    await settle();
    expect(screen.getByText(copy.acceptRetry)).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(3500));
    expect(screen.getByText(copy.acceptRetryLong)).toBeTruthy();
    expect(description().readOnly).toBe(true);
    expect(mocks.reload).not.toHaveBeenCalled();
  },
);

it("retires a pending Accept when the auth lifecycle changes", async () => {
  await start(); choose();
  const write = pending<typeof accepted>();
  mocks.post.mockReturnValueOnce(write.promise);
  fireEvent.click(button(copy.accept));
  cleanup();
  advanceAuthSessionOwner(false);
  render(<Editor />);
  await settle();
  expect(description()).toMatchObject({ readOnly: false, value: original });
  expect(mocks.post).toHaveBeenCalledTimes(2);
});

it("diffs later seller edits from original plus accepted and confirms the preview with a fresh id", async () => {
  await start(); choose();
  mocks.post.mockResolvedValueOnce(accepted);
  fireEvent.click(button(copy.accept)); await screen.findByText(copy.applied);
  fireEvent.change(description(), { target: { value: applied + " My later note." } });
  fireEvent.click(button("Save private draft"));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: copy.save }));
  await waitFor(() => expect(button(copy.remove).disabled).toBe(false));
  mocks.post.mockResolvedValueOnce({
    draft_version: 9, preview_receipt: "signed receipt", draft_moved: false,
    lost_edits: [{ field: "description", current: applied + " My later note.", restored: original, expected: applied }],
  }).mockResolvedValueOnce({
    draft_version: 10, preview_receipt: "replacement receipt", draft_moved: false,
    lost_edits: [{ field: "description", current: applied + " Newer note.", restored: original, expected: applied }],
  }).mockResolvedValueOnce({ draft_id: "draft", draft_version: 11, discarded: true, draft_moved: false });
  mocks.reload.mockResolvedValueOnce({ ...draft, version: 11 });
  fireEvent.click(button(copy.remove));
  const preview = await screen.findByRole("alertdialog", { name: copy.confirmRemove });
  expect(preview.querySelector("ins")?.textContent).toBe(" My later note.");
  fireEvent.click(within(preview).getByRole("button", { name: copy.confirmRemove }));
  await screen.findByText("Newer note.");
  expect(mocks.reload).toHaveBeenCalledTimes(1); // The earlier accept only.
  fireEvent.click(within(preview).getByRole("button", { name: copy.confirmRemove }));
  await screen.findByText(copy.removed);
  const first = mocks.post.mock.calls[2][1], confirmation = mocks.post.mock.calls[3][1];
  expect(first).toEqual({ request_id: expect.any(String), expected_draft_version: 9 });
  expect(confirmation).toEqual({ request_id: expect.any(String), expected_draft_version: 9, preview_receipt: "signed receipt" });
  expect(confirmation.request_id).not.toBe(first.request_id);
  expect(mocks.post.mock.calls[4][1]).toMatchObject({ expected_draft_version: 10, preview_receipt: "replacement receipt" });
  expect(description().value).toBe(original);
});

it("uses the owner baseline for changes accepted in two tabs and explains restored deletions", async () => {
  sessionStorage.setItem("listing-polish-accepted:run", JSON.stringify(["a"]));
  const baseline = "Clear sentence. Changed in another tab. Text the seller deleted.";
  const current = "Clear sentence. Changed in another tab. My later note.";
  render(<Editor initial={{ ...reviewed, version: 10, content: { ...draft.content, description: current } }} />);
  mocks.post.mockResolvedValueOnce({
    draft_version: 10, preview_receipt: "receipt", draft_moved: false,
    lost_edits: [{ field: "description", current, restored: original, expected: baseline }],
  });
  fireEvent.click(button(copy.remove));
  const preview = await screen.findByRole("alertdialog");
  expect(within(preview).getByText(copy.withoutEdits)).toBeTruthy();
  expect(preview.querySelector("ins")?.textContent).toBe(" My later note.");
  expect(preview.querySelector("del")?.textContent).toBe(" Text the seller deleted.");
  expect(preview.querySelector("ins, del")?.textContent).not.toContain("Changed in another tab.");
  expect(within(preview).getByText(copy.restored).parentElement?.textContent).toContain(original);
});

it("shows the full saved and restored fields with the pinned discard response", async () => {
  sessionStorage.setItem("listing-polish-accepted:run", JSON.stringify(["a"]));
  const current = "Clear sentence. Another tab's suggestion. My later note.";
  render(<Editor initial={{ ...reviewed, version: 10, content: { ...reviewed.content, description: current } }} />);
  mocks.post.mockResolvedValueOnce({
    draft_version: 10, preview_receipt: "receipt", draft_moved: false,
    lost_edits: [{ field: "description", current, restored: original }],
  });
  fireEvent.click(button(copy.remove));
  const preview = await screen.findByRole("alertdialog");
  expect(within(preview).getByText(copy.unavailableComparison)).toBeTruthy();
  expect(preview.querySelectorAll("ins, del")).toHaveLength(0);
  expect(preview.textContent).toContain(current);
  expect(preview.textContent).toContain(original);
});

it("explains when discarding restores the earlier review binding", async () => {
  render(<Editor initial={reviewed} />);
  mocks.post.mockResolvedValueOnce({ draft_id: "draft", draft_version: 9, draft_moved: false, discarded: true });
  mocks.reload.mockResolvedValueOnce({ ...draft, version: 9, review_run_id: "earlier" });
  fireEvent.click(button(copy.remove));
  expect(await screen.findByText(copy.removedWithEarlierReview)).toBeTruthy();
  expect(button(copy.remove).disabled).toBe(false);
});

it("replays discard after a gateway failure using its original request", async () => {
  render(<Editor initial={reviewed} />);
  vi.useFakeTimers();
  mocks.post.mockRejectedValueOnce(http(503, "Gateway unavailable"))
    .mockResolvedValueOnce({ draft_id: "draft", draft_version: 9, draft_moved: false, discarded: true });
  mocks.reload.mockResolvedValueOnce({ ...draft, version: 9 });
  fireEvent.click(button(copy.remove));
  expect(description().readOnly).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.post.mock.calls[1].slice(0, 2)).toEqual(mocks.post.mock.calls[0].slice(0, 2));
  expect(description()).toMatchObject({ readOnly: false, value: original });
});

it("uses the published revision on first accept and shows the published text again after discard", async () => {
  function PublishedEditor() {
    const [current, setCurrent] = useState<SavedListingDraft | null>(null);
    const lock = useRef(false);
    return <SellerListingEditor initialContent={current?.content} savedVersion={current?.version ?? 0} listingPolish={{
      draft: current, lock, publishedTitle: "Published title", published: {
        listing_id: "listing", expected_base_version_id: "publication",
      }, reload: async signal => {
        const saved = await mocks.reload(signal);
        setCurrent(saved);
        return saved;
      },
    }} />;
  }
  mocks.post.mockResolvedValueOnce(sse("review_completed", {
    ...completed, basis: "published", revision_ref: { base_listing_version_id: "publication" },
  })).mockResolvedValueOnce(accepted).mockResolvedValueOnce({
    draft_id: "draft", draft_version: 9, discarded: true, draft_moved: false,
  });
  mocks.reload.mockReset().mockResolvedValueOnce(reviewed).mockResolvedValueOnce(null);
  render(<PublishedEditor />);
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  expect(description().value).toBe(original);
  choose();
  fireEvent.click(button(copy.accept));
  await screen.findByText(copy.applied);
  expect(description().value).toBe(applied);
  expect(mocks.post.mock.calls[0][1]).toEqual({ request_id: expect.any(String),
    listing_id: "listing", expected_base_version_id: "publication" });
  expect(mocks.post.mock.calls[1][1]).toEqual({ request_id: expect.any(String),
    expected_base_version: "publication", change_ids: ["a"], fact_confirmations: [] });
  fireEvent.click(button(copy.remove));
  await screen.findByText(copy.removed);
  expect(description().value).toBe(original);
});

const published = { id: "pub-b", listing_id: "listing-b", listing_version_id: "revision-b",
  title: "Publication B", slug: "publication-b", status: "published", is_listed: true,
  published_at: "2026-10-22T09:00:00Z" };
const publishedRun = { ...completed, run_id: "run-b", basis: "published",
  revision_ref: { base_listing_version_id: "revision-b" },
  original: { description: { text: "Publication B's description.", sentences: [] } } };

function PublicationsWorkspace({ initialView = "manage" }: { initialView?: WorkspaceView }) {
  const [view, setView] = useState<WorkspaceView>(initialView);
  return <SellerListingDraftProvider enabled sampleCapability={false}>
    <GuidedListingFlow connections={[]} capabilities={null} view={view} navigate={setView}>
      <button onClick={() => setView("manage")}>Open publications</button>
      <button onClick={() => setView("listing")}>Open editor</button>
      <WorkspacePanel active={view === "manage"}><SellerPublications active={view === "manage"} enabled /></WorkspacePanel>
      <WorkspacePanel active={view === "listing"}><SavedListingEditor active={view === "listing"} /></WorkspacePanel>
    </GuidedListingFlow>
  </SellerListingDraftProvider>;
}

it.each([null, draft])("blocks publication Polish while the workspace editor has unsaved text", async current => {
  mocks.readPublications.mockResolvedValue({ items: [published], page: 0, has_more: false });
  mocks.readDraft.mockResolvedValue(current);
  render(<PublicationsWorkspace initialView="listing" />);
  const editor = await screen.findByRole("textbox", { name: "Description" });
  fireEvent.change(editor, { target: { value: "Unsaved workspace text." } });
  fireEvent.click(button("Open publications"));
  fireEvent.click(await screen.findByRole("button", { name: copy.title }));
  const alert = await screen.findByText(copy.dirtyPublication);
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(within(alert).getByRole("button", { name: "Describe and price" }));
  expect(description().value).toBe("Unsaved workspace text.");
  expect(screen.queryByRole("button", { name: copy.returnToDraft })).toBeNull();
});

it("opens publication B without exposing the text or discard action for bound draft A", async () => {
  mocks.readPublications.mockResolvedValue({ items: [published], page: 0, has_more: false });
  mocks.readDraft.mockResolvedValue({ ...reviewed, review_run_id: "run-a",
    content: { ...reviewed.content, title: "Draft A", description: "Draft A's accepted description." } });
  mocks.post.mockResolvedValueOnce(sse("review_completed", publishedRun))
    .mockRejectedValueOnce(http(409, { code: "REVIEW_DRAFT_IN_PROGRESS" }))
    .mockResolvedValueOnce({ draft_id: "draft", draft_version: 9, draft_moved: false, discarded: true });
  render(<PublicationsWorkspace initialView="listing" />);
  await screen.findByRole("button", { name: copy.remove });
  fireEvent.click(button("Open publications"));
  fireEvent.click(await screen.findByRole("button", { name: copy.title }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveProperty("value", "Publication B");
  expect(description().readOnly).toBe(true);
  expect(screen.queryByRole("button", { name: copy.remove })).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  expect(description().value).toBe("Publication B's description.");
  choose();
  fireEvent.click(button(copy.accept));
  expect(await screen.findByText(copy.inProgress)).toBeTruthy();
  expect(screen.queryByRole("button", { name: copy.remove })).toBeNull();
  expect(mocks.post.mock.calls[0][1]).toMatchObject({ listing_id: "listing-b", expected_base_version_id: "revision-b" });
  expect(mocks.post.mock.calls[1].slice(0, 2)).toEqual([path + "/run-b/accept",
    expect.objectContaining({ expected_base_version: "revision-b" })]);
  fireEvent.click(button(copy.returnToDraft));
  expect(description().value).toBe("Draft A's accepted description.");
  mocks.readDraft.mockResolvedValue({ ...draft, version: 9 });
  fireEvent.click(button(copy.remove));
  expect(await screen.findByText(copy.removed)).toBeTruthy();
  expect(mocks.post.mock.calls[2].slice(0, 2)).toEqual([path + "/run-a/discard",
    expect.objectContaining({ expected_draft_version: 8 })]);
});

it("keeps a successor's description across sections and saves only that field", async () => {
  const successor = { ...reviewed, draft_id: "successor-b", base_listing_version_id: "revision-b", review_run_id: "run-b", version: 1,
    content: { ...reviewed.content, title: "Publication B", brief: "Original brief", price: "50.00", tags: "saved tags",
      category: "saved-category", license: "Saved license", description_source_version: 5 } };
  const edited = "A distinctive sentence to save on successor B.";
  mocks.readPublications.mockResolvedValue({ items: [published], page: 0, has_more: false });
  mocks.readDraft.mockResolvedValue(null);
  mocks.saveDraft.mockResolvedValue({ ...successor, version: 2, content: { ...successor.content, description: edited } });
  mocks.post.mockResolvedValueOnce(sse("review_completed", publishedRun)).mockImplementationOnce(async () => {
    mocks.readDraft.mockResolvedValue(successor);
    return { ...accepted, draft_id: successor.draft_id, draft_version: successor.version };
  });
  render(<PublicationsWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: copy.title }));
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  choose();
  fireEvent.click(button(copy.accept));
  await screen.findByText(copy.applied);
  const title = screen.getByRole("textbox", { name: "Title" });
  const price = screen.getByRole("spinbutton", { name: "Your price (USD)" });
  expect(title).toMatchObject({ readOnly: true, value: "Publication B" });
  expect(price).toMatchObject({ readOnly: true, value: "50.00" });
  expect(screen.queryByRole("textbox", { name: "Give allAI a starting point" })).toBeNull();
  fireEvent.change(title, { target: { value: "Cannot change title" } });
  fireEvent.change(price, { target: { value: "100" } });
  fireEvent.change(description(), { target: { value: edited } });
  fireEvent.click(button(copy.returnToDraft));
  expect(screen.getByText(copy.dirtyReturn)).toBeTruthy();
  expect(description().value).toBe(edited);
  fireEvent.click(button("Open publications"));
  fireEvent.click(button("Open editor"));
  expect(description()).toMatchObject({ readOnly: false, value: edited });
  fireEvent.click(button("Save private draft"));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: copy.save }));
  await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith({ ...successor.content, description: edited },
    1, expect.any(String)));
  expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save private draft" })).toBeNull());
  fireEvent.click(button(copy.returnToDraft));
  expect(screen.queryByRole("button", { name: copy.returnToDraft })).toBeNull();
  expect(description().value).toBe(edited);
  expect(screen.getByRole("textbox", { name: "Title" })).toMatchObject({ readOnly: true, value: "Publication B" });
});

it("points to the editor after a remount outside it and names the publication on a replay refusal", async () => {
  mocks.readPublications.mockResolvedValue({ items: [published], page: 0, has_more: false });
  mocks.readDraft.mockResolvedValue(null);
  const held = pending<typeof accepted>();
  mocks.post.mockResolvedValueOnce(sse("review_completed", publishedRun)).mockReturnValueOnce(held.promise)
    .mockRejectedValueOnce(http(409, { code: "REVIEW_DRAFT_IN_PROGRESS", draft_moved: false }));
  const first = render(<PublicationsWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: copy.title }));
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  choose();
  fireEvent.click(button(copy.accept));
  first.unmount();
  render(<PublicationsWorkspace />);
  const status = await screen.findByText(copy.acceptPendingElsewhere);
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("button", { name: copy.title })).toHaveProperty("disabled", true);
  fireEvent.click(within(status).getByRole("button", { name: "Describe and price" }));
  expect(await screen.findByText(published.title + ". " + copy.inProgress)).toBeTruthy();
  expect(mocks.post.mock.calls[2].slice(0, 2)).toEqual(mocks.post.mock.calls[1].slice(0, 2));
  expect(description().readOnly).toBe(false);
});

it("keeps an unrelated current draft out of the publication editor on a moved Accept receipt", async () => {
  const unrelated = { ...reviewed, draft_id: "draft-c", review_run_id: "run-c",
    content: { ...reviewed.content, description: "Unrelated current draft." } };
  mocks.readPublications.mockResolvedValue({ items: [published], page: 0, has_more: false });
  mocks.readDraft.mockResolvedValue(null);
  mocks.post.mockResolvedValueOnce(sse("review_completed", publishedRun)).mockImplementationOnce(async () => {
    mocks.readDraft.mockResolvedValue(unrelated);
    return { ...accepted, draft_id: "successor-b", draft_version: 1, draft_moved: true };
  });
  render(<PublicationsWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: copy.title }));
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  choose();
  fireEvent.click(button(copy.accept));
  await screen.findByText(copy.stale);
  expect(description()).toMatchObject({ readOnly: true, value: "Publication B's description." });
  expect(screen.queryByRole("button", { name: copy.remove })).toBeNull();
  fireEvent.click(button(copy.returnToDraft));
  expect(description().value).toBe("Unrelated current draft.");
});

it("disables Remove until the editor displays the bound draft version", () => {
  render(<SellerListingEditor initialContent={draft.content} savedVersion={7}
    listingPolish={{ draft: reviewed, reload: mocks.reload, lock: { current: false } }} />);
  expect(button(copy.remove).disabled).toBe(true);
  fireEvent.click(button(copy.remove));
  expect(mocks.post).not.toHaveBeenCalled();
});

it("keeps the publication review on its own successor and its current version", async () => {
  const successor = { ...reviewed, draft_id: "successor-b", review_run_id: "run-b", version: 1 };
  mocks.readPublications.mockResolvedValue({ items: [published], page: 0, has_more: false });
  mocks.readDraft.mockResolvedValue(null);
  mocks.post.mockResolvedValueOnce(sse("review_completed", publishedRun))
    .mockImplementationOnce(async () => {
      mocks.readDraft.mockResolvedValue(successor);
      return { ...accepted, draft_id: successor.draft_id, draft_version: 1 };
    }).mockImplementationOnce(async () => {
      mocks.readDraft.mockResolvedValue({ ...successor, version: 2 });
      return { ...accepted, draft_id: successor.draft_id, draft_version: 2, accepted_change_ids: ["b"] };
    }).mockImplementationOnce(async () => {
      mocks.readDraft.mockResolvedValue(null);
      return { draft_id: successor.draft_id, draft_version: 3, draft_moved: false, discarded: true };
    });
  render(<PublicationsWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: copy.title }));
  fireEvent.click(await screen.findByRole("button", { name: copy.start }));
  await screen.findByText("Clear sentence.");
  choose();
  fireEvent.click(button(copy.accept));
  await screen.findByText(copy.applied);
  expect(description()).toMatchObject({ readOnly: false, value: applied });
  fireEvent.click(screen.getByRole("checkbox", { name: "Use suggestion Keep this." }));
  fireEvent.click(button(copy.accept));
  await screen.findByText(copy.allApplied);
  expect(mocks.post.mock.calls[2].slice(0, 2)).toEqual([path + "/run-b/accept",
    expect.objectContaining({ expected_draft_version: 1, change_ids: ["b"] })]);
  fireEvent.click(button(copy.remove));
  await screen.findByText(copy.removed);
  expect(mocks.post.mock.calls[3].slice(0, 2)).toEqual([path + "/run-b/discard",
    expect.objectContaining({ expected_draft_version: 2 })]);
  expect(description()).toMatchObject({ readOnly: true, value: "Publication B's description." });
});

const review = { draft_id: "draft", draft_version: 8, confirmation_statements: {
  ownership_confirmed: "Ownership", privacy_confirmed: "Privacy", price_license_confirmed: "Price",
  public_disclosure_confirmed: "Disclosure",
} } as ListingReview;
function approve(detail: object) {
  mocks.approvalDraft = reviewed;
  mocks.approve.mockRejectedValueOnce(http(409, detail));
  render(<SellerApproval review={review} active rendered />);
  fireEvent.click(screen.getByRole("checkbox", { name: "I confirm all of the above." }));
  fireEvent.click(button("Approve this review"));
}
it("lets the seller reconfirm stale removals on the current draft version", async () => {
  approve({ code: "REVIEW_CONFLICT", stale_removals: [{ review_run_id: "run", change_ids: ["b"] }] });
  mocks.post.mockResolvedValueOnce({ draft_moved: false, confirmed_change_ids: ["b"], confirmed_fact_ids: [] });
  fireEvent.click(await screen.findByRole("button", { name: copy.confirmRemoval }));
  expect(await screen.findByText(copy.confirmed)).toBeTruthy();
  expect(mocks.post.mock.calls[0].slice(0, 2)).toEqual([path + "/run/confirm-removals", {
    request_id: expect.any(String), draft_version: 8, change_ids: ["b"], fact_confirmations: [],
  }]);
  expect(button("Approve this review").disabled).toBe(false);
});
it("replays confirm-removals after rate limiting", async () => {
  approve({ code: "REVIEW_CONFLICT", stale_removals: [{ review_run_id: "run", change_ids: ["b"] }] });
  mocks.post.mockRejectedValueOnce(http(429, "Too many requests"))
    .mockResolvedValueOnce({ draft_moved: false, confirmed_change_ids: ["b"], confirmed_fact_ids: [] });
  const confirm = await screen.findByRole("button", { name: copy.confirmRemoval });
  vi.useFakeTimers();
  fireEvent.click(confirm);
  expect(button(copy.confirmRemoval).disabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(mocks.post.mock.calls[1].slice(0, 2)).toEqual(mocks.post.mock.calls[0].slice(0, 2));
  expect(screen.getByText(copy.confirmed)).toBeTruthy();
});
it("lets the seller confirm facts from the approval refusal", async () => {
  mocks.read.mockResolvedValue({ ...completed, proposal: { ...completed.proposal, changes: [
    { ...completed.proposal.changes[0], fact_units: [{ fact_id: "fact", value: "Published in 2024" }] },
  ] } });
  approve({ code: "FACT_CONFIRMATION_REQUIRED", facts: [{ review_run_id: "run", fact_id: "fact" }] });
  fireEvent.click(await screen.findByRole("checkbox", { name: "Confirm fact Published in 2024" }));
  mocks.post.mockResolvedValueOnce({ draft_moved: false, confirmed_change_ids: [], confirmed_fact_ids: ["fact"] });
  fireEvent.click(button(copy.confirmFacts));
  expect(await screen.findByText(copy.confirmed)).toBeTruthy();
  expect(mocks.post.mock.calls[0][1]).toMatchObject({ draft_version: 8, change_ids: [], fact_confirmations: ["fact"] });
});
it("confirms every fact in the sentence even when approval only names one", async () => {
  const f1 = { fact_id: "f1", value: "40 countries" };
  const f2 = { fact_id: "f2", value: "Published in 2024" };
  const sentence = "Published in 2024 with data from 40 countries.";
  mocks.read.mockResolvedValue({ ...completed, proposal: { ...completed.proposal, changes: [
    { ...completed.proposal.changes[0], text: sentence, fact_units: [f1, f2] },
  ] } });
  approve({ code: "FACT_CONFIRMATION_REQUIRED", facts: [{ review_run_id: "run", fact_id: "f2" }] });
  const group = await screen.findByRole("group", { name: sentence });
  fireEvent.click(within(group).getByRole("checkbox", { name: "Confirm fact Published in 2024" }));
  expect(button(copy.confirmFacts).disabled).toBe(true);
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(within(group).getByRole("checkbox", { name: "Confirm fact 40 countries" }));
  mocks.post.mockImplementationOnce((_url, body) => {
    if (body.fact_confirmations.length !== 2) return Promise.reject(http(409, {
      code: "FACT_CONFIRMATION_REQUIRED", message: "Confirm every fact in each suggestion together.", fact_ids: ["f1"],
    }));
    return Promise.resolve({ draft_moved: false, confirmed_change_ids: [], confirmed_fact_ids: ["f1", "f2"] });
  });
  fireEvent.click(button(copy.confirmFacts));
  expect(await screen.findByText(copy.confirmed)).toBeTruthy();
  expect(mocks.post.mock.calls[0][1]).toMatchObject({ fact_confirmations: ["f1", "f2"] });
  expect(button("Approve this review").disabled).toBe(false);
});

it("reloads a stale confirmation and sends the refreshed version with a new request id", async () => {
  approve({ code: "REVIEW_CONFLICT", stale_removals: [{ review_run_id: "run", change_ids: ["b"] }] });
  mocks.post.mockRejectedValueOnce(http(409, { code: "REVIEW_STALE", message: copy.confirmationStale, draft_version: 9 }))
    .mockResolvedValueOnce({ draft_moved: false, confirmed_change_ids: ["b"], confirmed_fact_ids: [] });
  mocks.reload.mockImplementationOnce(async () => (mocks.approvalDraft = { ...reviewed, version: 9 }));
  fireEvent.click(await screen.findByRole("button", { name: copy.confirmRemoval }));
  expect(await screen.findByText(copy.confirmationRefreshed)).toBeTruthy();
  fireEvent.click(button(copy.confirmRemoval));
  expect(await screen.findByText(copy.confirmed)).toBeTruthy();
  expect(mocks.post.mock.calls[0][1]).toMatchObject({ draft_version: 8 });
  expect(mocks.post.mock.calls[1][1]).toMatchObject({ draft_version: 9 });
  expect(mocks.post.mock.calls[1][1].request_id).not.toBe(mocks.post.mock.calls[0][1].request_id);
});

it.each([
  "Some suggestions are unknown.",
  "Only accepted removals can be confirmed again.",
  "These suggestions belong to another review.",
])("preserves the distinct confirm-removals refusal %s", async message => {
  approve({ code: "REVIEW_CONFLICT", stale_removals: [{ review_run_id: "run", change_ids: ["b"] }] });
  mocks.post.mockRejectedValueOnce(http(409, { code: "REVIEW_CONFLICT", message, change_ids: ["b"] }));
  fireEvent.click(await screen.findByRole("button", { name: copy.confirmRemoval }));
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.queryByText(copy.confirmed)).toBeNull();
});

it.each([
  "The published listing changed. Start a new review.",
  "These suggestions could not be verified. Start a new review.",
])("keeps the approval refusal and provides removal for %s", async message => {
  approve({ code: "REVIEW_CONFLICT", message });
  expect(await screen.findByText(message)).toBeTruthy();
  expect(button(copy.remove).disabled).toBe(false);
  expect(mocks.post).not.toHaveBeenCalled();
});

it("offers discard when an approval recovery run cannot be read", async () => {
  mocks.read.mockRejectedValue(http(404, "Listing review not found."));
  approve({ code: "REVIEW_CONFLICT", stale_removals: [{ review_run_id: "run", change_ids: ["b"] }] });
  expect(await screen.findByText(copy.recoveryUnavailable)).toBeTruthy();
  expect(button(copy.remove).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: copy.confirmRemoval })).toBeNull();
  expect(mocks.post).not.toHaveBeenCalled();
});

it("shows the server evidence refusal and an explicit discard action without discarding automatically", async () => {
  const message = "Your files changed since this review. Remove the review changes, then start a new review.";
  approve({ code: "REVIEW_CONFLICT", message, removals_required: 1 });
  expect(await screen.findByText(message)).toBeTruthy();
  expect(button(copy.remove).disabled).toBe(false);
  expect(mocks.post).not.toHaveBeenCalled();
});
