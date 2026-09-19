# S1720 P2-C Council round-3 fold report

Date: 2026-09-19

Base: `a75858c5929509591325bd3e7d156fcb36b09bfe`

Branch: `build/bq-listing-enrichment-seller-tools-s1294-p2c-parity-s1720`

The exact pushed head is recorded in the handoff because a commit cannot contain
its own SHA.

## Result

- The browser harness now mounts the buyer route's split composition:
  `BuyerAtAGlance` with `includeSample={false}`, followed by the schema and one
  separate `BuyerSamplePreview`.
- Browser coverage requires exactly one buyer sample after the schema, the exact
  commitment label and proof-limitations sentence in the buyer region, and zero
  seller-only chrome landmarks there. It also keeps verified sample-content
  parity and closes the buyer composition against unexpected direct content.
- Cancelling aggregate-statistics removal clears stale state and reports that
  the statistics were not removed and nothing was sent.
- Seller guidance now preserves exact content parity while accurately stating
  that the public listing places the sample after the schema.
- The missing-write-fields test edits a unit before Save, enters the guarded
  save path, verifies the AIM Data republishing action, and would call the write
  API if the guard were removed.

The round-2 claim that equal text from two instances of the same sample component
proved browser parity has been removed. The round-3 test combines route-composition
assertions with content parity so the required regressions fail independently.

## Changed files

- `components/listings/SellerAtAGlance.tsx`
- `components/listings/SellerEnrichmentControls.test.tsx`
- `components/listings/SellerEnrichmentControls.tsx`
- `docs/reports/s1720-p2c-parity.md`
- `tests/preview-browser/main.tsx`
- `tests/preview-browser/preview.pw.ts`

## Local verification

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

Both mutations were applied separately to the green round-3 candidate and then
fully reverted before the final verification run.

1. A second `BuyerSamplePreview` was mounted in the buyer region. The focused
   Playwright parity test exited 1: the buyer sample count expected one and
   received two.
2. `<p>Seller only: not shown to buyers</p>` was inserted inside
   `BuyerPreviewContent`. The focused Playwright parity test exited 1: the buyer
   content assertion expected zero seller-only lines and received one.

## Limits

This is local frontend implementation and browser evidence. It does not claim a
deployment, feature activation, production data, or a real-listing Gate 4 pass.
