# Seller connector Chunk 3 frontend

Companion to backend `8374a4e6ba0302bca60b82985e0957abc326170b`,
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

## Backend contract gaps: acceptance remains incomplete

The pinned backend has no native web route to report seller/bulk switches, page
operation child activity, refresh retry targets, or submit a new failed-only
batch. Its four `/pending-actions` routes expose summaries and live counters;
`/connector-oauth/status` exposes global `enabled` only. A saved batch response
proves backend admission, but cannot prove the current seller switches are on.
Consequently explicit current-switch gating cannot be implemented from this
native contract.

Individual receipts and signed cursors exist exclusively in the resource MCP
tool `get_activity(operation_id,cursor)`, in
`app/mcp/connector/tools/get_activity.py` and
`app/mcp/connector/discovery/activity.py`. That tool authenticates a delegated
connector principal, rather than the native browser session. No browser proxy,
delegated token, new endpoint, cursor key, or owner/org supplied in a body is
invented here. The settings receipt tells the owner how to request those pages
through their connected assistant. It does **not** provide an integrated native
signed-cursor activity view.

The settings receipt explains that retry requires a fresh explicit set/key of
failed targets with current revisions, excluding all successful/unchanged,
blocked and cancelled members. It does **not** submit a retry or manufacture
current revisions from historical receipts. Completing the requested interactive
retry and activity surfaces requires an approved native backend contract.

No PR or deployment is part of this change. Test/build evidence, including failed
attempts and environmental limitations, is kept in
`/var/tmp/chunk3-fe-evidence/summary.json` and adjacent complete private logs.
