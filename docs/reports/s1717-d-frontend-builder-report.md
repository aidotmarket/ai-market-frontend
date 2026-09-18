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


## R1 fold

Date: 2026-09-18. This section supersedes the original discovery, snapshot-parity, and refusal-coverage claims above.

### Scope and identity

Folded only the six dispatched findings on the existing `build/bq-multi-file-datasets-s1717-d-frontend` branch, starting at `2b037b6d2e1e9c990ad8d294195f7c4a602d06a0`. The supplied worktree was detached; changes were made in the clean existing branch worktree at `/private/var/tmp/koskadeux/minimal-bridge-worktrees/9527297b9381-d1684f`. No branch creation, rebase, history rewrite, PR, deployment, or backend change.

Code commits:
- `964b60a49eab5ad8e5f14a3198667e67767e041c` — discovery outcomes, retry UI/tests, unused member address removal, and snapshot removal.
- `6451b307fe8cbf99ea458d5912ead784fbd09c70` — explicit server API configuration and refusal/configuration tests.

Gate 2 and the D-store amendment were not re-read. Auth consultation: `runbooks/browser-session-auth.md`, cookie contract and access-token model; local `api/client.ts:87-110,144-152`. Backend reference is pinned to `aidotmarket/ai-market-backend` commit `cb9a235f75c08a2fa148393b8d7010e6feeb1f05`: members routes at `app/api/v1/endpoints/orders.py:940-966` and relevant member/disposition code in `app/services/delivery_buyer.py:99-118,155`.

### Finding dispositions

- **DeepSeek F1 HIGH — adopted.** Member discovery no longer rejects the order-details fetch. HTTP 404 selects legacy; HTTP 200 selects directory; any other status or transport failure selects files-unavailable. The order and transaction details remain visible, legacy automatic preparation is suppressed, and the dataset panel offers an explicit read-only retry without issuing a grant. Tests cover 403, 410, 503, recovery to an empty 200, repeated failure, retry to a definitive 404, and an unexpected 204.
- **DeepSeek F2 MEDIUM / GLM NIT-3 — adopted.** Removed the dead manifest-hash field/disjunct and non-empty-list heuristic. A no-hash `{members: []}` HTTP 200 shows the dataset panel and “No files are available yet.” without legacy `requestDownload` or automatic grant calls. The existing `delivery_not_complete` refusal copy remains covered.
- **DeepSeek F4 LOW — adopted with the expressly permitted bearer exception.** The action retains its `accessToken` argument. The frontend has no server-readable access-token session: the access token lives in Zustand memory, and the host-only refresh-cookie path and client bearer attachment are implemented in `lib/api.ts`; public route discovery is in `app/sitemap.ts`. That cookie is not sent to the Next action or members path. `withCredentials: true` enables browser refresh-cookie transport; the actual members API authorization uses the separately attached bearer. Reading Next cookies cannot recover this session. No new authentication mechanism or refresh-cookie rotation was introduced. The action now requires server-side `API_URL`; when unset it throws `MemberDownloadApiUrlMissingError` before fetch. The test explicitly sets the public URL to localhost while leaving `API_URL` unset and asserts the named error and zero fetch calls. There is no localhost/public-variable fallback. Deployment must supply `API_URL`; deployment configuration was not mutated or verified in this fold.
- **DeepSeek F3 / GLM LOW-2 — adopted via snapshot deletion.** Deleted the self-referential snapshot test and snapshot artifact. Legacy markup parity is **procedure-only**, not an automated candidate-equals-base assertion; no new base capture or parity run is claimed. All legacy fixtures use literals from this checkout's `types/index.ts:596-602`. Contrary to the finding's status premise, that union explicitly includes `fulfilled`; it remains in existing legacy fulfilled-download tests, while the fixture default is `pending_fulfillment`. This is a frontend type observation, not a claim about backend enum serialization.
- **GLM LOW-1 — adopted.** Added named-refusal and exact full-copy assertions for both `delivery_busy` (“Delivery is busy. Please try again shortly.”) and `delivery_retention_expired` (“This dataset is no longer available for download.”).
- **DeepSeek F5 NIT — adopted, all three parts.** Removed unused `DatasetMember.address` and its fixtures/state update. The browser `download={basename}` hint is ignored cross-origin; the backend supplies the filename through the storage response's `Content-Disposition`, configured by `delivery_buyer.disposition()` and passed to `presign_get` at the pinned backend. The browser hint is not the filename guarantee. Added an action-to-UI test for backend HTTP 403 “Download access has been closed”: it renders “Could not prepare this download. Please try again. (download_request_failed)”, emits no arbitrary diagnostics, and opens no URL.

Council state supplied with dispatch: DeepSeek REVISE, GLM APPROVE_WITH_NITS, CC not yet voted. These fixes do not constitute a new Council vote or approval.


### R1 validation and limits

- `rtk npm test -- 'app/dashboard/orders/[id]/DatasetMembers.test.tsx' 'app/dashboard/orders/[id]/page.test.tsx' --maxWorkers=2` — **39 passed**, 2 files, 5.52 seconds (previously 32).
- `rtk npm test -- --maxWorkers=2` — **766 passed, 1 failed**, 93 files (92 passed, 1 failed), 89.73 seconds. Exact inherited failing node: `app/login/LoginForm.test.tsx > shares one flight between a manual click and subsequent hinted hydration`. Assertion at `app/login/LoginForm.test.tsx:146:71`: expected `[['oauth_nonce', 'only-nonce']]`, received `[]`. This matches the previously documented untouched-base failure; the base reproduction was not repeated in R1. No login code or tests changed.
- `rtk npm run lint` — passed, **0 errors, 7 existing no-img-element warnings** in unrelated files.
- `rtk npm run typecheck` (`tsc --noEmit`) — passed, 0 errors.
- `rtk git diff --check` — passed; R1 changes are confined to the buyer order folder and this report.

No remaining dispatched R1 implementation gap under the permitted bearer-retention and procedure-only-parity options. The full suite remains red only at the exact inherited login node above. Tests use mocked transport, and there is no new live browser, deployed backend, or storage proof. Server `API_URL` availability remains a deployment prerequisite. No PR was opened.
