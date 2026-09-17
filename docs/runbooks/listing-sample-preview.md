# Browser sample preview

This procedure covers S1294 T frontend. Authority is backend main
`ea7e777c1ee2a9925db1b221430937cd38694ad5`,
`specs/BQ-LISTING-ENRICHMENT-SELLER-TOOLS-S1294-CHUNK-T-CONTRACT-S1716.md`
and its T-backend ratifications. It complements backend
`docs/runbooks/listing-summary.md`; it does not change seller publication authority.

## Current boundary

The component has no rollout flag. It discovers metadata in the browser, offers
View sample only for a supported manifest with available platform keys, and
fetches the seller package only after manifest verification. Every display needs
full package, signature, schema, proof, local policy and final current-head checks.
Platform-key HTTP 503 produces no preview and no error page.

Event Ledger `b8ddbd10` (2026-09-18) replaces the browser ML boundary with
F2-authenticated producer scan evidence (`aim-preview-policy-v1`, `1.0.0`,
`passed`, exact sampled-leaf and scan-attestation digests) plus a browser-only
`aim-preview-policy-v1-deterministic` scan. The latter scans every complete raw
row, key, nested value and array element before any display handle. Either
failure hides all rows; diagnostics contain fixed reason codes only.

The shared deterministic vector fixture and SHA live under `tests/fixtures/preview`.
`rtk proxy python3 scripts/preview-policy-vectors.py` compares every expectation
to pinned producer source; Node/Vitest runs the same vectors through the browser
policy. There is no browser ML model and no server scan or row ingress.

## Approved column labels

The buyer and seller sample mount read the optional no-store
`GET /api/v1/public/listings/{slug}/at-a-glance/signed-payload` response. The
adapter expects `{payload, summary_hash, render_hash, source_revision,
approval_version}`. It recomputes SHA-256 of the original payload's RFC8785 bytes
and requires exact F2-bound summary/render/source identity before joining exact
column names. Missing rollout, stale identity, malformed payload or hash mismatch
silently retain identity-only columns. Confirm this response shape against the
backend amendment when available; fixtures are synthetic contract examples.

## Diagnostic sequence

1. Confirm the canonical current slug and listing UUID. Do not select a historical
   disclosure or purchase version as preview eligibility.
2. Inspect metadata-only `GET /api/v1/public/listings/{slug}/preview-manifest` and
   `GET /api/v1/public/transparency/keys`. Require HTTP 200 and no-store. Any
   absence, error, timeout or malformed response is ineligible.
3. Verify the platform envelope first, then its authenticated signer-key records,
   then seller signatures and all binding/hash/log rules. Ed25519 uses WebCrypto;
   only NotSupportedError invokes pinned `@noble/curves` 2.0.1, strict RFC8032
   verification (`zip215: false`). Missing SHA-256/WebCrypto fails closed.
4. Seller transport is direct HTTPS, no credentials/query/fragment/redirects,
   no-referrer and no-store, with exact media type and bounded streaming.
   No API proxy or server-side fetch is permitted. Static host admission cannot
   independently observe DNS or the connected peer address in browser JavaScript;
   real origin/CORS/private-network behavior remains a live integration obligation.
5. A requested failure displays only Sample unavailable. Never log an exception
   body, row, matched policy value, filter value or package response. Keep rows
   only in transient browser memory. Evidence uses IDs, digests and counts.
6. Hiding the tab/page clears rows; visibility return, bfcache restoration and
   focus revalidate. Each action has a five-second timeout with cancellation and
   generation guards. Untouched tabs have no periodic timer or hard withdrawal
   deadline under E.x. Do not add polling to the view-counted listing endpoint.

## Verification commands

Run from this checkout, using the same Node/npm environment for baseline and
candidate. Final parity uses one worker, with the two full runs sequential, to
avoid unrelated large-fixture contention. Preserve failures from earlier runs.

```sh
rtk proxy npm test -- --maxWorkers=1
rtk proxy npm run typecheck
rtk proxy npm run lint
rtk proxy npm run build
rtk proxy npx playwright test -c playwright.preview.config.ts
rtk proxy python3 scripts/preview-mutations.py
```

The Chrome harness uses synthetic keys/rows and route interception with the real
deterministic browser scanner.
Its assertions cover keyboard behavior, 360/375/390px page overflow, deferred
table loading and marker absence from platform requests/logs/browser storage.
It is not a real seller-origin, detector, CDN, production approval or withdrawal
receipt. Do not publish traces or screenshots containing real rows.

The immutable producer/backend corpus is in `tests/fixtures/preview`; compare
each file to `docs/reports/s1716-preview-corpus-shas.json`. Do not regenerate
the corpus to make failing tests pass.

## Seller sample display

Sellers sign sample approve/refresh/withdraw decisions in AIM Data. This UI
shows state and reuses the identical buyer `ListingSamplePreview`, with the
same verification and optional signed-payload join. Existing metadata-only
At a glance actions carry `sample_decision: none`; they grant no sample permission.
There is no pending signed sample decision control to implement in this UI.

## Remaining release obligations

Retain the report's explicit open items: signed-payload production availability and a real
production sample, approved Chunk 5 retirement, independent review and I.b
live approval/direct-origin/withdrawal/CDN checks. No merge or deployment is
authorized by this implementation task.
