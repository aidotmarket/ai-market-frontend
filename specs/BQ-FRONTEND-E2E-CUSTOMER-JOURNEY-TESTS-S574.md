# BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574 — Gate 1 Spec v2

**BQ ref:** `build:bq-frontend-e2e-customer-journey-tests-s574`
**Pillar:** ai.market product surface (primary); Council/Koskadeux orchestration (secondary)
**Priority:** P2
**Originating session:** S574
**Spec authored:** S592.W (Worker); R2 fold S574 Gate 1
**Repo scope:** `aidotmarket/ai-market-frontend` only
**Sequence dependency:** Gate 2 build of this BQ depends on `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574` PR #5 landing first (this BQ adds an `e2e` job to the `ci.yml` that BQ ships). Spec authoring is independently shippable.

---

## 1. Context & Trigger

S574 incident chain produced five connected frontend bugs in the data-request submission flow that any single end-to-end test would have caught before customers hit them. Council post-merge review on PR #1 (S574 Council, AG task `3c1b9bf1` + MP task `0ca2d663`) independently flagged the absence of frontend tests as the structural root cause. Two specific bugs become the canonical regression cases for this spec:

1. **DOM-string-cast on urgency dropdown** — UI showed "Medium" as a select option whose value attribute was the literal string `"medium"`, but the backend enum accepts `["normal", "high", "urgent"]`. Selecting Medium produced a 422 because `"medium"` was POST'd. Generated TypeScript types from `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` (PR #4 merged S586) catch type-shape drift but cannot catch a hard-coded string in a JSX `<option value="...">` that differs from the typed enum at runtime.

2. **FastAPI 422 array-shape unhandled** — backend returned `detail: [{type, loc, msg}]`, the page tried to render it as a string, threw `Cannot read property 'split' of undefined`, white-screened. The fix in PR #2 added an `Array.isArray(detail)` branch (visible at `app/requests/new/page.tsx:75-88` today). A test asserting "submit form, force backend to 422-array-shape, page must not throw" would have caught this in seconds.

**Repo state verified during R2 fold:**
- Zero test infrastructure: no test runner, no `test` script in `package.json`, zero `.test.*` / `.spec.*` files, zero config (`playwright.config.*` / `vitest.config.*` / `jest.config.*`) anywhere.
- Auth store: `store/auth.ts` uses plain Zustand `create`, not `persist`. Tokens and user are in memory only. Both `store/auth.ts` and `api/client.ts` explicitly document "never localStorage"; there is no persisted localStorage auth shape to seed.
- Auth API: `api/auth.ts` wraps Axios client paths under `/api/v1`, including `POST /auth/login`, `POST /auth/magic-link/request`, `GET /auth/me`, `GET /auth/oauth/{provider}/authorize`, and `POST /auth/oauth/{provider}/callback`.
- OAuth callback flow: `app/auth/oauth/[provider]/callback/page.tsx` requires `code`, `state`, and `sessionStorage.oauth_nonce`; it removes the nonce, calls `useAuthStore.getState().oauthLogin(provider, code, state, nonce)`, which exchanges tokens through `oauthCallback`, then calls `getMe`. Current code redirects to `/listings` after success. That is a verified repo-state mismatch with the desired customer-journey intent handling; Gate 2 must make the callback intent-aware or explicitly split that product change before coding these tests. The AC4.2/AC4.3 test contract below expects `/dashboard` and `/requests/new`, not `/listings`.
- Data-request flow: `/requests/new` (`app/requests/new/page.tsx`, 230 lines, currently the only complex form). Uses Axios via `api/data-requests.ts`. Unauth users redirected to `/login?redirect=/requests/new`.
- Data-request urgency enum currently includes `["low", "normal", "high", "urgent"]` in both `types/index.ts` and the `/requests/new` select.
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

- **AC4.1** Magic-link request submission. Test fills `/login` form with email `buyer@example.test`, switches to magic-link mode through the visible "Sign in with a magic link instead" control, route-mocks and asserts exactly one `POST /api/v1/auth/magic-link/request` with payload `{email:"buyer@example.test"}`, and asserts the success state renders.
- **AC4.2** Google OAuth callback handling. Test sets `sessionStorage.oauth_nonce = "nonce-google-test"` with `page.addInitScript()` before navigation, route-mocks `POST /api/v1/auth/oauth/google/callback` and `GET /api/v1/auth/me`, then navigates to `/auth/oauth/google/callback?code=test_google_code&state=dashboard`. Token exchange response shape is exactly `{access_token:"access-google-test", refresh_token:"refresh-google-test", expires_in:3600, user:{id:"user_test_1", email:"buyer@example.test", first_name:"Test", last_name:"Buyer", role:"buyer"}}`. The `/api/v1/auth/me` mock returns a realistic current `User` payload: `{id:"user_test_1", email:"buyer@example.test", first_name:"Test", last_name:"Buyer", company_name:"Example Buyer LLC", role:"buyer", status:"active", created_at:"2026-01-01T00:00:00Z", email_verified_at:"2026-01-01T00:00:00Z", totp_enabled:false, auth_methods:["oauth"], primary_auth:"google"}`. The test asserts the exchange request body contains `{code:"test_google_code", state:"dashboard", nonce:"nonce-google-test"}`, asserts `/api/v1/auth/me` was called, and asserts post-callback redirect to `/dashboard`.
- **AC4.3** GitHub OAuth callback handling. Same pattern as AC4.2 with provider `github`, `code=test_github_code`, `nonce=nonce-github-test`, and `state=requests-new`. The test asserts the exchange request body contains `{code:"test_github_code", state:"requests-new", nonce:"nonce-github-test"}`, asserts `/api/v1/auth/me` was called with a realistic buyer payload, and asserts post-callback redirect to `/requests/new`.
- **AC4.4** Data-request submission, `urgency='normal'`. Auth is established through `loginViaPasswordUi(page)` (AC5) before navigating to `/requests/new`. Test fills exact current form fields: Description = `Need weekly anonymized B2B purchase intent data for North American SaaS accounts.`, Categories = `technology, marketing`, Format Preferences = `CSV, JSON`, Min Budget (USD) = `1000`, Max Budget (USD) = `5000`, Provenance Requirements = `Source must include consented collection and commercial-use rights.`, leaves Urgency at `Normal`, submits, and asserts the mocked `POST /api/v1/data-requests` payload contains `urgency:"normal"` plus the exact parsed fields.
- **AC4.5 [the canonical S574 regression]** Data-request submission, urgency dropdown selection. Test selects each visible urgency option in turn (`Low`, `Normal`, `High`, `Urgent`) and asserts the POST payload contains a value from the typed enum `["low", "normal", "high", "urgent"]` — never the display label. **This test is the explicit lock for the PR #1 / PR #2 / PR #3 incident chain.**
- **AC4.6** Data-request 422 array response. Test forces route mock to return `400` payload `{detail: [{type:"value_error", loc:["body","description"], msg:"too short"}]}`, submits, asserts page does not unmount and toast renders with `description: too short` text.
- **AC4.7** Data-request 422 string response (legacy shape). Test forces route mock to return `{detail: "Insufficient permissions"}`, asserts toast renders the string verbatim with no parse error.
- **AC4.8** Unauth redirect on `/requests/new`. Test ensures auth-store is empty, navigates to `/requests/new`, asserts redirect to `/login?redirect=%2Frequests%2Fnew`.

**AC5 — Helper file structure and auth fixture strategy.**

Auth-required tests must not seed localStorage. The repo has no Zustand `persist` middleware and no persisted auth shape. Gate 2 uses route-mocked real UI login/OAuth flows because that exercises the same `useAuthStore` actions, Axios auth APIs, token assignment, and `GET /auth/me` hydration path that the regression suite is meant to protect. A test-only `store.setState()` hook is rejected for this BQ because it bypasses the auth code path and would recreate the architectural blind spot R1 found.

Under `tests/e2e/`:
- `tests/e2e/fixtures/auth.ts` — exports `loginViaPasswordUi(page, {email, password, user})`. The helper route-mocks `POST /api/v1/auth/login` to return `{access_token, refresh_token, expires_in}`, route-mocks `GET /api/v1/auth/me` to return the complete realistic buyer `User` shape from AC4.2, drives `/login` with `getByLabel('Email')`, `getByLabel('Password')`, and `getByRole('button', {name:/log in/i})`, then waits for the redirect. It must assert the login POST and `/auth/me` calls occurred before returning.
- `tests/e2e/fixtures/route-mocks.ts` — exports `mockDataRequestEndpoint(page, {responseStatus, responseBody})` helper centralizing all route intercepts for the `/api/v1/data-requests` POST. AC4.4–AC4.7 must use this helper rather than open-coding `page.route()` calls.
- `tests/e2e/fixtures/oauth.ts` — exports `mockOAuthExchange(page, {provider, code, state, nonce, tokenResponse, user})` helper for AC4.2/AC4.3. It must require the callback request body to include `code`, `state`, and `nonce`, return the full token response shape, and separately mock `GET /api/v1/auth/me`.

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
A `specs/BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574-VERIFICATION.md` file committed at Gate 2 captures: (a) `npm test` exit-zero output snippet from local run, (b) CI run URL on PR-open showing `e2e` job green, (c) wall-clock measurement (target sub-90-seconds on CI), (d) shell-runnable mutation assertion for AC4.5. The mutation assertion must be reproducible from a clean working tree: temporarily change the `/requests/new` urgency option value from `normal` to `medium`, run `npm test -- --grep "urgency dropdown"`, confirm the command exits non-zero on the payload assertion, then revert the deliberate mutation.

**AC9 — `.gitignore` updates.**
Add Playwright artifact patterns: `playwright-report/`, `test-results/`, `blob-report/`, `playwright/.cache/`.

**AC10 — Selector policy.**
Tests must prefer user-visible Playwright locators: `page.getByRole()`, `page.getByLabel()`, and `page.getByText()`; use `page.getByPlaceholder()`, `page.getByAltText()`, or `page.getByTitle()` when that is the visible contract. `page.getByTestId()` is allowed only when no stable accessible/user-visible locator exists. CSS and XPath selectors are forbidden in this suite. Rationale: Playwright's locator docs recommend prioritizing user-facing attributes and role locators, describe role locators as closest to how users and assistive tech perceive the page, and warn CSS/XPath are tied to DOM implementation and can break when structure changes: https://playwright.dev/docs/locators.

## 3A. Verification Table Appendix

| AC | Gate 2 verification command or assertion |
| --- | --- |
| AC1 | `npm ls @playwright/test` and `npx playwright --version` exit zero. |
| AC2 | `node -e "const p=require('./package.json'); for (const k of ['test','test:e2e','test:e2e:ui','test:install']) if (!p.scripts?.[k]) process.exit(1)"`. |
| AC3 | `npx playwright test --grep @fast --list` lists only `tests/e2e/fast/*`; config contains `webServer` and `STAGING_URL` handling. |
| AC4.1 | Playwright assertion: captured magic-link mock receives `POST /api/v1/auth/magic-link/request` with `{email:'buyer@example.test'}` and success text is visible. |
| AC4.2 | Playwright assertions: `sessionStorage.oauth_nonce` is set before navigation; callback mock receives `{code,state,nonce}`; `/api/v1/auth/me` mock is called; final URL is `/dashboard`. |
| AC4.3 | Same assertions as AC4.2 for GitHub, with `state=requests-new`; final URL is `/requests/new`. |
| AC4.4 | Playwright assertion: data-request mock receives the exact payload from the enumerated field values, including `urgency:'normal'`. |
| AC4.5 | Playwright assertion loop over `['low','normal','high','urgent']`: each submitted payload urgency is one of those values and never a display label. |
| AC4.6 | Playwright assertions: forced FastAPI array detail response leaves the form mounted and renders `description: too short`. |
| AC4.7 | Playwright assertion: forced string detail response renders `Insufficient permissions` with no page error. |
| AC4.8 | Playwright assertion: unauthenticated `/requests/new` navigation reaches `/login?redirect=%2Frequests%2Fnew`. |
| AC5 | `rg "localStorage|persist|seedAuth|setState" tests/e2e/fixtures tests/e2e/fast` must not show auth seeding; `rg "loginViaPasswordUi|mockOAuthExchange" tests/e2e` must show shared helpers used. |
| AC6 | CI PR run shows required `e2e` job green; branch-protection admin follow-up records `e2e` as a required check. |
| AC7 | `npx playwright test --config playwright.config.ts --list` exits zero. |
| AC8 | `specs/BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574-VERIFICATION.md` includes the local `npm test` output snippet, CI URL, wall-clock, and mutation-failure command. Mutation check is shell-runnable: temporarily change the `/requests/new` urgency option value from `normal` to `medium`, run `npm test -- --grep "urgency dropdown"`, and record the failing assertion before reverting the deliberate mutation. |
| AC9 | `git check-ignore playwright-report test-results blob-report playwright/.cache` exits zero after `.gitignore` update. |
| AC10 | `rg "locator\\(|css=|xpath=|//" tests/e2e` returns no selector-policy violations except approved comments or URLs. |

## 4. Implementation Plan (Gate 2 preview)

**Sequence-locked behind:** sibling BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 PR #5 merging to main. Gate 2 of this BQ cannot ship `e2e` job into a `ci.yml` that does not yet exist on `main`.

Single PR with:
1. `package.json` — add `@playwright/test` devDep, four test scripts (AC2). (~6 lines)
2. `playwright.config.ts` — new file (~40 lines, AC7).
3. `tests/e2e/fixtures/auth.ts` — new file (~50 lines, AC5).
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
14. `app/auth/oauth/[provider]/callback/page.tsx` — only if still required at Gate 2, add minimal intent-aware redirect handling so AC4.2/AC4.3 can assert `/dashboard` and `/requests/new` instead of current `/listings`.
15. `.github/workflows/ci.yml` — append `e2e` job (AC6).
16. `.gitignore` — add Playwright artifact patterns (AC9).
17. `specs/BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574-VERIFICATION.md` — verification log (AC8, post-merge).

**Total LOC change estimate (Gate 2):** ~600 lines including tests, helpers, config, workflow patch.

## 5. Risks

**R1 — Playwright install size.** Chromium binary plus npm install adds ~300MB. CI cold cache install is ~3 minutes. Mitigation: `actions/cache` keyed on Playwright version + lockfile hash; warm cache install ~15 seconds. Captured in AC6.

**R2 — Auth-store internal API drift.** Auth-required tests rely on the real `login` / `oauthLogin` store actions and route-mocked API responses. If `store/auth.ts` changes its token/user shape, tests fail through the same public behavior users exercise rather than through private localStorage implementation details. Mitigation: keep helper assertions at the UI/API boundary and avoid direct `useAuthStore.setState()` except for optional debug-only diagnostics.

**R3 — Sequence-locked on sibling BQ.** AC6 amends `.github/workflows/ci.yml` shipped by `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574` PR #5. If that PR is rejected or rewritten with different job names, AC6 changes. Mitigation: AC6 references the spec by BQ ref and specifies `e2e` as a new job appended to the existing file, not replacing existing jobs. Adapter cost on sibling rewrite is bounded.

**R4 — Test flakiness from auth setup races.** Auth state is in memory, so auth-required tests must complete the mocked login flow before navigating to protected pages. Mitigation: `loginViaPasswordUi` waits for the login POST, `/auth/me`, and the post-login redirect before returning; OAuth helpers set `sessionStorage.oauth_nonce` with `addInitScript` before page scripts run.

**R5 — Route mocks fall behind real API shape.** Tests use mocked responses; if backend response shape evolves, fast-tier passes while real backend breaks. Mitigation: AC3 full-tier (against staging real backend) catches drift on every deploy receipt; full-tier failure files an alert event to allAI ledger.

**R6 — `next dev` start-up time eating wall-clock budget.** `next dev` cold start is 5–15 seconds. Mitigation: AC7 `webServer.reuseExistingServer` reuses a running dev server locally; CI accepts the cold start as part of the 90-second budget.

**R7 — OAuth provider tests rely on route interception of internal endpoints.** If the frontend later switches OAuth strategy (NextAuth, Clerk, custom), the intercept path changes. Mitigation: AC5 isolates OAuth mock logic in `fixtures/oauth.ts` so adapter cost is one file.

## 6. Open Questions

**Q1 — `npm test` script binding.** **Resolution:** AC2 binds `npm test` to the fast tier explicitly (Playwright `--grep @fast`), keeping the conventional command useful for CI defaults; full tier is `npm run test:e2e`.

**Q2 — Auth seed via localStorage vs cookie.** **Resolution:** closed by R2. There is no Zustand persist middleware and no auth localStorage shape. AC5 requires route-mocked real UI login/OAuth flows and forbids localStorage auth seeding.

**Q3 — Screenshot snapshots.** Playwright supports `expect(page).toHaveScreenshot()`. **Resolution:** explicitly out of scope for Gate 1 — high churn cost (snapshot updates on every CSS tweak), low signal for the targeted bug class. Future BQ if visual-regression is wanted.

**Q4 — Full-tier tests against real OAuth providers.** Real Google/GitHub OAuth in CI requires test accounts and bot-detection workarounds. **Resolution:** deferred to admin follow-up, not a Gate 2 implementation blocker. Full-tier real-provider coverage uses dedicated limited-scope test accounts gated behind `E2E_TEST_MODE=1`; account provisioning and provider-console configuration are Max/admin follow-ups documented in the Gate 2 advancement log.

**Q5 — `e2e` job blocking-or-warning on CI.** **Resolution:** closed by AC6. The `e2e` job is required from day one, mirroring the strict policy of sibling CI BQ. If flake materializes, demotion requires an explicit follow-up decision and branch-protection update.

**Q6 — Playwright trace artifact retention.** **Resolution:** accept the default GitHub artifact retention; storage cost is negligible at frontend test volume.

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
- Modifying `app/auth/oauth/[provider]/callback/page.tsx` except for the minimal intent-aware redirect work called out by AC4.2/AC4.3 if it has not landed before Gate 2 starts.
- Touching backend routes or backend test fixtures.
- Provisioning real OAuth test accounts (Q4 → Max-followup at Gate 2).
- Touching `.github/workflows/deploy-receipt.yml` for the full-tier hookup — Gate 2 of this BQ adds it as a NEW job; does not modify the existing deploy-verify job.

## 9. Verdict-enum reminder for reviewers

DS reviewers: please return verdict from the explicit 6-value enum: `APPROVE | APPROVE_WITH_NITS | APPROVE_WITH_MANDATES | REVISE | REQUEST_CHANGES | REJECT`. (Filed S587 as `BQ-COUNCIL-DS-VERDICT-ENUM-PROMPT-TEMPLATE-DRIFT-S587` — empty-string verdict on REVISE/REQUEST_CHANGES is the regression to work around.)
