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

Successful production display is **blocked** pending an approved browser-local
implementation of the pinned producer policy's complete detector. The production
`scanLocalPreview` function currently refuses with `detector_unavailable`.
Provisioning platform keys alone therefore does not enable sample display.
The browser test harness substitutes a synthetic-only policy adapter; it is
outside Next routes and never part of a production activation path.

No browser detector artifact is supplied by the contract/producer inspected here:
producer `e574e1df` requires Presidio 2.2.362, spaCy 3.7.2 and en-core-web-sm 3.7.1.
Do not replace that independent check with the signed producer scan, call an API
with row bytes, or relax the policy without a decision on the browser contract.

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

The Chrome harness uses synthetic keys, fixtures and route interception only.
Its assertions cover keyboard behavior, 360/375/390px page overflow, deferred
table loading and marker absence from platform requests/logs/browser storage.
It is not a real seller-origin, detector, CDN, production approval or withdrawal
receipt. Do not publish traces or screenshots containing real rows.

The immutable producer/backend corpus is in `tests/fixtures/preview`; compare
each file to `docs/reports/s1716-preview-corpus-shas.json`. Do not regenerate
the corpus to make failing tests pass.

## Remaining release obligations

Retain the report's explicit open items: complete local detector, approved
summary-label binding, signed seller decision integration where available, real
production keys/sample, approved Chunk 5 retirement, independent review and I.b
live approval/direct-origin/withdrawal/CDN checks. No merge or deployment is
authorized by this implementation task.
