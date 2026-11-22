// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { AxiosError } from "axios";
import SellerListingEditor from "./SellerListingEditor";
import SellerApproval from "./SellerApproval";
import { EMPTY_LISTING_DRAFT, type SavedListingDraft } from "@/api/sellerListingDraft";
import type { ListingReview } from "@/api/sellerListingReview";
import { listingPolishEnabled, type CompletedReview } from "@/api/listingPolish";
import { listingPolish as copy } from "@/lib/i18n/listing-polish";

const mocks = vi.hoisted(() => ({
  post: vi.fn(), read: vi.fn(), reload: vi.fn(), save: vi.fn(), approve: vi.fn(), approvalDraft: null as SavedListingDraft | null,
}));
vi.mock("@/api/session-mutation", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/session-mutation")>(), postSessionMutation: mocks.post,
}));
vi.mock("@/api/connector-seller-settings", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/connector-seller-settings")>(),
  nativeRead: mocks.read, sessionLifecycle: () => () => true,
}));
vi.mock("@/api/sellerListingReview", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/sellerListingReview")>(), approveListingReview: mocks.approve,
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
function Editor({ initial = draft }: { initial?: SavedListingDraft }) {
  const [current, setCurrent] = useState(initial);
  const lock = useRef(false);
  return <><button onClick={() => setCurrent({ ...initial, version: initial.version + 1 })}>Independent draft refetch</button>
    <SellerListingEditor initialContent={current.content} savedVersion={current.version} onNext={() => {}} onSave={async (fields) => {
      const version = await mocks.save(fields, current.version);
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
  vi.stubEnv("NEXT_PUBLIC_LISTING_REVIEW_ENABLED", "true");
  sessionStorage.clear();
  mocks.read.mockImplementation(path => path.endsWith("/availability")
    ? Promise.reject(http(422, "Request validation failed")) : Promise.resolve(completed));
  mocks.reload.mockResolvedValue(reviewed);
  mocks.save.mockImplementation((_: unknown, version: number) => Promise.resolve(version + 1));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("makes no review requests with the frontend flag off", async () => {
  vi.stubEnv("NEXT_PUBLIC_LISTING_REVIEW_ENABLED", "");
  render(<Editor />); await settle();
  expect(screen.queryByRole("button", { name: copy.start })).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
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
    lost_edits: [{ field: "description", current: applied + " My later note.", restored: original }],
  }).mockResolvedValueOnce({
    draft_version: 10, preview_receipt: "replacement receipt", draft_moved: false,
    lost_edits: [{ field: "description", current: applied + " Newer note.", restored: original }],
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
it("shows the server evidence refusal and an explicit discard action without discarding automatically", async () => {
  const message = "Your files changed since this review. Remove the review changes, then start a new review.";
  approve({ code: "REVIEW_CONFLICT", message, removals_required: 1 });
  expect(await screen.findByText(message)).toBeTruthy();
  expect(button(copy.remove).disabled).toBe(false);
  expect(mocks.post).not.toHaveBeenCalled();
});
