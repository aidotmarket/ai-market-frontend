# BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574 — Gate 2 Build Spec

**Predecessor:** Gate 1 LOCKED at PR #6 merge SHA `212e49b` on `ai-market-frontend` (S594 R2 dual-APPROVE clean; MP+AG APPROVE post-fold of MP R1 HIGH auth-fixture-architectural-mismatch finding).
**Repo:** `ai-market-frontend` (single repo)
**Priority:** P2
**Pillar:** ai.market product surface (primary; per BQ business_summary + Primary S613 brief; body.core_pillars_tied=['Council/Koskadeux orchestration'] is stale — see §2 caveat 5).

## §1 Scope

Introduce an end-to-end test suite covering the customer-critical sign-up + data-request submission journeys, plus the 422 failure paths that produced the S574 incident chain. Frontend repo currently has zero test runner, zero test scripts, zero test coverage. This BQ is the FRONTEND HALF of the signup-funnel defense pair — the BACKEND HALF (OAuth/CRM atomic decoupling) is in R1 review at ai-market-backend PR #65. Together they bracket the same incident class at two layers: backend prevents CRM-side failures from rolling back user creation; frontend catches the DOM/user-flow class of regressions (option-element value-attribute drift, 422-shape rendering, white-screen crashes from API contract drift).

## §2 Honest-posture caveats (builder MUST reconcile)

1. **Test directory convention:** Spec assumes `e2e/` at repo root for Playwright tests; `tests/unit/` reserved if Vitest+RTL added later. Builder reconciles to Next.js convention if dictated (e.g., `__tests__/`, co-located `*.test.tsx`).
2. **Runner choice:** Spec recommends Playwright (rationale in §3). Reviewer/builder may reverse to Vitest+RTL if cross-browser real-network coverage is judged out of scope. If reversed, Chunk 2 OAuth fixture strategy needs full rewrite (Vitest+RTL uses MSW; Playwright uses route handlers). All AC-Bs except AC-B6/B7 are runner-agnostic by design.
3. **Form selectors:** Spec writes assertions against `data-testid` attributes assumed present at `app/requests/new/page.tsx`. Builder maps to actual selectors OR adds testids in Chunk 3 same diff. Builder documents selector decisions in adjacent comments per chunk.
4. **OAuth callback URL contract:** Spec assumes `/auth/callback?code=...&state=...` with state-param HMAC verification per BQ-AUTH-FRONT-DOOR-OBSERVABILITY-S573 Gate 2 design. Builder verifies actual frontend route + state-param contract against backend HMAC architecture before mocking. If state-param scheme is signed JWT instead of HMAC-of-nonce, Chunk 2 mock-generation routine adjusts.
5. **Pillar field stale on BQ entity:** body.core_pillars_tied=['Council/Koskadeux orchestration'] contradicts body.business_summary 'Primary tie: ai.market product surface' AND Primary S613 directive 'P2 ai.market'. Spec adopts ai.market as primary per directive + business_summary intent. Builder/Primary may patch entity field as housekeeping (out of scope for this spec).

## §3 Runner choice rationale (recommend Playwright)

Customer-journey E2E scope (Gate 1 R2 wording) implies real-browser flows with cross-origin OAuth round-trips and back-end-shaped 422 error surfaces. Playwright fits:
- Cross-browser real-network or mocked-network via single API.
- First-class `page.route()` for fixture stubbing at the IdP exchange boundary (Chunk 2).
- Built-in trace viewer + screenshot-on-failure for incident postmortems.
- Reliable parallel execution model with worker isolation (no shared module-graph state).

Vitest+RTL is component-level and would still need a separate runner for the OAuth round-trips. Adopting Playwright avoids the dual-runner maintenance burden. Decision recorded; reviewer may overturn.

## §4 Architecture overview

The failure class to catch: forms render against a backend whose contract drifts (urgency-option value attribute, 422 response shape, OAuth callback state-param), and the failure surfaces only when a real customer hits it. The test architecture mirrors the failure class:

1. **Mocked-network smoke suite (`@smoke`):** runs on every PR, fast (<90s), uses Playwright `page.route()` to stub backend responses per-test. Catches contract-shape regressions (option-value, 422 array, 422 string, white-screen exception class).
2. **Staging-network full suite (`@full`):** runs on staging deploy receipt, slow (~5min), runs against real backend on staging tenant. Catches integration regressions (OAuth IdP round-trip end-to-end, /me follow-up, full happy-path).
3. **Fixture seam:** OAuth IdP exchanges stubbed at the `/auth/callback` boundary for smoke; real IdP for full. The seam is the route handler in Chunk 2.

## §5 Acceptance Criteria (AC-B)

AC-B1: `package.json` has `@playwright/test` as devDependency, `playwright.config.ts` configured for Chromium + Firefox + WebKit, `npm test` runs the smoke subset, `npm run test:e2e:full` runs the full suite. Verified by `npm test --dry-run` returning the @smoke tag filter and `npx playwright --version` resolving cleanly in a clean clone.

AC-B2: `e2e/fixtures/oauth.ts` exports `mockGoogleOAuth(page, { state, code, response })` and `mockGitHubOAuth(page, { state, code, response })` route handlers that intercept `/auth/google/login` redirect + `/auth/callback` exchange. Mock signs state-param with test-only HMAC secret (or per caveat 4 scheme). Three branches covered: happy, user-cancelled, expired-state.

AC-B3: `e2e/auth/google-signup.spec.ts` includes `@smoke` test that runs a Google OAuth sign-up round-trip end-to-end via mock fixture, asserts redirect-to-dashboard, asserts `/me` follow-up returns 200 with `user.email` field present (full shape covered by OpenAPI-types BQ).

AC-B4: `e2e/auth/github-signup.spec.ts` mirror of AC-B3 for GitHub OAuth, including `@smoke` tag, redirect-to-dashboard assertion, `/me` follow-up assertion.

AC-B5: `e2e/auth/magic-link.spec.ts` includes `@smoke` test that POSTs magic-link request, intercepts the emitted token via mock fixture, navigates to verify URL, asserts redirect-to-dashboard + `/me` follow-up.

AC-B6: `e2e/forms/data-request-happy.spec.ts` includes a `@smoke` parametrized test across all 5 urgency options (Low/Medium/Normal/High/Critical or equivalent enum from Gate 1 audit), submits the form, asserts request payload field `urgency` exact value (Medium→`'normal'`, the bug class S574 caught), asserts 2xx response, asserts success-toast renders.

AC-B7: `e2e/forms/data-request-422-array.spec.ts` mocks backend returning FastAPI-default 422 array shape `[{loc, msg, type}, ...]`, submits form, asserts page does NOT throw (no white-screen exception), asserts inline field errors render against the correct fields.

AC-B8: `e2e/forms/data-request-422-string.spec.ts` mocks backend returning legacy 422 string shape `{detail: '...'}`, submits form, asserts toast renders with the detail string, asserts no white-screen.

AC-B9: `e2e/forms/data-request-422-httpexception.spec.ts` mocks backend returning manual `HTTPException(422, detail=...)` shape (per S587 4th-422-shape evidence in BQ-BACKEND-422-RESPONSE-SHAPE-UNIFICATION-S573), submits form, asserts toast renders + no white-screen. Doc-only AC if BQ-BACKEND-422-RESPONSE-SHAPE-UNIFICATION-S573 ships first and collapses the shapes.

AC-B10: `.github/workflows/e2e-smoke.yml` runs `npm test` on every PR against main with required-status-check name `e2e-smoke`, cache key `playwright-${runner.os}-${hashFiles('package-lock.json')}`, fail-fast on first test failure, timeout 5min. Composes with BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 required-status-check list when that BQ ships.

AC-B11: `.github/workflows/e2e-full.yml` runs `npm run test:e2e:full` on staging deploy receipt webhook (or manual workflow_dispatch as fallback), uploads Playwright trace artifacts on failure, timeout 15min.

AC-B12: `e2e/fixtures/test-data.ts` exports `uniqueTestEmail()` returning `e2e-test-<uuid>@<configured-test-domain>` for full-suite tests; admin cleanup endpoint OR scheduled sweep job (out-of-scope follow-up) reclaims rows. Smoke suite uses mocked-network and writes ZERO DB rows.

AC-B13: `playwright.config.ts` declares `@smoke` tag-filter default for `npm test`; `@full` tag for `npm run test:e2e:full`; tests untagged default to smoke per Chunk-6 convention; convention documented in `e2e/README.md`.

## §6 Implementation chunks

### Chunk 1 — Runner setup + config

Files touched: `package.json` (add `@playwright/test` devDep + `test` + `test:e2e:full` scripts), `playwright.config.ts` (new), `tsconfig.e2e.json` (new, extends root tsconfig with `e2e/` includes), `.gitignore` (add `playwright-report/`, `test-results/`, `playwright/.cache/`), `e2e/README.md` (new, documents `@smoke`/`@full` tag convention + how to run locally).

Decision points: browser project list (Chromium+Firefox+WebKit recommended; reviewer may scope to Chromium-only for cost), test timeout (30s per-test default + 5min suite cap), retries (1 retry on smoke for flake tolerance, 0 retries on full).

Acceptance: AC-B1, AC-B13.

### Chunk 2 — OAuth fixture architecture

Files touched: `e2e/fixtures/oauth.ts` (new), `e2e/fixtures/idp-mock.ts` (helper for state-param signing), `e2e/fixtures/types.ts` (TS types for mock responses).

Approach: `mockGoogleOAuth` and `mockGitHubOAuth` install Playwright `page.route()` handlers matching `**/auth/google/login` and `**/auth/google/callback` (and GitHub variants). The login route returns 302 to the callback URL with synthetic `code` and `state`; the callback route returns mocked user identity. State-param signed with `TEST_OAUTH_SECRET` env var (default to fixed test value; CI reads from secret).

Three branches per provider: `mockOAuthHappy()`, `mockOAuthCancelled()` (callback receives `error=access_denied`), `mockOAuthExpiredState()` (callback receives state with stale timestamp; backend HMAC verification rejects). Each branch is a fixture-factory; tests opt in.

If caveat 4 reveals state-param is JWT-signed, builder substitutes `jose` JWT signing for HMAC in `idp-mock.ts`; rest of architecture unchanged.

Acceptance: AC-B2.

### Chunk 3 — Sign-up tests (Google + GitHub + magic-link)

Files touched: `e2e/auth/google-signup.spec.ts` (new), `e2e/auth/github-signup.spec.ts` (new), `e2e/auth/magic-link.spec.ts` (new), `e2e/fixtures/magic-link.ts` (new helper for intercepting magic-link email + extracting token).

Pattern: `test.beforeEach` installs mock fixtures; `test('@smoke happy path')` runs the round-trip; assertions on URL post-redirect (`expect(page).toHaveURL(/dashboard/)`) + `/me` follow-up via `page.waitForResponse(/.+\/me/)` checking status 200 + JSON body has `user.email`. Each spec also runs `test('@smoke cancelled')` and `test('@smoke expired-state')` asserting error-toast renders + no redirect-to-dashboard.

Acceptance: AC-B3, AC-B4, AC-B5.

### Chunk 4 — Data-request form happy-path + 422 error-shape tests

Files touched: `e2e/forms/data-request-happy.spec.ts` (new), `e2e/forms/data-request-422-array.spec.ts` (new), `e2e/forms/data-request-422-string.spec.ts` (new), `e2e/forms/data-request-422-httpexception.spec.ts` (new), `e2e/fixtures/data-request-mock.ts` (new helper for backend response stubbing).

Happy-path pattern: `test.describe.parallel('urgency variants')` with `for (const urgency of URGENCY_OPTIONS)` runs the same form-fill flow with each urgency value; `page.waitForRequest('**/data-requests', req => req.method() === 'POST')` captures the outgoing payload; `expect(payload.urgency).toBe(EXPECTED_API_VALUE[urgency])` catches the Medium→normal bug class.

422 patterns: route handler returns the target shape with status 422; `page.waitForResponse(/data-requests/)` waits for it; assertions check rendered error UI (`expect(page.getByTestId('toast-error')).toBeVisible()` for string shape; `expect(page.getByTestId('field-error-description')).toBeVisible()` for array shape).

White-screen detector: every 422 test ends with `expect(page.getByTestId('app-root')).toBeVisible()` to confirm React tree did not unmount.

Acceptance: AC-B6, AC-B7, AC-B8, AC-B9.

### Chunk 5 — CI gate integration

Files touched: `.github/workflows/e2e-smoke.yml` (new), `.github/workflows/e2e-full.yml` (new).

Smoke workflow: triggers on `pull_request` to `main`; runs `npm ci && npx playwright install --with-deps chromium && npm test`; cache restores Playwright browsers via `actions/cache@v4` with key `playwright-${runner.os}-${hashFiles('package-lock.json')}`; required-status-check name `e2e-smoke` for branch protection composition.

Full workflow: triggers on `repository_dispatch` event `staging-deploy-complete` (assumes staging deploy receipt workflow emits this; if not, manual workflow_dispatch as fallback documented in `e2e/README.md`); uploads `playwright-report/` + `test-results/` as artifacts on failure.

Acceptance: AC-B10, AC-B11.

### Chunk 6 — Test data fixtures + cleanup

Files touched: `e2e/fixtures/test-data.ts` (new), `e2e/README.md` (extend with cleanup contract).

`uniqueTestEmail()` returns `e2e-test-${crypto.randomUUID()}@${process.env.E2E_TEST_DOMAIN || 'e2e.staging.ai.market'}`. Smoke suite never calls this (uses mocked-network). Full suite uses it for any test that creates a persistent record on staging.

Cleanup strategy decision (open question Q5): (a) admin-endpoint sweep job that deletes `users` rows matching `email LIKE 'e2e-test-%@%'` older than 24h — RECOMMENDED, sequence-locked behind BQ-AUTH-OAUTH-CRM-PROVISIONING-BLOCKS-SIGNUP-S574 admin endpoint Chunk 5 since same admin surface; (b) dedicated `e2e-test` tenant with TTL'd record retention — over-engineered for current scale; (c) per-test cleanup hook that deletes the created record — brittle if test fails mid-flow.

Document decision + sequencing in `e2e/README.md`. File follow-up BQ for the admin sweep job if it sequences after this BQ's Gate 4.

Acceptance: AC-B12.

## §7 Risks

- **R1:** OAuth state-param contract drift between frontend and backend HMAC architecture. Mitigation: caveat 4 + Chunk 2 builder-verification step against BQ-AUTH-FRONT-DOOR-OBSERVABILITY-S573 Gate 2 contract.
- **R2:** Test flakiness on real-network (`@full`) tests against staging IdP rate-limiting. Mitigation: `@smoke` uses mocked-network and is the PR-gating subset; `@full` retries=0 with explicit flake-tolerance budget documented in `e2e/README.md`.
- **R3:** Playwright install (~250MB browsers) inflates CI cache; cache-miss cold starts cost ~2min. Mitigation: `actions/cache@v4` with lockfile-keyed cache; cold-start budget bounded by 5min job timeout.
- **R4:** Test data isolation on staging — concurrent test runs creating same-email collisions. Mitigation: `uniqueTestEmail()` returns UUID-namespaced address per test invocation; collision probability negligible.
- **R5:** Fast/slow tag boundary drift over time — `@smoke` suite slowly accreting tests beyond 90s budget. Mitigation: `e2e/README.md` documents `@smoke` budget cap; CI workflow enforces 5min job timeout as hard cap.
- **R6:** CI gate composition with BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 not yet shipped. Mitigation: AC-B10 names the required-status-check (`e2e-smoke`) explicitly; composition happens when CI-merge-gate BQ ships and adds it to branch-protection required list. Until then, the workflow runs but does not block merges.
- **R7:** Selector fragility on form components — `data-testid` attributes may not exist; builder either maps to existing accessible selectors or adds testids in Chunk 3 (per caveat 3). Adding testids is a same-diff cost; mapping to text/role selectors increases assertion fragility on copy changes.

## §8 Open questions

- Q1: Playwright vs Vitest+RTL final decision? (Spec recommends Playwright; reviewer/Max confirm.)
- Q2: Browser project list — Chromium-only (fast, low cost) or Chromium+Firefox+WebKit (true cross-browser, ~3x CI cost)? (Recommend Chromium-only for `@smoke`; Chromium+Firefox for `@full`. Reviewer confirms.)
- Q3: AC-B9 manual-HTTPException 422 test — keep as separate test or fold into AC-B8 string-shape (since HTTPException(422) renders as `{detail: '...'}` which IS the string shape)? (Recommend keep separate to catch the specific code path emitting it; if BQ-BACKEND-422-RESPONSE-SHAPE-UNIFICATION-S573 ships first and collapses shapes, fold AC-B9 into AC-B8 as a one-line doc note.)
- Q4: Staging deploy receipt webhook — does the staging deploy workflow currently emit `repository_dispatch` events? If not, what's the migration path? (Builder verifies; falls back to manual `workflow_dispatch` if not present.)
- Q5: Cleanup strategy for created test records — admin sweep job (recommended, sequence-locked behind OAuth-CRM-provisioning Chunk 5), dedicated tenant, or per-test cleanup hook? (Recommend admin sweep job; file follow-up BQ for the sweep job impl if sequenced after this BQ's Gate 4.)

## §9 Out of scope

- Component-level unit tests (Vitest+RTL surface) — separate work; this BQ is E2E only.
- Performance/load tests — separate concern, separate runner (k6 or Artillery), separate BQ.
- Visual-regression tests (Percy/Chromatic) — separate concern; deferred until customer-journey functional coverage is durable.
- Mobile-Safari E2E — Playwright WebKit covers WebKit-engine bugs but not iOS-specific behavior; deferred.
- OpenAPI-types-driven assertion generation (sibling BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574 surface) — this spec uses hand-written assertions; type-driven assertion gen is a separate evolution.
- Backend admin cleanup endpoint impl — sequence-locked behind BQ-AUTH-OAUTH-CRM-PROVISIONING-BLOCKS-SIGNUP-S574 admin endpoint Chunk 5; file follow-up BQ if scope creeps.

## §10 Predecessor pin

Gate 1 design LOCKED at PR #6 merge SHA `212e49b` on `ai-market-frontend` (S594 dual-APPROVE clean post-fold of MP R1 HIGH auth-fixture-architectural-mismatch finding). Spec stats at lock: 177 lines, 9 ACs, 7 risks, 6 open questions. AC1-AC7 from Gate 1 body.acceptance_criteria_draft expanded to 13 AC-Bs across 6 chunks here per Primary S613 target band.
