# S1716 / S1294 P1 frontend — implementation and validation

Current status: seller and buyer frontend implemented; controller ruling applied. All milestones are committed and pushed without merge or deployment. See the resume and validation receipts below.

Historical initial stop: stopped at backend contract verification as required by the original task; at that point no seller UI, buyer rendering, or backend behavior had changed.

## Verified source identities

- Frontend baseline: `078d919bc3721b2a51ab6d92bbc7a3746cdb173e` (`origin/main`, fetched 2026-09-16). `2fa04d4` is an ancestor.
- Branch: `build/bq-listing-enrichment-seller-tools-s1294-p1-frontend-s1716`.
- Backend `origin/main`: `e225e8d942fa5c6526e6c1daa246c52614949afb`, fetched 2026-09-16.
- The same blocking code was checked at backend `8bd0cbe4`, the deployment identity supplied by the task. Live deployment was not independently checked.
- Read addendum sections C, E, and H, seller endpoint/schema/service sources, and public listing projections. Consulted `/Users/max/Projects/ai-market/runbooks/ai-market-frontend.md`.
- This frontend checkout contains no `DESIGN-CHARTER.md`; read the shared `/Users/max/Projects/ai-market/DESIGN-CHARTER.md` (approved version 1.0).

## Blocking contract gap: invalidation history is lost before preview

The required seller message is “the listing changed since you approved, review and approve again”. The current response cannot distinguish this situation from a first, never-approved pending summary.

Exact evidence in backend `app/services/listing_summary.py`, identical at both inspected revisions:

1. `preview_summary`, lines 329–336: an invalidated record or mismatching source revision invokes `regenerate_summary` before returning the preview.
2. `regenerate_summary`, lines 298–315: clears approval information/current pointers, sets `record.state = "pending"`, and returns `summary_preview(record)`.
3. `summary_preview`, lines 318–326: returns only the resulting current state/status and generation identifiers; no previous-approval or invalidation-reason field is exposed.
4. `refresh_existing_summary`, lines 339–352: regenerates a replacement inside a listing update transaction. `app/services/vz_publish_service.py`, lines 1125–1128, calls this for updates to existing listings. Thus even a read-only preview change alone would not recover the missing history for that update path.
5. Withdrawal sets `state = "invalidated"` (line 389), so invalidation alone would also need to distinguish withdrawal from listing changes to avoid a false explanation.

A test that mocks an `invalidated` preview would not prove the required real flow: the live GET handler converts that state to pending. Local browser history could detect some changes while a panel remains mounted, but cannot reliably identify a prior approval after reload, another session, or another device.

Required backend clarification/change before implementation: expose a durable reason/history signal in the preview indicating that a previous approval was invalidated by a listing/source change, distinct from never-approved, explicitly regenerated, and withdrawn summaries. Preserve this signal when update-time regeneration creates the replacement. Continue returning the exact current identifiers needed for approval. Alternatively, explicitly revise the frontend requirement to permit a generic pending message without asserting previous approval or a listing change.

No backend edits were made, per scope.

## Implementation and validation status

- Files changed: this report only.
- Shared seller/buyer renderer: not implemented.
- Caching observed: `app/listings/[slug]/page.tsx` already exports `dynamic = 'force-dynamic'`; `fetchPublicListing` in `lib/api.ts` uses `cache: 'no-store'`. This covers page-load fetch freshness, not the addendum's open-page withdrawal bound. No refresh/expiry mechanism was implemented and no withdrawal latency was measured. Public list fetching currently uses 60-second revalidation and would need scoped consideration because its response also contains summaries.
- Dependency installation: `rtk proxy npm ci` succeeded (703 packages added); no dependency files changed.
- Full test baseline/branch counts, lint, type-check, build: not run because implementation stopped at the contract boundary. No pass or zero-regression claim.
- Mutation evidence: not performed; neither requested mutation is counted as tested.
- Screenshots/mobile/accessibility: not performed; no 375px or keyboard/screen-reader verification claimed.
- Section H's real-listing/five-buyer pilot: not performed.
- Seller UI, buyer render, and tests milestones remain uncompleted. Only the blocker report milestone is committed and pushed.


## Resume: controller ruling (2026-09-16)

The controller explicitly resolved the contract gap: do not change the backend; treat every non-approved preview as pending with “Review the summary and approve it to show it to buyers”. The prior-approval/listing-change distinction is deferred to the BQ backend nit for `last_decision` / `previous_state`. The historical stop above remains evidence, not current implementation status.

### Seller milestone

Implemented the shared `components/listings/AtAGlance.tsx` renderer and `SellerAtAGlance.tsx` panel. Wired into listing edit, Workspace publication result, and Workspace listings. Typed summary and four seller endpoint functions live in `lib/api.ts`, reusing authenticated Axios through dynamic import. Approval/withdrawal use the exact four preview identifiers, a browser UUID and `sample_decision: "none"`. Every decision reloads preview; 409 reloads with neutral changed-summary feedback. No backend edits.

`rtk proxy npx vitest run components/listings/SellerAtAGlance.test.tsx`: 8/8 passed. Covers pending and invalidated neutral wording, byte-identical shared renderer, provenance, exact approval payload, withdrawal, regeneration, 409 reload/new identifiers, failed reload, and late-response cancellation. Initial implementation typecheck passed before these tests were added; final typecheck pending.

Fresh fetch of frontend origin on resume resolved `origin/main` to `2fa04d4388dec80521bf48745d6edbfabc113361`; preserved branch includes prior fetched `078d919`. Baseline comparison will use the actual resume-time origin/main in a separate detached worktree.


### Buyer milestone

Buyer detail uses the same `AtAGlance` renderer via `BuyerAtAGlance`; no markup when absent (the original full-page legacy snapshot passes unchanged). The existing schema table's native HTML/classes are reused without a table dependency. Field order/labels follow C, with price remaining in its existing canonical purchase card because the backend summary contract has no price field. Missing fields are omitted, measured zero retained, text escaped; source labels accompany each field. Descriptions/units appear in schema cells and their own C-ordered field with their own provenance.

Detail remains force-dynamic/no-store. The client fetches public listing metadata with `cache: no-store`, immediately and every 10 seconds; requests abort after 5 seconds and visible metadata expires 20 seconds after request START, independent of network completion. Failure clears the block; hidden/page-restored tabs clear before refetch. Expected successful withdrawal latency is <=10 seconds plus response time (5-second request limit); worst-case retained metadata expires at 20 seconds on an active browser event loop, below the 30-second requirement. Background/suspended pages clear on visibility/page restore. This is implementation + fake-clock proof, not production measurement. Existing public list fetching is unchanged: this chunk renders summaries only on the detail page.

`rtk proxy npx vitest run components/listings/AtAGlance.test.tsx components/listings/BuyerAtAGlance.test.tsx 'app/listings/[slug]/page.test.tsx'`: 20/20 passed, 2 new present snapshots; existing absent full-page snapshot unchanged. Tests include withdrawal, offline/hung requests, ignored late responses, suspension/resume, newly approved metadata, labels/order, no placeholders, measured zero, plain-text escaping and native table semantics.


### Test milestone

- Seller milestone pushed: `ffc3580`; buyer milestone pushed: `dc9632a`.
- Full suites, identical `npm test -- --maxWorkers=2 --reporter=json` settings and installed dependencies: origin/main `2fa04d4`: **693 passed / 1 failed / 694 total**; branch: **711 passed / 1 failed / 712 total**. **Zero branch-only failures**, 18 added tests. The shared existing failure is `app/login/LoginForm.test.tsx` → “shares one flight between a manual click and subsequent hinted hydration” (`oauth_nonce` expected, empty captured cookie writes received). No unrelated login fix was made. Initial unbounded baseline run had four additional timing failures under concurrent machine load; reducing workers resolved those without code/test changes.
- Post-mutation focused run: **30/30 passed**, 5 files, 4.43s. `lib/api.summary.test.ts` checks all four typed routes, exact bodies/encoding/signals and public no-store/credential omission.
- Mutation 1: replaced absent-summary return with an empty visible section. **2 failures**, including the original absent full-page snapshot; exit 1.
- Mutation 2: replaced preview `render_hash` with `wrong-render-hash`. **4 failures** (approval payload, withdrawal payload, regeneration and 409 replacement); exit 1.
- Both mutations restored before the passing run; no snapshots updated to accept either mutation.
- `npm run typecheck`: exit 0. Fixed TS's stale narrowing across an async visibility check through a small visibility function.
- `npm run lint`: exit 0, 0 errors, 7 existing image warnings. Repaired the stale npm script to invoke the existing ESLint flat config and removed one suppression naming an unregistered rule from `types/index.type-test.ts`. No new lint dependency/rule suppression.
- Machine-readable comparison and captured test/mutation/typecheck/lint logs are in `docs/reports/s1716-s1294-p1-frontend-receipts/`.


### Mobile and accessibility receipt

Real Chrome, local Vite harness at `http://localhost:3176`, using the actual three production components and application Tailwind CSS with an in-memory, metadata-only fixture API. This harness lives outside the repository under `/tmp/s1716-mobile`; no fixture route or sample data ships in the application.

- Viewport **375 × 812**. DOM width receipt: `innerWidth=375`, `documentElement.scrollWidth=360` (browser scrollbar); no page-wide overflow. Schema scroller width 244px, content width 302px: overflow stays inside the labelled, keyboard-focusable table region.
- Screenshot inspected: seller pending panel has readable wrapping; the table scrolls horizontally; rows/counts/source labels stay inside the card. Lower screenshot shows the complete approval scope text, Regenerate and Approve as separate reachable buttons, and no buyer block after withdrawal.
- Keyboard: Tab reaches “Key fields schema”, then Regenerate, then the single “Approve At a glance” button; Enter approves and announces the approved status. Buyer block appears after polling. Enter on Withdraw returns the panel to neutral pending; buyer region count falls from 2 (seller preview + buyer) to 1 (seller preview only).
- Accessibility tree exposes labelled regions, headings, table cells, plain-word provenance, approval scope and status updates. No pointer was needed for approval/withdrawal. No VoiceOver/screen-reader spoken-session or full real-listing pilot is claimed.
- Browser viewport reset and task tab closed after verification. This checks component mobile behavior, not a deployed seller account or production withdrawal latency.

### Files and scope

- New shared renderer, seller controller and buyer freshness controller: `components/listings/{AtAGlance,SellerAtAGlance,BuyerAtAGlance}.tsx`.
- Integration: seller edit route and the two existing Workspace publication components; buyer detail route only; optional `ListingDetail.at_a_glance` type; `lib/api.ts` typed clients.
- Tests: three component files, typed-client test, route present snapshot, preserved absent snapshot, common metadata fixture. Two minimal existing lint-tooling repairs as recorded above.
- Price is deliberately absent from the typed summary because the verified backend contract has no price summary field; the existing canonical price card is unchanged. No pricing/checkout component changes, backend edits, flags, sample permission, row transport or table library.

### Remaining acceptance boundaries

The backend prior-decision/history nit stays deferred under the controller ruling. The real three-listing/five-buyer pilot, deployed frontend/backend identity, production withdrawal timing and screen-reader/performance measurements in addendum H remain Gate-4 work; this branch does not claim them. No merge or deployment was performed.


### Final build and revision receipt

Tests milestone pushed at `e050304fc208392650ab227ab5e6cdde0a0f3d96`. Source/tool versions: Node **v25.3.0**, Next **15.5.12**, React **19.2.4**, Vitest **4.1.8**. `npm run build` **exit 0**, all 47 static pages generated, detail route shown as dynamic. The seven pre-existing image warnings remain non-blocking.

Reproduction command (all Keystatic values below are deliberately nonfunctional compile-only fixtures, not credentials):

```sh
rtk proxy env API_URL=https://api.ai.market NEXT_PUBLIC_API_URL=https://api.ai.market KEYSTATIC_GITHUB_CLIENT_ID=local-build-fixture KEYSTATIC_GITHUB_CLIENT_SECRET=local-build-fixture KEYSTATIC_SECRET=local-build-fixture-only-not-a-live-secret NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=local-build-fixture npm run build
```

The build fetched only existing public metadata using the documented API URL; it did not exercise Keystatic authentication or deploy. The initial unconfigured build failed on required Keystatic settings; a subsequent attempt with only those settings failed because API_URL was unset. The fully configured command above passed without application changes. Full captured build receipt: `s1716-s1294-p1-frontend-receipts/build.txt`.

Final validation: 30/30 focused tests after restoring both mutations; full branch suite 711/712 vs baseline 693/694 with the same single existing login failure; 0 branch-only failures; typecheck exit 0; lint exit 0 (7 existing warnings); build exit 0. No full-suite-green claim.


## R2 fold — DeepSeek Gate-3 R1 (2026-09-16)

Folded all controller rulings from `response-20260916-145250-042275` (`APPROVE_WITH_MANDATES`). GLM/CC findings remain pending and are outside this fold. Continued the preserved branch from `8341c389b6ba3c189dd3b40493a6ff0da286fb6b`; each finding has its own commit and was pushed normally, with no force-push, merge or deployment. Re-read the frontend runbook and the backend addendum §C. This section supersedes the earlier polling, buyer-provenance and byte-display descriptions above.

### Per-finding commits

| Finding | Commit | Result and evidence |
|---|---|---|
| M1 | `3aa913a6639e0304a059222893998e6cc6e721f0` | One required audience prop on the shared renderer: seller uses “entered by you”, buyer uses “provided by the seller”; other provenance labels unchanged. Updated buyer snapshot and added an explicit buyer-output “you” rejection test. |
| M2 | `63fc394182cae0f6ebe3d749b330902a1eb304af` | Removed interval, initial client GET and periodic expiry. Only visible visibilitychange and persisted pageshow refresh, with a five-second request abort and fail-closed clearing on error/timeout. Initial pageshow neither clears nor fetches; late responses cannot restore expired metadata. Seller withdrawal text reflects this bound. |
| L1 | `1804e2d108bb1f26b1c6ea23058ff83b946dd171` | Closed publication details no longer mount the panel or issue preview GETs; opening mounts and fetches. Added publication integration coverage. |
| L2 | `88bc75ed1feca8af6f9e69141025cb85eb86e5b4` | Closed field allowlist retained; tests compare headings with tests/summarySectionC.json, independently extracted from the addendum §C inventory with source SHA-256. Price is deliberately omitted from summary rendering because the backend contract has no price summary field; the existing canonical price card remains. Code comment and unknown-key test added. |
| L3 | `2fd7975be6fb4a095ce36c70880640398d545f30` | Use crypto.randomUUID when available, otherwise construct RFC v4 version/variant bytes with crypto.getRandomValues. Caught action error messages appear in the panel. Tests cover fallback UUID and random-source failure diagnosis. |
| L4 | `ea0b4412b2399d1bcdb47acf0851232fdfa87c5f` | SchemaTable is shared by Schema Information and key_fields. No visual/markup change to the existing block: snapshots passed without updates at this commit, and a final byte comparison verifies both existing table blocks and the entire legacy absent-summary snapshot. |
| L5 | `74174207d2c10c04189327730b9d42e3a5d7713c` | Size uses decimal KB/MB/GB (bytes below 1 KB), with the exact byte count in title. Removed invented dataset/file-total suffix; covered zero and unit boundaries. |
| L6 | `5b3b3fdda4c0a91b4a6976387d89420d67958b4f` | Removed custom Cache-Control request header from preview GET; the exact API-call test expects only signal. Backend no-store remains authoritative. |
| L7 | `cb6acbdae1eeba03f3374aea482a9695dc367d0b` | Decision IDs survive unconfirmed network/timeout outcomes and identical preview reloads, separately for approve and withdraw. IDs change when listing/preview identifiers change. Tests cover both retries and changed-hash replacement. |
| L8 | `c3de646c283028d98bad2a23b8f16657eb5349cc` | Absent description/unit cells omit content and expose aria-label “no description” / “no unit”, without placeholder glyphs. Present summary snapshots updated; legacy block unchanged. |

### Withdrawal and view-count contract

Fresh loads retain `force-dynamic` and `cache: 'no-store'`, satisfying the controller's 30-second withdrawal bound for fresh loads. An already-open tab refreshes once on return to visible and once on bfcache restoration (`pageshow.persisted === true`), with overlapping in-flight work coalesced. There is no polling or periodic expiry timer; the sole timer is the required five-second request timeout. A failed refresh removes the summary immediately; a hung refresh removes it at timeout even if the transport ignores abort.

**A tab left open and untouched may show a withdrawn summary until the next interaction that returns it to visible, restores it from bfcache, or reloads it.** No claim of a 30-second bound for such a tab remains. The frontend no longer inflates `view_count` through recurring background polling or an extra initial client fetch. The existing public reader still increments views for actual return/restore refreshes; no backend counting behavior was changed.

### R2 validation receipts

Receipts are under [`s1716-s1294-p1-frontend-receipts/r2/`](s1716-s1294-p1-frontend-receipts/r2/). Each command log records its command and exit code.

- Post-mutation focused run: **46/46 passed**, six files: three components, route snapshot, API summary client, and publication lazy-mount integration. `focused.txt`.
- R1 absent-summary mutation repeated: **2 failures**, including the unchanged legacy route snapshot; exit 1. `mutation-absent.txt`.
- R1 render-hash mutation repeated: **5 failures**, covering exact approval/withdrawal, regeneration, 409 and changed-preview retries; exit 1. `mutation-approval.txt`.
- New buyer-audience mutation (“provided by the seller” → “entered by you”): the explicit **“never addresses the buyer as you” test failed**, exit 1. `mutation-buyer-audience.txt`. All three mutations restored before focused/full validation; no snapshots accepted mutated behavior.
- Typecheck: exit 0. `typecheck.txt`.
- Lint: exit 0, zero errors, the same seven existing image warnings. `lint.txt`.
- Exact legacy snapshot, both Schema Information tables and §C fixture source checked independently. `invariants.json`.
- Full suite rerun sequentially with identical `npm test -- --maxWorkers=2 --reporter=json --outputFile=…` commands and shared installed dependencies: fetched origin/main `2fa04d4388dec80521bf48745d6edbfabc113361` **690 passed / 4 failed / 694 total**; branch `c3de646c283028d98bad2a23b8f16657eb5349cc` **725 passed / 1 failed / 726 total**. **Zero branch-only failures**, 32 tests added relative to main. The branch failure is the same existing LoginForm “shares one flight between a manual click and subsequent hinted hydration” cookie-write assertion as R1. The baseline also failed three SellerWorkspace verification retry/outcome tests that passed on the branch; exact names and failure messages are preserved in `baseline.json`, `branch.json`, the full command logs and `comparison.json`. Neither full suite is claimed green; no unrelated fixes were made.
- Build: exit 0, all 47 static pages generated and listing detail remains dynamic. Used the exact R1 documented nonfunctional Keystatic compile fixtures and API URLs; `build.txt` contains the captured output. No deployment performed.
- Source identity and ten pushed finding commits: `source-identity.json`. Receipt integrity: `sha256.json`.

R2 fold is complete for M1, M2 and L1–L8. GLM/CC review is still pending; no Gate-3 quorum, Gate-4 pilot, production withdrawal measurement or deployment is claimed. The prior real-listing/pilot acceptance boundaries remain open.
