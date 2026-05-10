# BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574 — Gate 1 Spec v1

**BQ ref:** `build:bq-frontend-e2e-customer-journey-tests-s574`
**Pillar:** ai.market product surface (primary); Council/Koskadeux orchestration (secondary)
**Priority:** P2
**Originating session:** S574
**Spec authored:** S592.W (Worker)
**Repo scope:** `aidotmarket/ai-market-frontend` only
**Sequence dependency:** Gate 2 build of this BQ depends on `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574` PR #5 landing first (this BQ adds an `e2e` job to the `ci.yml` that BQ ships). Spec authoring is independently shippable.

---

## 1. Context & Trigger

S574 incident chain produced five connected frontend bugs in the data-request submission flow that any single end-to-end test would have caught before customers hit them. Council post-merge review on PR #1 (S574 Council, AG task `3c1b9bf1` + MP task `0ca2d663`) independently flagged the absence of frontend tests as the structural root cause. Two specific bugs become the canonical regression cases for this spec:

1. **DOM-string-cast on urgency dropdown** — UI showed "Medium" as a select option whose value attribute was the literal string `"medium"`, but the backend enum accepts `["normal", "high", "urgent"]`. Selecting Medium produced a 422 because `"medium"` was POST'd. Generated TypeScript types from `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` (PR #4 merged S586) catch type-shape drift but cannot catch a hard-coded string in a JSX `<option value="...">` that differs from the typed enum at runtime.

2. **FastAPI 422 array-shape unhandled** — backend returned `detail: [{type, loc, msg}]`, the page tried to render it as a string, threw `Cannot read property 'split' of undefined`, white-screened. The fix in PR #2 added an `Array.isArray(detail)` branch (visible at `app/requests/new/page.tsx:75-88` today). A test asserting "submit form, force backend to 422-array-shape, page must not throw" would have caught this in seconds.

**Repo state at spec authoring:**
- Zero test infrastructure: no test runner, no `test` script in `package.json`, zero `.test.*` / `.spec.*` files, zero config (`playwright.config.*` / `vitest.config.*` / `jest.config.*`) anywhere.
- Sign-up flow: `/login` page → `/auth/oauth/[provider]/callback` for Google/GitHub OAuth → `/auth/verify` for magic-link. Auth state persisted via Zustand (`useAuthStore` in `store/auth.ts`), hydrated from localStorage by default per Zustand `persist` middleware.
- Data-request flow: `/requests/new` (`app/requests/new/page.tsx`, 230 lines, currently the only complex form). Uses Axios via `lib/api.ts`. Unauth users redirected to `/login?redirect=/requests/new`.
- Node 20 pinned in `nixpacks.toml`.
- Sibling BQ `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574` (PR #5, AUTHORED at S592.W same session) ships `.github/workflows/ci.yml` with `typecheck` / `lint` / `build` jobs. This BQ's Gate 2 will add an `e2e` job to that file.

## 2. Scope

**In scope (this Gate 1):**
1. Choose test framework: **Playwright** (recommendation; rationale §3.AC1).
2. Author Gate 1 spec covering: framework choice, fast-tier vs full-tier split, the eight specific S574-bug regression cases, integration with the CI workflow shipped by sibling BQ, helper-file structure for shared fixtures.

**Out of scope (defer to siblings or future BQs):**
- Component-level unit tests (Vitest + React Testing Library) — bug class targeted here is user-flow / DOM-render, which Playwright covers; component tests can be a future BQ.
- Visual regression / screenshot diffing (Percy, Chromatic) — high churn cost, low signal for the targeted bug class.
- Other customer journeys not on the S574 incident path (browse listings, checkout flow, dashboard CRUD, seller onboarding) — file as bounded follow-on BQs at this Gate 2 entry.
- Backend integration tests — backend test coverage is a backend repo concern.
- Mobile viewport / responsive testing — desktop Chromium fast tier only at Gate 2; mobile tier deferred.

## 3. Acceptance Criteria

**AC1 — Framework choice: Playwright.**
- Rationale: bug class is user-flow / DOM-render; full real-browser environment required to catch DOM-string-cast bugs (the urgency dropdown bug is invisible to JSDOM-based RTL because the bug is in the rendered `<option>` value attribute, not in component logic).
- Install: `@playwright/test` and the Chromium browser binary (single browser for fast tier; cross-browser deferred).
- Pinned versions captured in `package.json` `devDependencies` at Gate 2.

**AC2 — `package.json` test scripts.**
- `"test"`: runs the fast tier (`playwright test --grep @fast`).
- `"test:e2e"`: runs the full tier (`playwright test`).
- `"test:e2e:ui"`: opens Playwright's UI mode for local debugging (`playwright test --ui`).
- `"test:install"`: `playwright install --with-deps chromium` (CI prerequisite).

**AC3 — Two-tier test architecture.**
- **Fast tier** (`@fast` tag, PR-time): runs against `next dev` started by Playwright `webServer` config. API calls intercepted via `page.route()` mocks. Target wall-clock: under 90 seconds on CI cold cache. Runs on every PR.
- **Full tier** (no tag, post-deploy): runs against the deployed staging URL (`STAGING_URL` env var, defaults to production Railway URL). Real backend, real auth providers (uses dedicated test accounts behind feature-flag — see Q4). Runs on `deploy-receipt.yml` after health-verified deploy.

**AC4 — Fast-tier coverage (the eight regression cases for S574 incidents).**

Each case is a single Playwright test tagged `@fast`, in files under `tests/e2e/fast/`:

- **AC4.1** Magic-link request submission. Test fills `/login` form with email, asserts POST to `/api/v1/auth/magic-link` (or current backend route — verify at Gate 2) and that success state renders.
- **AC4.2** Google OAuth callback handling. Test navigates directly to `/auth/oauth/google/callback?code=test_code`, route-mocks the backend exchange to return `{access_token, user}`, asserts auth-store populated and redirect occurred.
- **AC4.3** GitHub OAuth callback handling. Same pattern as AC4.2 with provider=github.
- **AC4.4** Data-request submission, `urgency='normal'`. Pre-seeds auth store via `seedAuth(page)` helper, navigates to `/requests/new`, fills minimal fields, leaves urgency at default, submits, asserts payload contains `urgency: "normal"`.
- **AC4.5 [the canonical S574 regression]** Data-request submission, urgency dropdown selection. Test selects each visible urgency option in turn, asserts the POST payload contains a value from the typed enum `["normal", "high", "urgent"]` — never the display label. **This test is the explicit lock for the PR #1 / PR #2 / PR #3 incident chain.**
- **AC4.6** Data-request 422 array response. Test forces route mock to return `400` payload `{detail: [{type:"value_error", loc:["body","description"], msg:"too short"}]}`, submits, asserts page does not unmount and toast renders with `description: too short` text.
- **AC4.7** Data-request 422 string response (legacy shape). Test forces route mock to return `{detail: "Insufficient permissions"}`, asserts toast renders the string verbatim with no parse error.
- **AC4.8** Unauth redirect on `/requests/new`. Test ensures auth-store is empty, navigates to `/requests/new`, asserts redirect to `/login?redirect=%2Frequests%2Fnew`.

**AC5 — Helper file structure.**

Under `tests/e2e/`:
- `tests/e2e/fixtures/auth.ts` — exports `seedAuth(page, {email, name})` helper that uses `page.context().addInitScript()` to write the Zustand-persist localStorage shape directly (sidestepping OAuth round-trip).
- `tests/e2e/fixtures/route-mocks.ts` — exports `mockDataRequestEndpoint(page, {responseStatus, responseBody})` helper centralizing all route intercepts for the `/api/v1/data-requests` POST. AC4.4–AC4.7 must use this helper rather than open-coding `page.route()` calls.
- `tests/e2e/fixtures/oauth.ts` — exports `mockOAuthExchange(page, {provider, response})` helper for AC4.2/AC4.3.

**AC6 — CI integration.**
- Gate 2 amends `.github/workflows/ci.yml` (shipped by sibling BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574, PR #5) to add a fourth required job `e2e`. Job runs `npm ci && npm run test:install && npm test` on `ubuntu-latest`, Node 20.
- Job name exactly `e2e` (matches the AC3-style naming convention from sibling BQ).
- Branch-protection contexts list (set by sibling BQ's runbook follow-up) is amended to include `e2e` as a required check. Captured as a manual-followup-for-Max in this BQ's Gate 2 advancement-log addendum, mirroring the BQ-OPS-AI-MARKET-CI-LINT-GATE PR #3 precedent.
- Cache `~/.cache/ms-playwright` keyed on `package-lock.json` + Playwright version to keep CI install under 30 seconds on warm cache (see R1).

**AC7 — Playwright config (`playwright.config.ts`).**
- `testDir: 'tests/e2e'`.
- `fullyParallel: true`.
- `forbidOnly: !!process.env.CI` (refuses CI runs that contain `test.only`).
- `retries: process.env.CI ? 1 : 0` (one retry on CI to absorb transient flake; zero locally).
- `workers: process.env.CI ? 2 : undefined` (Two CI workers; auto locally).
- `reporter: [['html'], ['list']]`.
- `use: {baseURL: process.env.STAGING_URL || 'http://127.0.0.1:3000', trace: 'on-first-retry'}`.
- `webServer`: starts `npm run dev` for fast tier when no `STAGING_URL` is set; reuses existing server if up.
- Single Chromium project at Gate 2; Firefox/WebKit deferred.

**AC8 — Verification protocol.**
A `specs/BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574-VERIFICATION.md` file committed at Gate 2 captures: (a) `npm test` exit-zero output snippet from local run, (b) CI run URL on PR-open showing `e2e` job green, (c) wall-clock measurement (target sub-90-seconds on CI), (d) manual verification of AC4.5 by deliberately re-introducing the PR #1 bug locally and confirming the test fails.

**AC9 — `.gitignore` updates.**
Add Playwright artifact patterns: `playwright-report/`, `test-results/`, `blob-report/`, `playwright/.cache/`.

## 4. Implementation Plan (Gate 2 preview)

**Sequence-locked behind:** sibling BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 PR #5 merging to main. Gate 2 of this BQ cannot ship `e2e` job into a `ci.yml` that does not yet exist on `main`.

Single PR with:
1. `package.json` — add `@playwright/test` devDep, four test scripts (AC2). (~6 lines)
2. `playwright.config.ts` — new file (~40 lines, AC7).
3. `tests/e2e/fixtures/auth.ts` — new file (~30 lines, AC5).
4. `tests/e2e/fixtures/route-mocks.ts` — new file (~40 lines, AC5).
5. `tests/e2e/fixtures/oauth.ts` — new file (~30 lines, AC5).
6. `tests/e2e/fast/auth-magic-link.spec.ts` — AC4.1.
7. `tests/e2e/fast/auth-oauth-google.spec.ts` — AC4.2.
8. `tests/e2e/fast/auth-oauth-github.spec.ts` — AC4.3.
9. `tests/e2e/fast/data-request-submit-default.spec.ts` — AC4.4.
10. `tests/e2e/fast/data-request-urgency-dropdown.spec.ts` — AC4.5 (the canonical S574 regression).
11. `tests/e2e/fast/data-request-422-array.spec.ts` — AC4.6.
12. `tests/e2e/fast/data-request-422-string.spec.ts` — AC4.7.
13. `tests/e2e/fast/auth-redirect.spec.ts` — AC4.8.
14. `.github/workflows/ci.yml` — append `e2e` job (AC6).
15. `.gitignore` — add Playwright artifact patterns (AC9).
16. `specs/BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574-VERIFICATION.md` — verification log (AC8, post-merge).

**Total LOC change estimate (Gate 2):** ~600 lines including tests, helpers, config, workflow patch.

## 5. Risks

**R1 — Playwright install size.** Chromium binary plus npm install adds ~300MB. CI cold cache install is ~3 minutes. Mitigation: `actions/cache` keyed on Playwright version + lockfile hash; warm cache install ~15 seconds. Captured in AC6.

**R2 — Auth-store internal API drift.** `seedAuth(page)` (AC5) writes the Zustand-persist localStorage shape. If `store/auth.ts` changes its persist key or shape, all auth-required tests break. Mitigation: helper imports the actual `useAuthStore` hydration shape from `store/auth.ts` rather than open-coding it; type-checked at build time.

**R3 — Sequence-locked on sibling BQ.** AC6 amends `.github/workflows/ci.yml` shipped by `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574` PR #5. If that PR is rejected or rewritten with different job names, AC6 changes. Mitigation: AC6 references the spec by BQ ref and specifies `e2e` as a new job appended to the existing file, not replacing existing jobs. Adapter cost on sibling rewrite is bounded.

**R4 — Test flakiness from hydration races.** Zustand persist hydration is async; tests that act before hydration completes see empty auth state. Mitigation: `seedAuth` uses `addInitScript` (runs before any page script), and helper waits for a hydration sentinel (e.g., a known DOM element gated on `isLoading=false`).

**R5 — Route mocks fall behind real API shape.** Tests use mocked responses; if backend response shape evolves, fast-tier passes while real backend breaks. Mitigation: AC3 full-tier (against staging real backend) catches drift on every deploy receipt; full-tier failure files an alert event to allAI ledger.

**R6 — `next dev` start-up time eating wall-clock budget.** `next dev` cold start is 5–15 seconds. Mitigation: AC7 `webServer.reuseExistingServer` reuses a running dev server locally; CI accepts the cold start as part of the 90-second budget.

**R7 — OAuth provider tests rely on route interception of internal endpoints.** If the frontend later switches OAuth strategy (NextAuth, Clerk, custom), the intercept path changes. Mitigation: AC5 isolates OAuth mock logic in `fixtures/oauth.ts` so adapter cost is one file.

## 6. Open Questions

**Q1 — `npm test` script binding.** Industry-standard `npm test` is unit tests; some teams reserve `npm run test:e2e` for Playwright. **Resolution:** AC2 binds `npm test` to the fast tier explicitly (Playwright `--grep @fast`), keeping the conventional command useful for CI defaults; full tier is `npm run test:e2e`. Marked as a NIT-class question for R1.

**Q2 — Auth seed via localStorage vs cookie.** Zustand persist middleware writes to localStorage by default. **Resolution:** AC5 helper writes localStorage to mirror real user state; if the auth store later moves to cookies (httpOnly), helper updates. Marked as a NIT-class question for R1.

**Q3 — Screenshot snapshots.** Playwright supports `expect(page).toHaveScreenshot()`. **Resolution:** explicitly out of scope for Gate 1 — high churn cost (snapshot updates on every CSS tweak), low signal for the targeted bug class. Future BQ if visual-regression is wanted.

**Q4 — Full-tier tests against real OAuth providers.** Real Google/GitHub OAuth in CI requires test accounts and bot-detection workarounds. **Recommendation:** full tier uses dedicated test accounts gated behind a feature flag (`E2E_TEST_MODE=1` env var); accounts have limited scope; flag and accounts created manually by Max as part of Gate 2 admin-followup. Documented as a Q for Council to confirm.

**Q5 — `e2e` job blocking-or-warning on CI.** Should `e2e` job be a required status check (block merge on failure) or warning-only initially? **Recommendation:** required from day one, mirroring the strict policy of sibling CI BQ. If flake materializes, demote to warning-only via a single-line protection-rule update; do not pre-emptively weaken the gate.

**Q6 — Playwright trace artifact retention.** `trace: 'on-first-retry'` produces zip files; CI artifact retention defaults to 90 days. **Recommendation:** accept the default; storage cost is negligible at frontend test volume.

## 7. Sequence & Dependencies

**Sequence-locked behind:** `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574` PR #5 merging to `main` (AC6 depends on `ci.yml` existing). Gate 1 spec authoring is independent and can ship now.

**Unblocks:** `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` AC8 ("test-suite precondition"). Generated types catch type-shape drift; this BQ catches DOM-string-cast and user-flow drift; together they complete the type-gen-enforcement story.

**Sibling work to file at Gate 2 entry:**
1. `BQ-FRONTEND-COMPONENT-UNIT-TESTS-S574-FOLLOWUP` — Vitest + RTL component-level tests for non-customer-journey paths (utility components, hooks). Optional, only if the bug class shifts.
2. `BQ-FRONTEND-E2E-BROWSE-CHECKOUT-JOURNEYS-S574-FOLLOWUP` — extend Playwright suite to listings browse + checkout flow once the customer-journey spec pattern is locked in this BQ.
3. `BQ-FRONTEND-E2E-MOBILE-VIEWPORT-COVERAGE-S574-FOLLOWUP` — add mobile Chromium project to Playwright config.
4. `BQ-FRONTEND-E2E-TEST-ACCOUNT-PROVISIONING-S574-FOLLOWUP` — Q4 admin work: provision Google/GitHub test accounts gated behind `E2E_TEST_MODE` flag.

## 8. Out of Worker Scope (explicit non-deliverables)

- Modifying `store/auth.ts` (read-only at Gate 2 — fixtures import current shape).
- Modifying `app/requests/new/page.tsx` (the page is the system-under-test; spec only adds tests against it).
- Touching backend routes or backend test fixtures.
- Provisioning real OAuth test accounts (Q4 → Max-followup at Gate 2).
- Touching `.github/workflows/deploy-receipt.yml` for the full-tier hookup — Gate 2 of this BQ adds it as a NEW job; does not modify the existing deploy-verify job.

## 9. Verdict-enum reminder for reviewers

DS reviewers: please return verdict from the explicit 6-value enum: `APPROVE | APPROVE_WITH_NITS | APPROVE_WITH_MANDATES | REVISE | REQUEST_CHANGES | REJECT`. (Filed S587 as `BQ-COUNCIL-DS-VERDICT-ENUM-PROMPT-TEMPLATE-DRIFT-S587` — empty-string verdict on REVISE/REQUEST_CHANGES is the regression to work around.)
