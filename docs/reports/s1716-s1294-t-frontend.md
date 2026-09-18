# S1716 S1294 T frontend

Status: completion fold authorized by Max, Event Ledger `b8ddbd10` (2026-09-18). The prior implementation receipts below are historical; the Completion fold section records current verification and production dependencies. No merge, deployment, production approval, key provisioning or seller-origin mutation is performed by this frontend task.

## Authority and recorded preconditions

- Backend `origin/main` verified at `ea7e777c1ee2a9925db1b221430937cd38694ad5`. T-backend merged/deployed and Alembic head `s1716_preview_disclosure` are supplied task preconditions; deployment and database identity were not independently probed here.
- Approved Chunk 2 producer: `aim-data e574e1df`, stable `aim-data-v1.24.0`, supplied approval authority. Its canonicalization and policy source were inspected.
- At the original implementation boundary, the keys route returned 503 according to that task. Max now reports HTTP 200 with `aim-preview-platform-2026-09`. The frontend maps this to no preview, with no error page or seller request.
- Frontend base: fetched `origin/main c23d6798ce5a484e6145a6d14195c328c5e8405c`. Branch: `build/bq-listing-enrichment-seller-tools-s1294-t-frontend-s1716`. Baseline tests use a detached worktree at this exact SHA, not a peer checkout.
- Read the full Chunk T contract, backend integration handoff, byte references, shared corpus, relevant Gate 2/addendum sections and producer references. Relevant existing runbooks: backend `docs/runbooks/listing-summary.md` and root `runbooks/aim-data-seller-publish-journey.md`. Scoped frontend procedure: [listing-sample-preview.md](../runbooks/listing-sample-preview.md).

## Milestones

| Milestone | Commit |
|---|---|
| Verifier, types, corpus | `78b7597` |
| TanStack table, shared columns | `90ac767` |
| Browser orchestration, buyer/seller mounts | `bac7e75` |
| Tests and browser-discovered corrections | `04ca0cd00123c8a3cef6223312f35ad64e11dbbe` |
| Report and receipts | This report commit |

Each implementation milestone was committed and pushed separately. The tests milestone includes envelope-wide depth/node counting, retained checkpoint consistency lookup, platform-key rebinding refusal, descriptor precision labels and the TanStack filter-state correction found in Chrome.

## Verifier and transport design

`lib/listing-preview` separates closed wire types, canonicalization, cryptography, transport, policy, column joining and renderer dispatch. The pure verifier runs under Node/Vitest and in the browser. It has no API, logging or storage dependency.

1. Bound and parse metadata with duplicate/NFC-colliding key rejection. Admit RFC 8785-compatible integer-only JSON under rule 2a: reject unsafe integers before JS rounding and reject object keys whose Python codepoint/JCS UTF-16 orders disagree. Typed large integers and decimals remain strings; dates and timestamps preserve declared precision, including nanoseconds.
2. Authenticate the platform envelope against the public platform key set **before resolving any seller key material**. Verify authenticated signer records, fingerprints, status, validity windows, exact used-key set and every F2 seller signature. WebCrypto Ed25519 is primary; only `NotSupportedError` invokes pinned `@noble/curves` 2.0.1 with strict RFC 8032 verification (`zip215: false`). Other crypto errors fail closed. Platform key IDs cannot rebound to different material during the module lifetime.
3. Recompute schema digest from canonical recursive descriptors, signed binding equalities, ordered sample hash, sampled-leaf-list digest, scan attestation and seller attestation. Verify dataset membership paths and the platform log checkpoint/inclusion evidence. A retained checkpoint is an independent predecessor; equal-size roots must agree and extensions require a consistency proof. No rows enter that metadata request.
4. Only after manifest verification, fetch the seller package in the browser: HTTPS, no query/fragment/userinfo, no redirects, omitted credentials, no referrer, CORS, no-store and exact media type. Reject literal/local/private/platform hosts, unexpected encoding, oversized Content-Length and over-limit streamed bodies. There is no server fetch or API proxy.
5. Admit only v2 complete rows: 100 rows, 25 fields, 250,000 canonical row bytes, 1,048,576 received package bytes, 262,144 manifest bytes, 63 siblings, depth 16 and 10,000 decoded envelope nodes, conjunctively. Recompute every row digest, leaf and inclusion path; check order/unique IDs/ordinals/indices; independently recompute `sample_hash` from actual ordered package entries.
6. Await an independent local scan, then fetch and verify the current manifest again. Check unchanged signed identities, current eligibility, monotonic/wall-clock agreement, cancellation and generation. Only then issue an immutable in-memory handle registered in a WeakSet. Forged/deserialized handles cannot render. The completion fold replaces the original always-refusing scan with the deterministic browser corpus under Event Ledger `b8ddbd10`.

No row or filter value is sent to ai.market, analytics, logs or storage by these modules. Static URL validation in browser JavaScript cannot inspect DNS answers or connected peer IPs; browser CORS/private-network controls and real seller hosting remain live integration obligations, not proven public-IP admission.

## Components and lifecycle

`SampleTable` uses `@tanstack/react-table` pinned exactly to **8.21.3**, with lockfile resolved URL/integrity. It renders a native semantic table, caption `Seller-selected sample`, scoped headers, ascending/descending/reset keyboard controls, a focusable scroll region and polite filtered-count live region. Sorting compares arbitrary integers/decimals losslessly; dates/timestamps use their canonical precision. Literal local search can be limited to one column. Missing, null and empty strings are distinct. Long values clip at 200 Unicode codepoints; Expand/Collapse and Escape retain focus. Cells never interpret markup or URLs.

Success wording is exactly: **This sample row matches the dataset commitment recorded by the seller.** Counts distinguish seller-selected rows from dataset rows; the limitation text and seller attestation/stale label accompany the table. Shared approved-column types and exact-name joining also drive SchemaTable/AtAGlance.

`ListingSamplePreview` mounts immediately after Schema Information using the canonical current slug and listing UUID, with no historical purchase-version sample lookup. SellerAtAGlance reuses the identical component for an approved current summary. There is no rollout flag. SSR renders no sample and makes no seller request. An absent/unsupported manifest renders nothing. Keys 503 renders nothing. A requested failure is neutral `Sample unavailable`. The table and verifier are dynamically imported only on View sample after a supported metadata response and available trust keys.

Tab/page departure clears rows immediately. Tab return, focus and bfcache restoration revalidate; a single five-second action timeout covers the full operation. Offline, failed, expired, cancelled and late responses remain hidden. Untouched tabs have no periodic refresh or expiry timer, per E.x. BuyerAtAGlance also clears stale aggregate metadata before return revalidation.

## Corpus and validation receipts

All **17** backend fixture files were copied byte-identically from the backend SHA above and compared again against Git object bytes and SHA-256. Full inventory: [s1716-preview-corpus-shas.json](s1716-preview-corpus-shas.json). Files were not regenerated to suit TypeScript.

Tests compare all ten F2 signature preimages/digests/signatures, the differential corpus, optional key expiry, canonical rows/schema/dataset roots, parser/integral-decimal vectors, historical/fractional log checkpoints and subsequent consistency checkpoints. Adversarial tests cover binding substitution, bad signatures, key admission, duplicate paths/ordinals/indices, changed/projected rows, unsafe integers/key ordering and conjunctive bounds. At 63/64 siblings, a valid admitted safe-integer tree cannot have that path depth; both oversized/incompatible paths are refused.

Final tested runtime commit: `04ca0cd00123c8a3cef6223312f35ad64e11dbbe`. [Receipt summary](s1716-t-frontend-evidence/summary.json), [receipt SHA-256 inventory](s1716-t-frontend-evidence/sha256.json), [dependency versions/integrities](s1716-t-frontend-evidence/dependency-pins.json), [snapshot byte comparison](s1716-t-frontend-evidence/snapshot-parity.json).

| Check | Exact baseline | Final candidate | Parity |
|---|---|---|---|
| Full Vitest, one worker | 744 passed / 1 failed / 0 skipped, 745 total | 878 passed / 1 failed / 0 skipped, 879 total | Same sole failure; zero branch-only failures in final run |
| Added preview tests | Not present | 134 passed / 0 failed | Golden, adversarial, API, table and lifecycle tests |
| Typecheck | Exit 0 | Exit 0 | Pass |
| Full ESLint | Exit 0, seven warnings | Exit 0, same seven warnings | Identical file/rule/message diagnostics |
| Production build | Exit 1 after successful compilation | Exit 1 after successful compilation | Same missing Keystatic configuration at page collection |
| Chrome harness | Not present | 3 passed / 0 failed / 0 skipped | Synthetic local harness only |
| Selected mutation executions | Not present | 3/3 observed assertion failures | All three mutations detected |

The shared failing test is `app/login/LoginForm.test.tsx`: “shares one flight between a manual click and subsequent hinted hydration”, expecting the oauth_nonce write but observing an empty array. It is unchanged. Build failure is missing `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET` and `KEYSTATIC_SECRET` for `/api/keystatic/[...params]`. Both builds compile and typecheck before that failure; neither is a completed build. API_URL is also unset on both, disabling the existing AI discovery rewrites. No secret values were read, invented or provisioned.

Earlier runs are retained in the summary and per-run receipts: default-worker baseline 741/745 passing; two-worker baseline 744/745 and candidate 867/872; first serial candidate 877/879. These had extra intermittent failures in large-fixture/Seller Workspace tests. The unchanged Seller Workspace file subsequently passed in full on each checkout. The final full candidate run has only the matching login failure. This records the observed final parity without erasing earlier failures or claiming to have fixed their nondeterminism.

Commands were `rtk proxy npm test -- --maxWorkers=1 --reporter=json --outputFile=<receipt>`, `rtk proxy npm run typecheck`, `rtk proxy npm run lint -- --format json --output-file <receipt>`, `rtk proxy npm run build`, `rtk proxy npx playwright test -c playwright.preview.config.ts` and `rtk proxy python3 scripts/preview-mutations.py`. Environment: Node v25.6.0, npm 11.8.0, Vitest 4.1.8, Next 15.5.12. Full parity suites ran sequentially. No tests were skipped or expectations changed to suppress failures. Baseline and candidate retain the exact pre-existing listing-page and AtAGlance snapshots; absent preview markup is also asserted empty after discovery.

Chrome 153.0.8010.52 / Playwright 1.56.1 passes the real component harness at **360, 375 and 390px**, including keyboard sequence, live counts, page overflow and zero-ingress synthetic markers in platform requests, console and browser storage. The first browser run caught an infinite TanStack reset from unstable globalFilter identity; memoizing the filter and disabling unused pagination resets fixed it. The final browser run passes 3/3. Tests inject a synthetic-only scan adapter outside Next routes. This historical run does not demonstrate real seller CORS/CDN behavior or live approvals.

The partially completed Next production compilation also places table/verifier markers outside all initial listing-page chunks. This is static compiled-bundle evidence; the build does not complete page collection because required Keystatic environment configuration is absent.

### Observed mutations

The reproducible [mutation script](../../scripts/preview-mutations.py) uses disposable copies and preserves the working candidate. All three selected tests pass on the candidate and fail with assertion failures (exit 1) under these mutations:

| Mutation | Detecting test |
|---|---|
| Skip platform-envelope authentication | Platform-before-seller-key verification test |
| Stop awaiting local policy, allowing early display | Component refuses rows while scan/final verification is pending |
| Drop ordered package sample_hash recomputation | Rebound package/manifest hash is rejected |

This is observed execution, not proposed mutation coverage. Raw synthetic-only logs and hashes are included in the receipt directory. Mutation test-name selection intentionally excludes unrelated tests; it is not a full-suite skip.

## Current production dependencies

Max decision Event Ledger `b8ddbd10` resolves the three earlier design boundaries:
F2 producer attestation plus deterministic browser policy replaces the browser ML
requirement; the dedicated signed-payload read supplies approved labels; sellers
sign sample decisions in AIM Data. The seller sample mount displays state and the
identical buyer preview. Existing metadata-only summary controls grant no sample
permission. Sample signing remains in AIM Data.

Production dependencies are the signed-payload read deployment and a real approved
v2 package from Sergey. Max reports keys HTTP 200 with
`aim-preview-platform-2026-09`. Real seller-origin CORS/no-store/media/redirect
behavior, approval/refresh/withdrawal, CDN removal, and live fresh/return withdrawal
proof await that package and the production verification step. Synthetic unit and
browser evidence does not establish those live results. Chunk 5 retirement and
independent review remain separate release obligations. No merge is authorized.

The build comparison must distinguish parity from a completed production build:
missing Keystatic configuration previously blocked page collection on both the
baseline and candidate after compilation. Current rerun receipts follow below.

## Completion fold

Authority: Max decision Event Ledger `b8ddbd10`, 2026-09-18. Work continued in the
preserved clean branch at `5dfece96a`; the supplied working directory belonged to
a different detached checkout and was left untouched. No merge or deployment.

| Item | Commit | Verified implementation |
|---|---|---|
| Producer attestation and browser deterministic policy | `67222e39edf6426158e75079262c0e968f63de7c` | F2-first verification, exact scan identity/digests, complete-row scan, shared vectors and five mutation definitions |
| Signed summary label join | `079a57c` | No-store optional read, RFC8785 summary hash recomputation, exact summary/render/source binding, identity-only fallback |
| Seller display scope | `165f878` | AIM Data owns sample signing; seller sample display uses the identical buyer component |
| Production-scanner browser evidence | `421dd99782acbd1b56a676ce01d0d4a0411d8559` | Removed synthetic scan adapter; Chrome uses real deterministic rules; explicit attestation failure hides all rows |

The policy is `aim-preview-policy-v1-deterministic`, version `1.0.0`. Its producer
reference is `aim-data origin/main` at
`119f643b5fd25dc8fd61557649371c9832ca33c5`,
`app/services/preview_content_policy.py`. The browser scans complete original row
keys and scalar values recursively, including unselected fields and array
elements, plus NFC-normalized strings. Descriptor-proven numeric values preserve
the producer's formula exception. Rules cover secrets, private-key headers,
connection strings, known token formats, entropy at 24 characters and 4.0 bits per
character, executable markup/macros, formulas, URLs, personal-data patterns,
restricted-content notices, control characters, 500-character and 80-word bounds.
Unicode word boundaries/digits and Python's special case-insensitive I handling
are carried into the browser rules. No ML model runs in the browser.

All **59** pass/fail vectors in
[the cross-repo fixture](../../tests/fixtures/preview/aim-preview-policy-v1-deterministic-vectors.json)
are evaluated both against the pinned Python `check_text` function and by
Node/Vitest through the browser scanner. Fixture SHA-256:
`7216bd5f719f4ff576c4c40fef142be6f0121663cc82ab5e059d1881a8f238b1`.
The reproduction script executes only the deterministic AST definitions and does
not import ML services. This is producer-rule parity, not ML detector parity.

Attestation verification authenticates the platform envelope before seller keys,
checks every F2 proof signature and requires policy `aim-preview-policy-v1`,
version `1.0.0`, verdict `passed`, the recomputed `sampled_leaf_list_digest`, and
`scan_attestation_digest` exactly bound by the signed manifest. Tests reject
modified policy/version/verdict/signature, signed mismatched leaf-list and scan
digests, unsafe nested rows, and unsafe hidden columns. No row is inserted until
the complete scan and final current-manifest verification succeed. Failure
exposes only neutral UI text and fixed reason enums, never matched content.

The signed-payload adapter expects `{payload, summary_hash, render_hash,
source_revision, approval_version}`. It hashes the original payload locally,
checks F2-bound identities, and joins exact column names. Missing deployment,
malformed response, changed hash, or absent approved head retains identity-only
columns without an error. A synthetic payload fixture covers valid descriptions
and units, tampering and fallback. The named backend amendment branch was not
published when inspected; its actual response shape and production deployment
remain integration checks. No production signed-payload response is claimed.

### Verification receipts

Full comparison uses freshly fetched `origin/main` at
`3f15c1566a8f9aee2c96af397ff1eaab30f34fbc` in an isolated detached baseline. Both checkouts used
`npm ci --ignore-scripts`, Node v25.3.0, npm 11.7.0, Vitest 4.1.8 and Next 15.5.12.

| Check | Baseline | Candidate | Result |
|---|---|---|---|
| Full Vitest, one worker | 775 passed / 1 failed / 0 skipped, 776 total | 963 passed / 1 failed / 0 skipped, 964 total | Same login failure; zero branch-only failures in final run |
| Preview suites | Not present | 219/219 passed | Includes all 59 vectors, attestation, payload join, DOM and lifecycle cases |
| Typecheck | Exit 0 | Exit 0 | Pass |
| Full lint | Exit 0, seven warnings | Exit 0, identical seven warnings | Exact file/rule/message/position parity |
| Production build | Exit 1 after compilation | Exit 1 after compilation | Identical Keystatic configuration error and page-collection failure |
| Chrome, actual deterministic scanner | Not present | 3/3 passed | 360/375/390px, keyboard, layout and synthetic zero-ingress checks |
| Observed mutation failures | Not present | 5/5 detected | Three prior mutations plus skip-scan and skip-attestation |

The unchanged login failure is `shares one flight between a manual click and
subsequent hinted hydration`, expecting the `oauth_nonce` write and receiving an
empty array. Baseline has 31 newer tests in the unrelated dataset-members/order
files that are absent from this preserved branch; no test was skipped, deleted,
or changed to obtain parity. This task did not rebase or merge unrelated work.

The first full candidate run was 962/963 passing (before the last DOM assertion).
The next run was 962/964: it additionally hit the unchanged Seller Workspace
idempotency test. Its source/test files match baseline exactly, and the complete
file then passed 32/32 on each checkout. The final full run above includes the
last DOM assertion and restores zero branch-only failures. All three candidate
receipts are retained; no claim is made that the unrelated intermittent test was
fixed.

Both builds compile and fail during page collection for
`/api/keystatic/[...params]` with the exact same missing
`KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, and
`KEYSTATIC_SECRET` configuration. The full logs differ in timing and bundle stack
locations; the error text, missing fields, affected route and compile outcome are
identical. Neither build completed. No credentials were read or provisioned.

The five observed assertion failures are: skip platform-envelope authentication;
stop awaiting the local scan; drop ordered package `sample_hash` recomputation;
skip deterministic scan; skip attestation check. Mutations run in disposable
copies. Each exited 1 with an assertion failure, not a collection/config error.
The last two are caught by signed synthetic packages that would otherwise issue
a display handle. Production and fixture source files remained intact.

[Machine summary](s1716-t-frontend-completion-evidence/summary.json),
[all receipt hashes](s1716-t-frontend-completion-evidence/sha256.json),
[commands and exit codes](s1716-t-frontend-completion-evidence/parity-runs.json),
[final full-suite command](s1716-t-frontend-completion-evidence/candidate-vitest-final-command.json).
Raw full test reports, lint diagnostics, build logs and mutation logs are included.
The browser receipt records the observed command result and synthetic boundary.

Reproduction commands: `rtk proxy python3 scripts/preview-policy-vectors.py`,
`rtk proxy npm test -- lib/listing-preview components/listings/ListingSamplePreview.test.tsx components/listings/SampleTable.test.tsx --maxWorkers=1`,
`rtk proxy python3 scripts/preview-mutations.py`,
`rtk proxy npm test -- --maxWorkers=1 --reporter=json --outputFile=<receipt>`,
`rtk proxy npm run typecheck`, `rtk proxy npm run lint -- --format json --output-file <receipt>`,
`rtk proxy npm run build`, and `rtk proxy npx playwright test -c playwright.preview.config.ts`.

### What awaits production

The [live keys receipt](s1716-t-frontend-completion-evidence/production-keys.json)
confirms HTTP 200, no-store and `aim-preview-platform-2026-09`. The signed-payload
read awaits backend response-shape confirmation/deployment; until then the UI
silently shows identity-only columns. A real approved v2 package awaits Sergey.
That package is needed for real seller-host transport, approval/refresh/withdrawal,
CDN and fresh/return withdrawal proofs. Local tests and synthetic Chrome runs do
not replace those production checks. The completion fold is committed and pushed;
no merge or deployment is performed.

The first push was refused by the enabled secret-scan hook because two adversarial
fixtures resembled an AWS key/private-key header. Those deliberately synthetic
values now use fragments assembled only during tests. The hook was not bypassed
or modified. [Representation proof](s1716-t-frontend-completion-evidence/fixture-representation.json)
confirms all 59 decoded inputs and expected verdicts are identical to the full
suite's tested corpus; only the stored fixture SHA changed. The full 219-test
preview suite and typecheck were rerun after this representation-only change.

## Gate-2 fold (S1719)

### Browser/producer deterministic boundary vectors

The shared 59-vector producer-derived fixture remains byte-identical at SHA-256
`7216bd5f719f4ff576c4c40fef142be6f0121663cc82ab5e059d1881a8f238b1`.
The following boundary cases are frontend-only Vitest vectors so this fold does
not rewrite that pinned producer corpus:

| Boundary | Python producer result | Browser result | Direction |
|---|---|---|---|
| `copyrİght`, `copyrıght` | `restricted_content` via Python `re.IGNORECASE` | `restricted_content` after explicit `İ`/`ı` to `i` folding | Same rejection |
| `paſſword=example`, `AKIA` plus 16 ASCII characters | `secret` via Python special case folding | `secret` via JavaScript Unicode `iu` folding | Same rejection |
| 81 words separated by U+001C, U+001D, U+001E, U+001F, or U+0085 | `long_prose` because Python `str.split()` treats the separator as whitespace | `control_character` because JavaScript `\s` does not split it | Reason differs; both reject |
| The same 81 words separated by U+FEFF | `control_character` because Python does not split on U+FEFF | `long_prose` because JavaScript `\s` splits on U+FEFF | Reason differs; both reject |
| Any differing whitespace point above followed by `=1` | `control_character` before Python reaches `lstrip()` | `control_character` before the browser reaches `trimStart()` | The lstrip/trimStart class differs, but ordering makes the outcome identical |

These are every deliberate case-folding and whitespace-class seam in
`checkPolicyText`. Case-fold outcomes remain equivalent for the special Unicode
points above. Whitespace differences can change only the fixed reason enum,
because every differing separator is independently rejected as Unicode Cc or
Cf. The browser is therefore never weaker and never admits a row the producer
rejects on these seams.

### Finding disposition

This section supersedes the earlier completion-fold statements about the
signed-payload fixture, mutation count and final suite totals. The fold started
from `94d1bc74c643a5a93f2f099dcaaa50e2bb826012`. Commit
`75ad36ace19e3a51234c8c76a51ea526cfb5a851` cleanly merged fetched
`origin/main` at `3f15c1566a8f9aee2c96af397ff1eaab30f34fbc`; it has exactly those two
parents. Each row below was committed and pushed separately.

| Finding | Fold | Commit |
|---|---|---|
| DeepSeek F1 / GLM 1 | The legacy `SchemaTable` path now performs a tolerant exact-name label join. Null or malformed schemas render without throwing; duplicate names retain the origin/main rows but receive no ambiguous label. The verified sample path retains the strict duplicate refusal and hides every row. Buyer, seller and public-listing tests cover duplicate, empty, non-string and null inputs. | `3b2782b` |
| Contract amendment B | After every fetched row has passed its row digest and Merkle proof, the verifier hashes its actual ordered leaf hashes with `aim-preview-sampled-leaves-v1\0` and compares the result with the signed attestation before invoking the corpus. A validly re-signed different-leaf-set fixture fails with fixed reason `sampled_list_mismatch` and never invokes the scan. Only `1.0.0` of `aim-preview-policy-v1` and `aim-preview-policy-v1-deterministic` is accepted; other versions fail as `scan_policy_unknown`. | `23a0226` |
| DeepSeek F2 / GLM 2 | Addendum E.x was checked and grants no negative clock-skew allowance. The fail-closed rule therefore remains. A device time earlier than signed `generated_at` now yields distinct fixed reason `clock_uncertain`; actual expiry remains `manifest_expired`. Neutral UI tests prove no rows or seller fetch escape. | `d7250ce` |
| DeepSeek F5 / GLM 3 | Vitest now assembles the complete shared signing/request/checkpoint/log fixture and runs it through `verifyManifest` with the fixture's own trusted platform key. A column-order mutation is rejected. The separate budget fixture remains its declared unsigned sizing skeleton and is not misrepresented as a valid signed manifest. | `c471028` |
| DeepSeek F3/F8 / CC NIT-2 | The shared producer fixture remains byte-identical. The table above records every deliberate case-fold, split-whitespace and lstrip/trimStart seam; boundary vectors live only in frontend tests. Each seam is equivalent or stricter in the browser, never weaker. | `48a2137` |
| DeepSeek F4 | The label-binding fixture is an ASGI response captured from the real backend branch implementation of `GET /api/v1/public/listings/{slug}/at-a-glance/signed-payload`, including its response envelope and provenance. Hash binding, identity-only fallback and an explicit non-throwing 404 path are tested. | `2934947` |

The clock question remains open at the contract level: should a future signed
contract grant a bounded negative-skew allowance? This frontend does not invent
one. Under the current contract, sufficiently slow device clocks can make a
valid sample unavailable, but support can now distinguish that condition by
the `clock_uncertain` reason enum.

### S1719 validation

Validation was performed at candidate `2934947` and against the clean detached
origin/main baseline above:

| Command/check | Result |
|---|---|
| `npx tsc --noEmit` | Candidate exit 0. |
| `npx vitest run --maxWorkers=1` | Final candidate: 1,020 passed, 1 failed, 1,021 total. Origin/main: 775 passed, 1 failed, 776 total. The sole failure on both is `app/login/LoginForm.test.tsx` / `shares one flight between a manual click and subsequent hinted hydration`, expecting an `oauth_nonce` write and receiving `[]`. |
| First candidate full-suite run | 1,018 passed and 3 failed. Besides the same login failure, two untouched Seller Workspace tests failed intermittently; their isolated rerun passed 39/39 and the second full run left only the baseline login failure. No Seller Workspace file was changed. |
| `npx eslint components/listings lib/listing-preview 'app/listings/[slug]'` | Exit 0. Two existing `@next/next/no-img-element` warnings remain in `SellerShareControls.tsx:192` and `ShareKitModal.tsx:65`. |
| `npx next build` | Candidate and origin/main both compiled successfully, then failed while collecting `/api/keystatic/[...params]` for the same missing `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET` and `KEYSTATIC_SECRET`. No credential was added or read. |
| `python3 scripts/preview-policy-vectors.py` | All 59 producer vectors passed; shared fixture SHA-256 remained `7216bd5f719f4ff576c4c40fef142be6f0121663cc82ab5e059d1881a8f238b1`. |
| `python3 scripts/preview-mutations.py` | All seven mutations were killed: skip platform envelope, render before policy completion, drop package sample hash, skip deterministic scan, skip attestation, skip fetched-leaf digest, and accept unknown policy version. |
| Backend route fixture check | On backend viewer-scan amendment head `5e7d9732`, `pytest -q tests/test_listing_summary_signed_payload.py -x` passed 13/13 before the ASGI response was captured. The backend checkout was not modified. |

Fold-only changed files are
`app/listings/[slug]/page.test.tsx`, the listing At-a-Glance, schema and preview
components/tests, `lib/listing-preview/{api,columns,policy,verifier,wire}` and
their tests, `scripts/preview-mutations.py`,
`tests/fixtures/preview/signed-summary-payload.json`, this report, and
`docs/runbooks/listing-sample-preview.md`. The runbook update replaces its
synthetic signed-payload claim with the verified backend response shape.

Residual risk is limited and explicit: no real production package or live
seller host was exercised; the current contract can reject valid packages on a
slow-clocked device; the unrelated LoginForm test remains failing on main; and
a credential-free production build cannot pass the pre-existing Keystatic
page-data gate. Scope was strictly followed: no product behavior beyond the six
findings was changed, the producer fixture bytes were preserved, no backend
source was edited, and there was no merge to main or deployment.
