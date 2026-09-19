# S1720 P2-C Council round-2 fold report

Date: 2026-09-19

Base: `c3dabf919473df70aa13b131d6a93c2e4fc08725`

Branch: `build/bq-listing-enrichment-seller-tools-s1294-p2c-parity-s1720`

The exact pushed head is recorded in the handoff because a commit cannot contain
its own SHA.

## Result

- Seller sample chrome now distinguishes a successfully read empty manifest from
  a selection that is loading or unavailable. Pending summaries, missing slugs,
  and rejected manifest reads no longer claim that no fields are selected.
- A changed enrichment PUT invalidates the parent summary immediately after the
  committed response, before the editable-value reload. A failed reload cannot
  leave the previous public approval claim on screen.
- Unit inputs are disabled when the read projection lacks the write contract's
  required `description` or boolean `nullable` fields. The seller is directed to
  republish through AIM Data, and structured 422 responses provide a next action
  rather than advice to repeat the same request.
- Removing aggregate statistics now says that the object is removed for all
  readers and can only be restored by republishing through AIM Data. The save
  requires explicit confirmation before sending the null removal.
- The four enrichment refusals raised by this PUT path now have plain-language,
  actionable messages: `dictionary_field_unknown`,
  `dictionary_removal_forbidden`, `aggregate_column_unknown`, and
  `generated_statement_not_guarded`.
- The public listing keeps At a glance near the top but renders the shared sample
  after description/listing content and schema, restoring the specified sample
  position. The sample renders exactly once.
- The sample uses the exact required commitment label, identifies the rows as
  seller-selected, and states the proof limitations without strengthening an
  absent assurance.
- The Playwright harness now mounts the real seller review and buyer output with
  the same independently signed fixture. Chrome verifies both samples, selected
  fields, the exact commitment label, the limitations text, and equal visible
  preview output.

The declined Council items remain unchanged: the selected-field mirror stays in
seller review, and `app/login/LoginForm.test.tsx` was not modified.

## Changed files

- `app/listings/[slug]/page.tsx`
- `components/listings/BuyerAtAGlance.tsx`
- `components/listings/SampleTable.test.tsx`
- `components/listings/SampleTable.tsx`
- `components/listings/SellerAtAGlance.manifest.test.tsx`
- `components/listings/SellerAtAGlance.test.tsx`
- `components/listings/SellerAtAGlance.tsx`
- `components/listings/SellerEnrichmentControls.test.tsx`
- `components/listings/SellerEnrichmentControls.tsx`
- `docs/reports/s1720-p2c-parity.md`
- `lib/api.ts`
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

Complete Vitest suite:

```text
Test Files  103 passed (103)
Tests       1017 passed (1017)
```

Complete preview-browser Playwright suite using Chrome:

```text
PASS (4) FAIL (0)
```

`git diff --check` produced no output and exited zero.

## Limits

This is local frontend implementation and browser evidence. It does not claim a
deployment, feature activation, production data, or a real-listing Gate 4 pass.
