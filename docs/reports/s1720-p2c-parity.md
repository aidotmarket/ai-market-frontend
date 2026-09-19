# S1720 P2-C frontend parity report

Date: 2026-09-19

Base: `400d0efdf0dd88ac7aedb8eb0ca36f77ea1eb661`

Branch: `build/bq-listing-enrichment-seller-tools-s1294-p2c-parity-s1720`

The exact pushed head is recorded in the handoff because a commit cannot contain
its own SHA.

## Result

- The closed At-a-glance renderer now includes the dataset origin statement,
  dataset limitations, and approved aggregate statistics. Origin attribution is
  preserved, absent limitations emit no buyer markup or assurance, and aggregate
  row count, temporal coverage, columns, buckets/groups, derivation labels, and
  derivation times remain visible as inert text.
- The renderer has no audience input. Seller review and the public page use the
  same `BuyerPreviewContent`, including the same local sample verifier, selected
  columns, and proof-limitations sentence.
- Seller-only chrome lists omitted fields with an explicit absence disclaimer,
  summarizes attribution, and shows selected sample fields read-only with AIM
  Data identified as the place where selection is set and signed.
- The collapsed optional-details control uses authenticated
  `GET`/`PUT /api/v1/listings/{listing_id}/enrichment`. It supports dictionary
  units, one origin statement, up to ten limitations, and include/exclude of the
  exact AIM Data aggregate object. It has no completion meter or approval block.
- PUTs carry the current `source_revision` and one request UUID. An uncertain
  identical retry retains that UUID. A stale revision reloads current state for
  review without retrying. Successful changes reload both enrichment and the
  pending buyer bundle so stale approval state is not retained.
- The 25-column product limit and committed-schema mismatch refusals have exact,
  actionable seller messages. Unicode counters use code points, matching the
  backend's declared character limits.
- Aggregate bucket/group hand authoring remains deferred. AIM Data remains the
  producer; the web control only includes or excludes its exact aggregate object.

## Changed files

- `app/listings/[slug]/page.tsx`
- `app/listings/[slug]/__snapshots__/page.test.tsx.snap`
- `app/login/LoginForm.test.tsx`
- `components/listings/AtAGlance.tsx`
- `components/listings/AtAGlance.test.tsx`
- `components/listings/BuyerAtAGlance.tsx`
- `components/listings/ListingSamplePreview.tsx`
- `components/listings/ListingSamplePreview.test.tsx`
- `components/listings/SellerAtAGlance.tsx`
- `components/listings/SellerAtAGlance.test.tsx`
- `components/listings/SellerEnrichmentControls.tsx`
- `components/listings/SellerEnrichmentControls.test.tsx`
- `components/listings/__snapshots__/AtAGlance.test.tsx.snap` (removed)
- `lib/api.ts`
- `lib/api.summary.test.ts`
- `tests/summaryFixture.ts`
- `docs/reports/s1720-p2c-parity.md`

The login test change is test-only: the base test observed the completed redirect
but missed the nonce write through a `Storage.prototype` spy after replacing
`window`. It now checks the resulting `sessionStorage` value directly. No OAuth
product code changed.

## Verification

Focused listing and route matrix:

```text
Test Files  8 passed (8)
Tests       96 passed (96)
```

Repository lint:

```text
> eslint .
7 warnings, 0 errors
```

The seven warnings are the pre-existing `@next/next/no-img-element` warnings in
blog, settings, short-link, layout, and share components. None is in a changed
implementation file.

Repository typecheck:

```text
> tsc --noEmit
```

Complete Vitest suite after the test-only nonce assertion correction:

```text
Test Files  102 passed (102)
Tests       1005 passed (1005)
```

`git diff --check` produced no output and exited zero.

## Limits

This is frontend implementation evidence only. It does not claim deployment,
feature activation, a real-listing Gate 4 pass, or production browser proof.
