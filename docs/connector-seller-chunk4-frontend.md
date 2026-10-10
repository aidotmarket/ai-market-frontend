# Connector seller Chunk 4 frontend companion

Integration fold: merge frontend main `852fa9ec423c706e28d802c73b02d6c695543923`
into Chunk 4 head `1e3369ca` with a real merge commit. Production admission
contract: backend `fee44edb`, `PendingActionResponse.admission` and
`GET /api/v1/pending-actions/{id}/capability?t={token}`. This owner read requires
native bearer, exact browser Origin and credential-derived CSRF; the frontend
sends all three. This production contract resolves codex2's prior MEDIUM
finding against the older backend pin with no capability route.
Chunk 4 authority/consent schema: backend PR #672 head
`c3e6832e36c51c5076d2bc497944f9178a39b3da`. Revocation review and submission
both require fresh binding authentication and the exact reviewed material/hash.
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

`Stop automatic seller actions` first POSTs `/authority/stop/review` with
expected version, retained session/CSRF and idempotency key. It validates the
exact `aim.seller.connector_limits.revoke` material, displays the server review,
then submits `/authority/stop` with that matching hash on explicit confirmation.
Both withdrawals require fresh login and binding authentication, including fresh
company SSO and native TOTP. Reauthentication retains the withdrawal operation
and key, obtains a new review for the current session, and waits for confirmation.
Preview withdrawal similarly uses `/preview-consent/revoke/review`, action
`aim.listing.ai_preview_consent.revoke`, then `/preview-consent/revoke` with its
matching hash and exact saved publication/sample digest. Refused submissions clear
the review; an explicit status refresh discards old withdrawal material.

Authenticated owner status and Stop never depend on seller/effects/bulk reporting.
With unknown reporting or seller/effects off, edit forms and signing entry points
are hidden. Safe consent status and withdrawal also remain accessible. Account
changes discard screens; credential changes clear reviews and refresh status,
with no old-session proof or hash reused. Completed effects remain completed.

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

1. **Status is pending-link scoped.** `useSellerSwitches` consumes the production
   route `GET /pending-actions/{id}/capability?t={token}` with retained native
   bearer/CSRF when a valid existing pending link or settings `redirect` continuation
   is present. It checks all seven floors, effective admission, reason and timestamp;
   polling, focus, five-second request timeout and 15-second freshness expiry fail
   closed. No connector-global or standing-authority enabled field substitutes for
   rollout. Without a valid link, there is no global status endpoint in the inspected contracts;
   effects/signing remain closed. Owner status and Stop remain independently visible.
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
5. **Inherited Chunk 3 native activity/retry.** The merged frontend consumes
   the owner/org-scoped native activity, signed cursor and failed-only retry contracts
   documented at backend `2bc41701`. These contracts are absent from the actual
   preserved Chunk 4 backend `44a13668` (its Chunk 3 ancestor predates that fold).
   Activity/retry refuse unavailable responses; joined live acceptance requires
   merging the backend folds. No success is replayed automatically.
6. **No eligible seller grant/client picker contract.** Current limits expose their
   bound IDs; `/connector/grants` omits `client_id/tool_set/profile`. Edits accept
   typed IDs and display exact review; the backend checks live ownership/verified
   seller grant/client matching and owned connections. No picker label or eligible
   client list is inferred from the global connected-app list.

Settings now always expose authenticated safe authority status and Stop, even when rollout reporting is absent/off.
These gaps prevent a live-enabled acceptance claim; this is a safely dark frontend
companion, not a deployment, provider/Gate 4 proof or completed sample capability.

## Verification

Named Vitest targets include `SellerAuthority.test.tsx`,
`WorkspaceBatchSigning.test.tsx`, `SellerPreviewConsent.test.tsx`, native authority/
signing transport tests, existing settings/ReauthModal/connected-apps/Workspace,
pending/login/batch, `api/company-authenticator.test.ts`,
`lib/company-sign-in.test.ts`, `components/company-saml.test.tsx` and callback tests.
Private full command outputs, including first failures, and final totals are saved
under `/var/tmp/chunk4-fe-fold-evidence/summary.json` and adjacent logs. Production
compilation uses synthetic Keystatic configuration and a loopback API fixture
returning 404 for existing static terms fallback, without provider credentials or
live backend data. No PR or deployment is authorized or opened.

Fold verification runs the complete frontend suite and the actual native backend
`test_authority_web_auth.py` / `test_samples_preview.py` from an isolated archive
of `44a13668`, using disposable PostgreSQL clones. Both successful withdrawals with
all effects off and stale/factor/unreviewed/tampered refusal are covered. UI auth
and capability tests use mocks; this does not claim live browser/provider proof.


## Main integration verification (2026-10-10)

Final checks used Node `v22.23.3` with
`PATH=/Users/max/.nvm/versions/node/v22.23.3/bin:$PATH`:

- `rtk proxy npm run lint`: exit 0, zero errors, six existing image warnings.
- `rtk proxy npm run typecheck`: exit 0.
- `rtk proxy npm test`: exit 0, 187 files and 2,315 tests passed.
- Focused command below: exit 0, nine files and 125 tests passed.
- Configured build command below: exit 0.

```sh
rtk proxy npx vitest run app/dashboard/settings/SellerAuthority.test.tsx components/seller-workspace/SellerPreviewConsent.test.tsx components/seller-workspace/WorkspaceBatchSigning.test.tsx api/connector-seller-settings.test.ts api/seller-batch-signing.test.ts hooks/useSellerSwitches.test.tsx 'app/confirm/[id]/seller-batch.test.tsx' api/seller-operations.test.ts app/oauth/connect/page.test.tsx
API_URL=https://api.ai.market NEXT_PUBLIC_API_URL=https://api.ai.market KEYSTATIC_GITHUB_CLIENT_ID=local-build-check KEYSTATIC_GITHUB_CLIENT_SECRET=local-build-check KEYSTATIC_SECRET=local-build-check-only-0000000000 NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=local-build-check rtk proxy npm run build
```

Keystatic values are local build placeholders. Initial Node 25 test runs failed
on native storage configuration (focused: eight failed; full: 145 failed).
Initial builds failed on absent Keystatic configuration, then absent API_URL.
Full untruncated outputs, failures, inspected backend schemas and command results
are private local evidence in `/var/tmp/chunk4-s1796-evidence/`.
These checks do not establish live authenticated browser/provider behavior.
