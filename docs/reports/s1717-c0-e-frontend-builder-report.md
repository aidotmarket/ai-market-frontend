# S1717 C0 and E frontend builder report

Built the listing-page sample-file display and verification role-count disclosure on `build/bq-multi-file-datasets-s1717-c0-e-frontend`, from Gate 2 base `ec8aadcc275fb13e6c8acbdf5b020825079e4b6b`.

Implementation commit: `8b1d24428e3f0bf35cc2e177ee86cc4420ef4f8d`. This report is a separate documentation commit.

## Authority and contracts

Fetched the three repositories before reading their remote refs. Runbooks `origin/main` was `a64d6665418a8e90dd25b4501d3265240d635862`. Read via `git show origin/main:<path>`:

- `specs/BQ-MULTI-FILE-DATASETS-S1717-GATE2.md`, §4.2a and §4.5.
- `specs/BQ-MULTI-FILE-DATASETS-S1717-WORKSPACE-ROUTE-AMENDMENT.md`, W-D4.

Read backend `app/schemas/listing_public.py` at fetched `origin/main` (`ed9f3162b92dce3f3fe1ee6acf72143de370bb2f`) for both sample carriers, and at `29d3019f6cb126964755a205bc363dc0adae4882` for `verification_scope`. E's backend remains under review; this frontend work does not assert its release.

## Changes

- `app/listings/[slug]/page.tsx` reads top-level `sample_files`, falling back to `approved_presentation.sample_files`, and renders the backend scope sentence immediately after the scan-findings component in each route.
- `app/listings/[slug]/SampleFiles.tsx` contains page-local API carrier types and the small server-rendered sample block. It displays “Free sample: N files”, the purchased-set/free-download statement, names, binary human-readable sizes, and the three exact binding labels. Available links use only the carrier URL and filename as visible/accessibility text. Unavailable files retain their names, sizes and labels with “sample unavailable” and no link.
- Only the six public sample fields are consumed. No sample object is spread into DOM attributes or serialized into markup.
- `app/listings/[slug]/page.test.tsx` adds nine cases: both three-file routes (one unavailable each), null/absent byte parity on both routes, scope placement on both routes, extra private metadata ignored on both routes, and scope without findings or samples. Accessible link names are checked by role. The page test uses the repository's existing jsdom test environment.
- No snapshots, shared API types, lockfiles, backend code, or other product files changed.

## Validation

Environment: Node `v25.6.0`, npm `11.8.0`; dependencies installed with `rtk npm ci` from the existing lockfile. Validation results are recorded below.

- `rtk npm test -- 'app/listings/[slug]/page.test.tsx'`: **23 passed**, including all nine added cases. Existing snapshots passed without updates.
- Final `rtk npm test -- --maxWorkers=2`: **743 passed, 2 failed (745 total); 90 test files passed, 2 failed (92 total)**. All listing-page tests passed. Failures: the baseline login assertion below, plus the unchanged `SavedWorkspaceData.test.tsx:110` 22,000-file test intermittently failing to find “Showing 51–100 of 22,000” after clicking Next. That test passed in the earlier two-worker candidate run and the exact-base full-suite run; no related implementation or test was changed.
- Follow-up `rtk npm test -- components/seller-workspace/SavedWorkspaceData.test.tsx`: candidate **6 passed, 1 failed** with the same paging assertion; exact base **7 passed**. Its root cause is unresolved; unlike the login failure, the paging assertion was not reproduced at the base. The relevant workspace files are byte-unchanged, and its earlier candidate pass establishes inconsistent results across runs.
- `rtk npm run lint`: **0 errors, 7 warnings**, all `@next/next/no-img-element` in unchanged files (`app/blog/[slug]/page.tsx`, `app/dashboard/settings/page.tsx`, `app/l/[code]/page.tsx`, `components/Layout.tsx` twice, `components/listings/SellerShareControls.tsx`, `components/listings/ShareKitModal.tsx`).
- `rtk npm run typecheck` (`tsc --noEmit`): **passed, 0 errors**.
- `rtk git diff --check`: passed.
- Exact-base comparison: an isolated detached worktree at `ec8aadcc275fb13e6c8acbdf5b020825079e4b6b`, using the same installed dependencies and `rtk npm test -- --maxWorkers=2`, returned **735 passed, 1 failed; 91 test files passed, 1 failed (92 total)**. The failure is `app/login/LoginForm.test.tsx:146`, “shares one flight between a manual click and subsequent hinted hydration”: its `Storage.prototype.setItem` spy receives no `oauth_nonce` call. This reproduces the candidate's unrelated login failure. The temporary baseline worktree was removed after verification.

The first unrestricted `rtk npm test` run returned 741 passed and 4 failed: the same login assertion plus three timing failures (22,000-file streaming, 22,000-file selection, and workspace duplicate-history rendering). The timeouts cleared with two workers and no changes to those tests or implementations. Intermediate test-only type/environment issues were corrected before the final verification.

## Delivery boundary

Frontend implementation only. No PR, merge, deployment, provider change, or backend mutation. E's backend under-review state remains as supplied in the task. The full frontend suite must not be reported as entirely green: the final run has the reproduced baseline login failure and an intermittent failure in the unchanged workspace selection test.
