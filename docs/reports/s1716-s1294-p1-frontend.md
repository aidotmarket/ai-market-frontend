# S1716 / S1294 P1 frontend — contract blocker

Status: stopped at backend contract verification, as explicitly required by the task. No seller UI, buyer rendering, or backend behavior changed. No merge or deployment performed.

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
