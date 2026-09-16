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
