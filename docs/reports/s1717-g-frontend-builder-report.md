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
