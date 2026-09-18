# S1717 chunk G frontend builder report

Date: 2026-09-18. Result: frontend implementation and carried D-frontend corrections complete; no PR, deployment, backend mutation, or listing-page change.

## Identity and authority

- Branch: `build/bq-multi-file-datasets-s1717-g-frontend`.
- Base: frontend `origin/main` at `0bfc361d24406fbc86e7a52f11a85c8d3ee9b199`.
- Runbook pin: `474cb2608db2f3cdc6d7836faaa37c8272968693`; read only Gate 2 §4.7 and §6 plus workspace amendment W-D1, W-D2, W-D5, and W-D6.
- Backend contract pin: branch `build/bq-multi-file-datasets-s1717-g` at `c9bbe7338fe84d095e2bcc4f370cf2e0c7ebe179`.
- Carried D-frontend commit: `9ef4c002e4a52d588997e0324ac9d668869c91ae`.
- Chunk G implementation commit: `15ac81a8333ad98da395a849d615ebac1d6b3879`.

## Backend contract used

- Raw upload route and rate refusal: `app/api/v1/endpoints/seller_workspace.py:238-262`.
- Upload refusal strings, replacement rules, streaming bounds, result shape and generation handling: `app/services/seller_sample_upload.py:26-29,36-91,127-189`.
- Approval request/receipt fields and v1/v2 validation: `app/schemas/seller_listing_approval.py:7-52`.
- Draft content round-trip and selection invariants: `app/schemas/seller_listing_draft.py:9-45`.
- Exact v1 and v2 confirmation statement sets: `app/services/seller_listing_confirmations.py:2-25`.
- Review `sample_status`, ordered file metadata, decision, indices and confirmation version: `app/services/seller_listing_review.py:62-103`.
- Public typed workspace metadata: `app/schemas/listing_public.py:210-235`.

The publication receipt at this pin has no sample-count or sample-status field. The frontend therefore carries the already validated review selection into `SellerPublication`; it does not invent or accept a new backend response field.

## Files and behavior

Chunk G changes:

- `components/seller-workspace/WorkspaceData.tsx` and test: saved manifest objects can be ticked as samples, with the 10-file, 64 MiB per-file and 256 MiB total limits shown. Each local copy is sent as a raw body with `size` and `Idempotency-Key`; upload progress, replacement/re-tick, all pinned backend refusal names, and safe seller copy are rendered. A first-use route 404 hides the complete affordance.
- `components/seller-workspace/SavedWorkspaceData.tsx` and test, `api/sellerListingDraft.ts`, and `components/seller-workspace/SellerListingEditor.tsx`: `sample_decision` and ordered `sample_object_indices` round-trip inside draft content while existing listing fields are preserved.
- `api/sellerWorkspace.ts`: exact sample-upload transport and pinned public limit configuration defaults.
- `api/sellerListingReview.ts` and test: widened v2 review and approval request validation without changing the v1 request body.
- `SellerReview.tsx`, `SellerApproval.tsx`, and tests: the backend-provided v2 statement and ordered basename/size/index list are shown together; v1/no-sample controls and markup remain unchanged.
- `SellerPublication.tsx` and test: a published member-file review shows “N sample files published free” and its reviewed `sample_status`.
- `app/listings/[slug]/SampleFiles.tsx` was not modified.

Carried D corrections:

- `app/dashboard/orders/[id]/page.tsx`, `DatasetMembers.tsx`, and tests preserve probe HTTP status and safe detail classification. `410 delivery_retention_expired`, `403 download_window_expired`, and closed/revoked 403 responses are terminal named states without Retry. Retry exists only for transport/5xx outcomes, never issues `membersApi.post`, and leaves the transaction heading and support link visible. A malformed 200 without a `members` array is unavailable, not a directory.
- `docs/reports/s1717-d-frontend-builder-report.md` now cites `lib/api.ts` and `app/sitemap.ts`, not `middleware.ts`.

## Validation

- Required component suites: **31 passed**, 4 files.
- Seller-workspace/API slice: **106 passed**, 16 files before the final two parity additions; both added parity tests pass in the final required component run.
- Carried D focused suites: **45 passed**, 2 files.
- Full suite: **1,045 passed, 1 failed**, 101 files (100 passed, 1 failed), 1,046 tests. The sole failure is the inherited node `app/login/LoginForm.test.tsx > shares one flight between a manual click and subsequent hinted hydration`; expected the `oauth_nonce` storage write and received none. No login file was changed.
- `npm run lint`: 0 errors and 7 existing unrelated `no-img-element` warnings.
- `tsc --noEmit`: passed with 0 errors.
- `git diff --check`: passed.
- Flag-off parity: exact markup equality is asserted after dark 404 in `WorkspaceData.test.tsx`, and between legacy/explicit-none payloads in `SellerReview.test.tsx`, `SellerApproval.test.tsx`, and `SellerPublication.test.tsx`.

Tests use mocked HTTP and browser inputs. This is not deployed-backend, provider, object-store, or live-browser proof, and it is not an enabled-release claim.

## Gate 3 R1 fold

R1 implementation commit: `728a5c208f5cf33ba9ef251a191b5394c8c21683`; dark-parity test follow-up: `4385a76d47b36ecbf3d9dc70182b9e15e2f44617`.

- Draft writes now have one page-level owner and one serialized version queue. Listing-field saves omit both sample keys on the legacy/dark path. When the capability is positively enabled, an existing selection is merged into later listing saves; sample changes, including unticks during an in-flight save, are queued and the final visible indices win. A source commit completes independently, then queues a best-effort sample clear.
- The frontend now requires a positive `samples` stage in the already-read workspace capabilities payload. The pinned backend has no suitable signal in that payload, while probing review or upload would add a dark-path request. Backend follow-up is therefore required to add this tiny read-only stage and omit/disable it until the chunk-G routes are deployed. Without it, markup remains on the legacy path and no extra request is made. A route 404 after a positive signal produces the explicit `sample_route_unavailable` alert and does not silently collapse the UI.
- New sample tick, upload and progress attributes use only basename plus saved-object index. Existing non-sample object-key rendering is unchanged.
- `SAMPLE_REFUSALS` is one exported map pinned by comment and test to `app/services/seller_sample_upload.py` plus the upload endpoint at backend `c9bbe7338fe84d095e2bcc4f370cf2e0c7ebe179`.
- Publication copy is “N free sample files are part of the purchased set.” The count is derived from the approved review held in the current frontend session because the pinned publication receipt has no sample fields; it is session-only and is not claimed as durable publication-receipt data.
- `files_unavailable` no longer tells the buyer to retry when no Retry control is available. The D report citation now points to `api/client.ts`.

Recorded W-D1 deviation beyond Gate 2 §4.7: `api/sellerListingDraft.ts`, `api/sellerListingReview.ts`, `api/sellerWorkspace.ts`, `components/seller-workspace/SavedWorkspaceData.tsx`, and `components/seller-workspace/SellerListingEditor.tsx`. These files were required for the draft round-trip. R1 additionally introduced the shared owner in `components/seller-workspace/SellerListingDraftStore.tsx` and wired it at the workspace page.

### R1 validation

- `rtk proxy npm test -- --maxWorkers=1 components/seller-workspace/SavedListingEditor.test.tsx components/seller-workspace/SavedWorkspaceData.test.tsx components/seller-workspace/WorkspaceData.test.tsx components/seller-workspace/SellerPublication.test.tsx api/sellerListingReview.test.ts` — 54 passed, 5 files.
- `rtk proxy npm test -- --maxWorkers=1 components/seller-workspace api/sellerListingReview.test.ts api/sellerWorkspace.test.ts app/dashboard/seller-workspace/page.test.tsx 'app/dashboard/orders/[id]/page.test.tsx' 'app/dashboard/orders/[id]/DatasetMembers.test.tsx'` — 188 passed, 19 files; includes the carried D suites.
- `rtk proxy npm run lint` — 0 errors and the same 7 unrelated `no-img-element` warnings.
- `rtk proxy npx tsc --noEmit` — passed.
- `rtk git diff --check` — passed before the implementation commit and again before the report commit.
- `rtk proxy npm test -- --maxWorkers=1` — 1,048 passed and 1 inherited failure across 101 files. The unchanged inherited node is `app/login/LoginForm.test.tsx > shares one flight between a manual click and subsequent hinted hydration`; it still expected the `oauth_nonce` storage call and received none. No login file changed.

An initial local attempt used Vitest's unsupported `--runInBand` option and exited before running tests; it was replaced by the repository-supported `--maxWorkers=1` commands above.

## Gate 3 R2 fold

R2 implementation commit: `af3f2343a6685779f7f859a63b24e750b5c87856`. Backend contract verified at `ba3889064106cd2c4c815a69a25ba7b9bbb3b3d4`: `samples` is omitted flag-off and is exactly `{enabled,status,reason}` flag-on; legacy no-sample reviews omit sample decision/index fields.

- Sample ticks are local until upload succeeds. Draft PUT success establishes the confirmed selection; failure restores the last persisted ticks with `sample_selection_save_failed`. Review and approval stay disabled during a selection write and after an unresolved failure, and approval uses the persisted review selection.
- Draft reads retain the legacy visit-lazy request path when `samples` is absent and run once eagerly when the sample stage is available. Source saves clear only a loaded persisted `member_files` selection.
- Persisted sample rows remount with the Replace affordance. Client limits use a server payload when present and otherwise fixed documented defaults; they are no longer frontend-environment tunable. Refusal names and the pin comment match the R2 upload service and endpoint.
- Publication no longer accepts the unused sample-status prop and renders `No free sample files` for the zero-count member-file branch.

R2 changed files: `api/sellerListingReview.test.ts`, `api/sellerWorkspace.test.ts`, `api/sellerWorkspace.ts`, `app/dashboard/seller-workspace/page.test.tsx`, `app/dashboard/seller-workspace/page.tsx`, `components/seller-workspace/SavedListingEditor.tsx`, `components/seller-workspace/SavedWorkspaceData.test.tsx`, `components/seller-workspace/SavedWorkspaceData.tsx`, `components/seller-workspace/SellerApproval.tsx`, `components/seller-workspace/SellerListingDraftStore.tsx`, `components/seller-workspace/SellerPublication.test.tsx`, `components/seller-workspace/SellerPublication.tsx`, `components/seller-workspace/SellerReview.test.tsx`, `components/seller-workspace/SellerReview.tsx`, `components/seller-workspace/WorkspaceData.test.tsx`, `components/seller-workspace/WorkspaceData.tsx`, and this report.

### R2 validation

- Focused G plus carried D suites: **168 passed**, 11 files.
- `npm run lint`: 0 errors and the same 7 unrelated `no-img-element` warnings.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Full suite with Node `v25.6.0`: **1,056 passed, 1 inherited failure**, 101 files. The unchanged inherited node is `app/login/LoginForm.test.tsx > shares one flight between a manual click and subsequent hinted hydration`; it expected the `oauth_nonce` storage call and received none. No login file changed.
