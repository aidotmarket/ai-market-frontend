# Connector seller Chunk 4 frontend companion

Base frontend: `d5b9212d9c6d9dac674a7f5b597314daa5cc111b` (Chunk 3 under review).
Backend: `45555868304e5b86377f6e84110e846601469f9b`, branch
`build/connector-seller-chunk4-authority-consent-s1796`.
Authority: runbooks `8f6c96f49fff6db39ac8bc0d04905d6847b7a132`,
`specs/BQ-CONNECTOR-SELLER-GATE2.md` 4.3, 6.1, 6.2, AP-S12/AP-S13/AP-S15,
and the Chunk 4 row. Backend checkout is read-only.

## Native settings and decisions

`SellerAuthority` extends settings with selected grant/client IDs, owned-connection
UUIDs, verbs, categories/source kinds, mutable fields, prices (USD cents), batch
and concurrency limits, expiry and current authority version. Daily remaining
items equal the standing operation limit minus server-reported reserved and
successful items, shared by singles and bulk across grants/clients. Missing
operation limits display zero, never unlimited. Absolute batch ceiling is 50;
no request is split. A one-time exact exception never changes standing limits.

Edits clear the review. `/connector-seller-settings/authority/review` must return
exactly `aim.seller.connector_limits.set`, the submitted decision material
(excluding CSRF/reauth/hash) and a 64-character review hash. Render the complete
server review, retain its body/key/hash, then POST `/authority` explicitly.
No arbitrary JSON-Logic, policy/owner claims, MCP token or pending decision is
introduced. Native requests retain Authorization, cookies, browser Origin and
credential-derived CSRF together, without automatic credential-refresh replay.
The backend enforces policy, ownership, recent login and binding factor.

`Stop automatic seller actions` POSTs `/authority/stop` as native revoke, with
expected version, retained session/CSRF and idempotency. It does not need a new
factor/review or effect switch, and remains available while an edit/review is in
progress. Status/Stop survive effect shutdown; completed effects remain completed.
Session/account changes remount new screens and discard old review material.

`NativeSellerAuth` reuses the existing modal and fresh provider sign-in. Company
SSO recent-login refusals use Chunk 0's retained popup/check continuation to fixed
`/dashboard/settings`; missing native TOTP links to the same enrollment surface.
Binding-factor retries retain the exact request and key and submit native TOTP
proof. No linked-provider or backup-code shortcut is inferred by the frontend.

## Workspace

Public sample approval and AI preview consent are separately labelled unchecked
controls. Both are disabled because the verified native sample adapter/upload/
selection seam is unavailable at the backend pin. The exact UI consent copy is:

> Allow AI preview of this exact approved public sample for the selected grants and Claude profile (at most 5 rows / 2 KB).

The backend/runbook does not supply a canonical consent-copy string; this copy
states its exact bounded grant/profile/publication/sample decision. Read status
shows current publication/sample digest, consent version, saved publication/digest,
and reported current grants/profiles. A saved on state is shown independently of
value availability: values remain withheld, schema/statistics/descriptors only.
Stale or unavailable metadata is never displayed as active permission. Independent
revoke targets the saved consent publication and sample digest, even when current
sample resolution is unavailable or effects are off. No values/URLs are fetched.
Typed set/review/revoke API contracts are defined; the unavailable adapter prevents
UI opt-in rather than manufacturing a sample or enabling values.

`WorkspaceBatchSigning` adds a separate licence step to the existing Workspace
licence panel. Explicit prepared IDs load complete owned preparation bindings and
selections through GET `/seller-workspace/listing-preparation/{id}`. It displays
all targets/versions/revisions/coverage, signer and AI-training choice plus full
standard licence and covenant text. One initially unchecked consent covers all
N instruments. One POST `/seller-workspace/listing-licences/sign` submits the exact
preparation IDs, coverage hashes, selections, request UUID, native CSRF and optional
binding proof. All receipt coverage/IDs/statuses must match. It does not publish,
invoke generic Confirm or loop through item acceptances. Changed inputs discard
the display/consent; stale or unavailable instruments disable the whole batch.
Signing directs the owner to obtain a fresh connector key/snapshot for separate
pending confirmation. Up to 50 instruments, with no automatic split.

The existing frozen batch view now visibly includes the bound pending review hash,
limit version/proposed usage, request ceiling, no-split and exact-exception wording.
All existing per-item before/after/reference/revision/outcome displays and live
partial/cancelled receipt handling remain. Chunk 4's `seller_single_v1` summary
uses the same complete closed manifest validation, with one item and single-effect
semantics. Generic Confirm remains the existing pending API and never signs.

OAuth seller persona selection appears only among server `tool_sets` choices;
buyer remains the default. The request displays scopes/client identity and backend
retained recent-login requirements. Absent/buyer-only choices preserve the existing
buyer flow and request body; no local flag, stored grant or arbitrary input exposes
seller choice.

## Exact contract gaps and safe degradation

1. **No native seller switch report.** GET `/connector-oauth/status` returns only
   global `enabled`. GET `/connector-seller-settings` returns authority
   `version/enabled/limits/utc_day/usage`; its enabled field is authority validity,
   not rollout. Workspace capabilities have no connector seller/bulk/effect report.
   `useSellerSwitches` therefore returns unknown (`null`) at this pin, so the new
   settings, Workspace signing and preview entry points stay hidden and perform
   no reads. A reviewed native server report is needed to wire this gate. Positive
   report fixtures exercise the screens; these are not live enablement evidence.
   Safe read/Stop must be independently reportable when effects/bulk are off.
   Existing admitted pending links and receipt continuations retain their backend
   admission behavior for effects-off cleanup; OAuth uses its actual server choices.
2. **No verified native sample adapter or projection-capability report.** The pin
   explicitly has no production selected-sample adapter. `sample_available` on
   consent status only reports resolved assets, not preview adapter/profile output
   permission. No enable is inferred; public sample and preview toggles stay off/
   disabled and values stay withheld even with saved consent on.
3. **No saved custom document text in preparation GET.** It returns
   `license_selection` and bindings but not custom licence/rider full text. The
   owned custom endpoint only POSTs a new submission. Mixed/custom prepared batches
   are disabled as a whole until readable exact saved documents are supplied;
   standard instruments use existing versioned document endpoints. No text URL,
   acceptance, inheritance or partial signing is fabricated.
4. **No authority expiry/budget/exception facts in frozen pending summary beyond
   `limit_version` and `proposed_usage`.** The UI displays those exact facts and
   existing review expiry/execution deadline. It does not invent saved authority
   expiry, numeric outside-limit amounts or current per-operation allocations.
   Current settings report limits/expiry and UTC-day usage, not live concurrency
   allocation count. Worker/backend rechecks remain authoritative.
5. **No native per-child activity/retry contract.** Inherited Chunk 3 gap remains:
   pending GET exposes live aggregate outcomes, but detailed signed-cursor activity
   and new failed-only retry submission exist only on the resource/MCP surface.
   No browser delegated-token proxy or automatic successful-child resubmission.
6. **No eligible seller grant/client picker contract.** Current limits expose their
   bound IDs; `/connector/grants` omits `client_id/tool_set/profile`. Edits accept
   typed IDs and display exact review; the backend checks live ownership/verified
   seller grant/client matching and owned connections. No picker label or eligible
   client list is inferred from the global connected-app list.

Ordinary settings/Workspace remain unchanged when rollout reporting is absent/off.
These gaps prevent a live-enabled acceptance claim; this is a safely dark frontend
companion, not a deployment, provider/Gate 4 proof or completed sample capability.

## Verification

Named Vitest targets include `SellerAuthority.test.tsx`,
`WorkspaceBatchSigning.test.tsx`, `SellerPreviewConsent.test.tsx`, native authority/
signing transport tests, existing settings/ReauthModal/connected-apps/Workspace,
pending/login/batch, `api/company-authenticator.test.ts`,
`lib/company-sign-in.test.ts`, `components/company-saml.test.tsx` and callback tests.
Private full command outputs, including first failures, and final totals are saved
under `/var/tmp/chunk4-fe-evidence/summary.json` and adjacent logs. Production
compilation uses synthetic Keystatic configuration and a loopback API fixture
returning 404 for existing static terms fallback, without provider credentials or
live backend data. No PR or deployment is authorized or opened.
