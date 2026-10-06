# S1720 P2-C Council round-3 fold report (evidence limits corrected by S1766)

Date: 2026-09-19

Base: `a75858c5929509591325bd3e7d156fcb36b09bfe`

Branch: `build/bq-listing-enrichment-seller-tools-s1294-p2c-parity-s1720`

The exact pushed head is recorded in the handoff because a commit cannot contain
its own SHA.

## Result

- The browser harness mounts its own replica of the buyer split composition:
  `BuyerAtAGlance` with `includeSample={false}`, followed by the schema and one
  separate `BuyerSamplePreview`.
- Browser coverage requires exactly one buyer sample after the schema, the exact
  commitment label and proof-limitations sentence in the buyer region, and zero
  seller-only chrome landmarks there. It also checks deterministic sample text
  from the shared component with identical props and closes the harness buyer
  region against unexpected direct content. These are harness assertions, not
  evidence from `app/listings/[slug]/page.tsx`.
- Cancelling aggregate-statistics removal clears stale state and reports that
  the statistics were not removed and nothing was sent.
- Seller guidance describes the shared sample content and states that the
  public listing places the sample after the schema. That wording is not
  independent parity evidence.
- The missing-write-fields test edits a unit before Save, enters the guarded
  save path, verifies the AIM Data republishing action, and would call the write
  API if the guard were removed.

Equal text from two instances of the same sample component with identical props
shows determinism; it does not independently prove seller/buyer parity. The
round-3 structural assertions exercise `tests/preview-browser/main.tsx`, which
duplicates the intended layout. They cannot detect a composition regression in
the actual public listing route. The test wording and comment now reflect this
limit; its structural and proof-label assertions remain intact.

S1766 / Support T-2026-000797 adds focused composition cases to
`app/listings/[slug]/page.test.tsx`, invoking the actual route with normal and
approved Workspace listing fixtures. Only `BuyerAtAGlance` and the standalone
`BuyerSamplePreview` become prop-recording markers in those isolated cases;
the route and Schema Information block remain real. Existing behavioral tests
and snapshots continue to render the actual components. The cases require
`includeSample === false`, one standalone sample, and that sample after the
actual schema block. This is local route-composition evidence, not independent
seller/buyer content parity.

## Changed files

- `components/listings/SellerAtAGlance.tsx`
- `components/listings/SellerEnrichmentControls.test.tsx`
- `components/listings/SellerEnrichmentControls.tsx`
- `docs/reports/s1720-p2c-parity.md`
- `tests/preview-browser/main.tsx`
- `tests/preview-browser/preview.pw.ts`

## Local verification

The commands and results below are the historical S1720 runs. S1766 changes only
test wording/comments in the browser harness and does not rerun that suite.

Repository lint:

```text
> eslint .
7 warnings, 0 errors
```

The warnings are the pre-existing `@next/next/no-img-element` warnings in blog,
settings, short-link, layout, and share components. No changed implementation
file produced a lint warning.

Repository typecheck:

```text
> tsc --noEmit
```

Complete Vitest suite, one worker:

```text
Test Files  103 passed (103)
Tests       1017 passed (1017)
```

Complete preview-browser Playwright suite using Chrome and one worker:

```text
4 passed (3.4s)
```

`git diff --check` produced no output and exited zero.

## Mutation proof

These historical mutations changed the browser replica, not the actual route.

Both mutations were applied separately to the green round-3 candidate and then
fully reverted before the final verification run.

1. A second `BuyerSamplePreview` was mounted in the buyer region. The focused
   Playwright parity test exited 1: the buyer sample count expected one and
   received two.
2. `<p>Seller only: not shown to buyers</p>` was inserted inside
   `BuyerPreviewContent`. The focused Playwright parity test exited 1: the buyer
   content assertion expected zero seller-only lines and received one.

## S1766 maintenance verification — 2026-10-06

Base: `20e7b807d0e89a525b1e2d567cb9f0c758f7666c`. Assigned checkout:
`/var/tmp/koskadeux/minimal-bridge-worktrees/764d169f7d09-888cac`.
Publication branch: `build/t797-real-listing-composition-s1766`.

| Check | Result | Exit code |
| --- | --- | --- |
| Exact-base existing page tests, before edits | 36 passed | 0 |
| Focused actual-route composition cases | Normal and approved Workspace passed | 0 |
| Remove actual page's `includeSample={false}` temporarily | Both cases failed at the prop assertion | 1 |
| Move actual page's standalone sample before schema temporarily | Both cases failed at the order assertion | 1 |
| Restored page plus relevant existing component tests | 79 passed across 5 files; existing snapshots passed without updates | 0 |
| Typecheck and focused lint | Passed | 0 each |

Focused route command (also run separately for each negative control):

```sh
rtk proxy node node_modules/vitest/vitest.mjs run 'app/listings/[slug]/page.test.tsx' --maxWorkers=1 -t 'real public listing route sample composition'
```

Restored page/component verification:

```sh
rtk proxy node node_modules/vitest/vitest.mjs run 'app/listings/[slug]/page.test.tsx' components/listings/BuyerAtAGlance.test.tsx components/listings/AtAGlance.test.tsx components/listings/SchemaTable.test.tsx components/listings/ListingSamplePreview.test.tsx --maxWorkers=1
rtk proxy node node_modules/typescript/bin/tsc --noEmit --incremental false
rtk proxy node node_modules/eslint/bin/eslint.js 'app/listings/[slug]/page.test.tsx' tests/preview-browser/preview.pw.ts
```

Full raw logs, command/exit-code JSON receipts, mutation diffs and restoration
hashes are retained privately at
`/var/tmp/s1766-t797-evidence-764d169f7d09/`. Both negative controls mutated only
the assigned checkout and restored the production page byte-for-byte to the
prepared base after each run. The final production page and all 90 production
component files remain byte-identical to that base. The prepared base and peer
checkouts were not changed. There were no baseline test failures.

This maintenance detects actual route composition regressions before release
and corrects the interpretation of replica evidence. It addresses a test
coverage gap; no current production outage was demonstrated.

## Limits

The S1720 browser evidence covers the replica harness and shared-component
determinism only. The S1766 focused tests cover the actual route composition
with mocked client boundaries and fixture API responses. Neither proves live
seller/buyer parity, deployment, feature activation, production data, or a
real-listing Gate 4 pass.
