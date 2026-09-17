# S1717 chunk D frontend builder report

Date: 2026-09-17. Result: implemented and tested; no PR, deployment, backend changes, or listing-page changes.

## Identity and authority

- Branch: `build/bq-multi-file-datasets-s1717-d-frontend`.
- Base: `ec8aadcc275fb13e6c8acbdf5b020825079e4b6b` (frontend `origin/main`, verified after fetch).
- Implementation commit: `d48cff2474ad380b9a98ebc612390b89db896d08`. This report is a separate documentation commit.
- Runbooks fetched and read using `git show origin/main:<path>`: `e950329de39e966fdb194d2a3fc73750c554a813` (advanced from the dispatch's `a64d6665`). Authority: `BQ-MULTI-FILE-DATASETS-S1717-CHUNK-D-STORE-AMENDMENT.md` sections 3.6 and 7, Gate 2 sections 2 and 4.4, Gate 1 D5 buyer path. Buyer requirements remain as dispatched.
- Backend contract read using `git show origin/build/bq-multi-file-datasets-s1717-d:<path>` at `9e3b95fcd5f024e5f009bfcb3c6518f831ae9c85`: `app/api/v1/endpoints/orders.py` and `app/services/delivery_buyer.py`.

## Behavior

The buyer order page detects directory orders by manifest hash or a read-only member-list probe. Directory orders do not enter legacy automatic download preparation. Only a definitive 404 or an empty member list permits the no-hash legacy path; transient discovery failures fail closed without consuming an allowance. Workspace orders retain their existing path.

The section lists basenames and human-readable sizes. It explicitly requests one set-scoped grant, displays remaining allowances and expiry, and reuses that grant for each delivered member. Renewing requires a buyer action and explains that another allowance is consumed. Grant expiry/margin and backend `grant_expiring`/`invalid_grant` refusals offer renewal. Unavailable members display “File unavailable — support notified” with no action. A subsequent `member_unavailable` refusal updates that row immediately. Named grant, delivery and byte-budget refusals are visible; arbitrary backend diagnostics are not echoed.

The grant is held only in component state, never in DOM attributes, links, URLs, storage or logs. Hashes are not rendered. Access is buyer-gated and respects the order's expired access window and the existing terms gate.

### Browser redirect implementation detail

One necessary helper, `memberDownload.ts`, is colocated with the component and uses a Next server action. This is the only addition beyond the page, component, tests and snapshot within the order folder. It preserves the specified backend API without backend edits.

A browser's `fetch(..., {redirect: 'manual'})` returns an opaque redirect without a readable Location. Automatic following can carry the custom download header to the storage origin and fetch file bytes. See the [Fetch standard](https://fetch.spec.whatwg.org/#http-redirect-fetch) and [opaque-redirect response definition](https://fetch.spec.whatwg.org/#concept-filtered-response-opaque-redirect).

The helper therefore makes exactly one GET to the configured backend's canonical order/member address, with the authenticated buyer bearer and `X-Download-Token`, `redirect: manual`, `cache: no-store`, and a timeout. It reads the backend's 302 Location server-side, validates an HTTPS destination without embedded credentials, and returns only that URL. The browser opens it with a no-referrer download anchor. The helper never follows the redirect or fetches member bytes; neither credential is forwarded to storage. The action holds credentials transiently for the request and does not persist them. Caller-controlled destinations cannot select the upstream host/path.

## Validation

Environment: Node `v25.6.0`, Vitest `4.1.8`, TypeScript `5.9.3`; reused the existing frontend installation through a local ignored node_modules symlink. No lockfile changes.

- Focused tests: `rtk npm test -- 'app/dashboard/orders/[id]/DatasetMembers.test.tsx' 'app/dashboard/orders/[id]/page.test.tsx' --maxWorkers=2` — **32 passed**, 2 files.
- Full suite: `rtk npm test -- --maxWorkers=2` — **759 passed, 1 failed**, 93 files (92 passed, 1 failed), 76.27 seconds.
- Remaining failure: `app/login/LoginForm.test.tsx`, “shares one flight between a manual click and subsequent hinted hydration”; expected the `oauth_nonce` storage write but received none. Independently reproduced in a fresh detached worktree at the exact untouched base: **23 passed, 1 failed** in that file. No login files were modified.
- Initial unrestricted full run: 752 passed, 4 failed; three unrelated workspace test timeouts disappeared with two workers. The final run includes four additional regression cases (760 total tests).
- `rtk npm run lint` — **0 errors, 7 existing no-img-element warnings** in unrelated files.
- `rtk npm run typecheck` (`tsc --noEmit`) — **passed**, 0 errors.
- `rtk git diff --check` — passed. `app/listings/**` diff against the base is empty.
- Legacy HTML snapshot: matched both the changed page and the exact original page source from the base, tested by temporarily substituting that source and running only the legacy snapshot test, then restoring the implementation. No existing snapshots were altered.

Coverage includes the three-member fixture (one unavailable), one grant shared across two member downloads, header authentication, 302 resolution and browser URL opening using mocked fetch/anchor click, no storage fetch by the helper, token/hash non-disclosure, all dispatched refusal names, meter bound copy, renewal failure retaining disabled access, duplicate-click protection, expired orders, seller exclusion, hash-less discovery and transient discovery failure.

Limits: transport and UI tests use mocked responses. This is not a real browser-to-deployed-backend/R2 delivery proof or an enabled-release claim. The existing login test remains red on the base. No PR was opened.
