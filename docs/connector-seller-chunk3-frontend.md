# Seller connector Chunk 3 frontend

Companion to backend `2bc41701`,
`docs/connector-seller-chunk3.md` / “Frontend companion PR”, and runbooks
`origin/main:specs/BQ-CONNECTOR-SELLER-GATE2.md` AP-S5/AP-S6 and Chunk 3.
Base frontend: `68b036ed8685bf2d3334327fd67498883934a2a1`.

## Implemented native surfaces

- `PendingAction.summary` accepts the backend `seller_batch_v1` schema. All
  manifest fields remain in the saved response. Display validation rejects
  incomplete, duplicate, reordered, miscounted or oversized manifests; it does
  not repair or split them. The existing decision API submits the server's
  complete `summary_hash` unchanged, regardless of display page.
- Ten members per display page, in canonical target order, with original
  zero-based caller indices, eligible/blocked counts, escaped safe before/after
  maps, all target/version/price/currency/legal/signature/sample/presentation
  references, binding hashes, reasons, request expiry and execution deadline.
  The complete batch identity is also available. Partial execution is explicit.
- Workspace **Sign licences** is a separate labelled continuation, with a fresh
  request/key/snapshot required after legal changes. Generic Confirm calls only
  the existing native pending confirmation API; it cannot sign licences.
- Existing session credential, Origin/CSRF, provider reauthentication and Chunk 0
  settings/TOTP continuation remain in use. Enforced company sessions obtain
  native same-session TOTP proof through the existing modal. The backend remains
  authoritative for recent organization login and proof validation.
- Confirmed batches mean queued authorization, not completed publication. Live
  counts are polled through the owner-scoped native pending GET every five
  seconds while queued/running. Reads never execute. Account/session/link changes
  invalidate displayed state and ignore old responses. A changed hash is refused.
- The existing authenticated settings continuation provides the known pending
  operation receipt at `#seller-operation`. Ordinary settings/security visits do
  not fetch or expose this surface. Existing private continuation header rules
  cover its URL: no-store, no-referrer and frame-ancestors none.
- No client seller flag or global connector status substitutes for backend
  admission. Seller review is rendered only from a valid server-returned batch;
  an unavailable/flag-off pending endpoint remains inert. Saved operation results
  can continue to be read after effect switches turn off.

## Folded native contracts

- Current `admission` is outside the frozen summary/hash. Confirm fails closed
  for missing, malformed, stale or unavailable status. The saved seller review
  stays mounted at the selected display page through polling and focus refreshes,
  including delayed responses and shutdown; a changed summary hash resets it.
  Seven current switch floors must be true. A 15-second UI freshness lease,
  five-second refresh, focus refresh and pre-confirm capability read detect
  shutdown. Backend confirmation independently rechecks authority and facts.
  Decline and saved operation receipts remain available with seller effects off.
- `403 SSO_REQUIRED` on pending GET or POST uses the existing CompanySignIn
  OIDC/SAML flow with the fixed `/dashboard/settings` popup return. The original
  signed pending continuation stays in the original window. Recovery refetches
  the complete review, requires native TOTP, and never automatically confirms.
- Settings reads native owner/org operation activity with first-party bearer,
  Origin and CSRF. Signed cursors are opaque and passed unchanged with the same
  operation, including size-trimmed pages; no offset is manufactured. Individual
  receipts and all seven counters remain available with effect switches off.
- Failed members are selected explicitly across activity pages. Retry sends only
  source token, session CSRF, a new UUID key and 1–50 distinct target IDs. The
  backend refreshes revisions and validates failed-only membership. No success,
  unchanged, blocked or cancelled child is selected, and no batch is split.
  The returned native link opens a new complete frozen review requiring a fresh
  explicit decision and native factors. Refusals never automatically resubmit;
  an ambiguous POST directs the owner to recover pending receipts.
- Hash, path, account, session and pending continuation changes invalidate
  settings state. Receipt/activity refresh failures retry after five seconds;
  stale activity selections are removed before retry can be prepared.

No browser storage, delegated credentials, new token-bearing URL format,
owner/org fields, browser revisions, cursor signing keys, or legal signing
are introduced. Legacy non-batch and flag-off pending flows remain unchanged.

Full logs, initial failures, test totals, and production build evidence are in
`/var/tmp/chunk3-fe-fold-evidence/summary.json`. Tests consume API mocks; no live
browser/backend, provider sign-in, deployment or production effects are claimed.

Fold 2 pagination regression and both Chunk 3/Chunk 4 head validation are recorded
in `/var/tmp/chunk3-fe-fold2-evidence/summary.json`.
