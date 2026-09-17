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
permission. There is no signed seller decision-control TODO in this frontend.

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
