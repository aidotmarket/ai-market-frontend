# BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 — Gate 1 Spec v1

**BQ ref:** `build:bq-ci-merge-gate-branch-protection-s574`
**Pillar:** Council/Koskadeux orchestration
**Priority:** P1
**Originating session:** S574
**Spec authored:** S592.W (Worker)
**Repo scope (this Gate):** `aidotmarket/ai-market-frontend` only
**Sibling BQs (out of scope, file at Gate 2):** ai-market-backend, ops-ai-market, runbooks (each gets its own bounded BQ)

---

## 1. Context & Trigger

S574 incident: PR #56 in `aidotmarket/ai-market-backend` was merged to `main` while CI tests were still running. The PR contained a one-line schema fix that the apply script silently dropped (only the test file was committed). CI would have caught the failing tests immediately, but because branch protection did not block merge-on-pending, the PR landed without the fix. PR #57 was needed to ship the actual change. Same session also saw PR #55 merged early (no bug landed but identical discipline gap).

This BQ generalizes the principle locked in `BQ-OPS-AI-MARKET-CI-LINT-GATE` (PR #3 merged S583 with dual APPROVE clean Council Gate 2): turn a discipline gap into a tooling enforcement.

**Repo state at spec authoring:**
- Existing workflows: only `deploy-receipt.yml` (post-merge, not PR-time).
- `gh api repos/aidotmarket/ai-market-frontend/branches/main/protection` returns `404 "Branch not protected"`.
- `package.json` scripts: `dev`, `build`, `start`, `lint`. No `typecheck`. No test runner installed.
- Last 4 merged PRs to `main`: #1 (urgency fix), #2 (Council post-merge cleanup), #3 (status-map fix), #4 (S586 type-gen spec).

## 2. Scope

**In scope (this Gate 1):**
1. Add `typecheck` script to `package.json` (precondition AC0a from S574 AG/MP convergent finding F4).
2. Author one new GitHub Actions workflow `.github/workflows/ci.yml` running on `pull_request` to `main`, with three required jobs: `typecheck`, `lint`, `build`.
3. Apply branch protection rules to `aidotmarket/ai-market-frontend` `main` via the GitHub Branches REST API, enforcing required status checks, no merge-on-pending, no merge-on-failing, and a documented admin-only emergency bypass.
4. Runbook addition documenting the protection rule + emergency bypass procedure with audit trail.

**Out of scope (defer to sibling BQs):**
- Backend repo (`ai-market-backend`) — sibling BQ at Gate 2 follow-on; backend already has `BuildQueueLifecycleGate` and other workflows that need dedicated audit per S574 MP cross-vote finding.
- Ops repo (`ops-ai-market`) — already has CI lint-gate workflow merged at PR #3 (S583); branch protection itself flagged as manual-followup-for-Max in advancement_log; sibling BQ should formalize that.
- Runbooks repo (`aidotmarket/runbooks`) — sibling BQ.
- Adding test runner / E2E tests — covered by `BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574` (queue position 3). Required check set in this Gate 1 deliberately excludes any test job until that BQ ships.

## 3. Acceptance Criteria

**AC0a (precondition).** `package.json` gains a `typecheck` script: `"typecheck": "tsc --noEmit"`. No other script changes. Verified by `npm run typecheck` exiting 0 against current `main` HEAD.

**AC1.** A new file `.github/workflows/ci.yml` exists with these properties:
- Trigger: `on: pull_request: branches: [main]` and `on: push: branches: [main]` (push trigger keeps required checks current on `main` itself).
- Three jobs, each on `ubuntu-latest`, each using `actions/checkout@v4` and `actions/setup-node@v4` with Node version pinned (proposed: `20`, matched to Railway's nixpacks.toml; verify at build time and adjust):
  - `typecheck`: `npm ci` then `npm run typecheck`.
  - `lint`: `npm ci` then `npm run lint`.
  - `build`: `npm ci` then `npm run build`.
- Job names exactly: `typecheck`, `lint`, `build` (these are the strings GitHub uses for required-status-check matching; any drift breaks AC3).
- Concurrency group keyed on `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` on PR runs only.
- Caching: `actions/setup-node` with `cache: 'npm'` and `cache-dependency-path: package-lock.json`.

**AC2.** The workflow runs successfully on a no-op PR opened against `main` (smoke test). Verified by opening a draft PR with a whitespace-only change to a markdown file post-merge and observing all three checks pass.

**AC3.** Branch protection on `aidotmarket/ai-market-frontend` `main` is configured via `PUT /repos/aidotmarket/ai-market-frontend/branches/main/protection` with this JSON shape (recorded in runbook AC8 for reproducibility):
```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["typecheck", "lint", "build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
```
The `strict: true` flag means status checks must be up-to-date with `main` (no stale passes). The `enforce_admins: false` is the deliberate admin emergency-bypass channel (AC6).

**AC4.** Required-status-check completion is enforced before merge — neither pending nor failing checks allow the green merge button. Verified by opening a synthetic test PR that introduces a deliberate `tsc --noEmit` failure and confirming the merge button is disabled in the GitHub UI; capture screenshot or `gh pr view --json mergeable,mergeStateStatus` output showing `mergeStateStatus: BLOCKED`.

**AC5.** Merge methods on the repo settings: squash and merge commit are both allowed; rebase merge is left at current setting (no change required). No bypass for non-admins.

**AC6.** Emergency bypass procedure: admin (`max`) can force-merge via `gh pr merge --admin` per GitHub's documented admin override. Every admin override is recorded as an audit event in the allAI Event Ledger via a `ci_protection_override` event posted manually as part of the bypass procedure (runbook AC8 documents the exact `curl` and event payload).

**AC7.** Self-review checklist replaces approving-review requirement (per S574 MP solo-operator finding F-Q6 — `required_pull_request_reviews: null` in AC3 JSON honors this). Runbook documents the soft self-review checklist: (a) `gh pr diff` reviewed for unintended changes; (b) PR description references BQ ref; (c) all required checks green or admin-bypass justification captured.

**AC8.** A new runbook section is added (proposed location: `aidotmarket/runbooks` repo) documenting:
- The exact protection-rule JSON applied (AC3 verbatim).
- The `gh api PUT` invocation used to apply it (with `--input -` from a file for reproducibility).
- The emergency bypass procedure (`gh pr merge --admin` + manual audit-event POST).
- The self-review checklist (AC7).
- The synthetic-failure verification protocol (AC4).
- Spec-only deferred items: cannot land in this Gate (runbooks repo is out of scope per Section 2). Tracked as a Gate 2 deliverable to file as a sibling BQ (`BQ-RUNBOOK-CI-MERGE-GATE-BRANCH-PROTECTION-S574-FOLLOWUP`) at this BQ's Gate 2 entry.

**AC9.** Verification protocol (combined): a single Markdown verification log committed alongside this spec under `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` at Gate 2, capturing: (a) `gh api branches/main/protection` output post-apply; (b) AC2 smoke-test PR number + check results; (c) AC4 synthetic-failure PR number + `mergeStateStatus: BLOCKED` evidence.

## 4. Implementation Plan (Gate 2 preview)

Single PR with:
1. `package.json` — add `typecheck` script (1 line).
2. `.github/workflows/ci.yml` — new file (≈40 lines).
3. After merge, apply branch protection via `gh api PUT` (admin-only, runs locally; not part of the merged PR).
4. Open AC2 smoke-test PR (whitespace markdown change) and AC4 synthetic-failure PR; close both as part of verification log.
5. File `BQ-RUNBOOK-CI-MERGE-GATE-BRANCH-PROTECTION-S574-FOLLOWUP` at Gate 2 entry to capture the runbook AC8 content (out-of-repo work).

**File touch list (Gate 2):**
- `package.json` (1 line)
- `.github/workflows/ci.yml` (new file)
- `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` (new file, post-apply)

**Total LOC change estimate:** <60 lines spec-merged, plus the runbook content tracked separately.

## 5. Risks

**R1.** Node version drift between CI and Railway production. Railway uses `nixpacks.toml`; if its Node pin differs from CI's, false-pass risk. Mitigation: read `nixpacks.toml` at Gate 2 build time, pin CI to the same major version, document the dependency in runbook AC8.

**R2.** `npm ci` on every job triples install time. Mitigation: `actions/setup-node` `cache: 'npm'` plus `cache-dependency-path` (AC1) reduces this to a single warm cache after first run; jobs run in parallel so wall-clock is bounded by the slowest job (typically `build`).

**R3.** Lint baseline drift. `next lint` may currently fail on existing code if previously not enforced. Mitigation: at Gate 2, run `npm run lint` against current `main` HEAD; if it fails, file a sibling lint-cleanup BQ (precedent: `BQ-OPS-AI-MARKET-LINT-CLEANUP` PR #2 S582) and re-sequence this BQ behind it.

**R4.** Strict-mode checks block legitimate hot-fix merges during real customer incidents. Mitigation: AC6 admin emergency-bypass + audit-event protocol. Cost is one manual `gh pr merge --admin` step + one event-post curl per emergency, accepted.

**R5.** TypeScript version drift. `typescript: ~5.9.3` in devDependencies; `tsc --noEmit` against monorepo-style imports may surface errors that `next build` masks. Mitigation: at Gate 2, run `npm run typecheck` against current `main` HEAD before merging the workflow; if errors exist, file a sibling typecheck-cleanup BQ and re-sequence.

**R6.** Branch-protection JSON schema drift. GitHub occasionally evolves the protection-rule API. Mitigation: pin the `gh api` invocation to the documented v3 REST shape (AC3 JSON), and runbook AC8 captures the exact invocation for re-application.

## 6. Open Questions

**Q1.** Does the Worker have admin permission on `aidotmarket/ai-market-frontend` to call `PUT /repos/.../branches/main/protection`? If not, AC3 is a Primary-or-Max-only step. **Recommendation:** Worker authors and ships the workflow + `typecheck` script via PR; Max applies branch protection via the documented runbook command post-merge. This split mirrors the precedent set by `BQ-OPS-AI-MARKET-CI-LINT-GATE` PR #3 advancement-log addendum (`manual_followup_for_max`).

**Q2.** Should `push: branches: [main]` trigger be included or only `pull_request`? Including push keeps `main`-itself check status fresh which `strict: true` requires. **Recommendation:** include both (AC1 reflects this).

**Q3.** Should the workflow also run on `workflow_dispatch` for manual re-runs? **Recommendation:** yes, low-cost; AC1 should be amended to add `workflow_dispatch` if Council concurs. Marked as a NIT-class question for R1.

**Q4.** Required-status-check name binding: GitHub matches by job name string. If the workflow file uses `name: typecheck` at the workflow level vs at the job level, the displayed check name differs. **Resolution in spec:** AC1 fixes job names exactly as `typecheck`, `lint`, `build`. AC3 contexts list matches. Confirmed against GitHub Actions docs at spec authoring.

**Q5.** Is `concurrency: cancel-in-progress: true` correct for PR runs but wrong for `main` push runs? On `main` push, cancelling an in-flight run could leave required-check status stale and block the next merge. **Resolution:** AC1 specifies cancel-in-progress only for PR runs (conditional on `github.event_name == 'pull_request'`); push runs to `main` are not cancelled.

## 7. Sequence & Dependencies

**Unblocks:** `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` AC3 (CI staleness check requires PR-time CI on frontend repo, currently absent).

**Sequence-locked behind:** none. This BQ is independently shippable.

**Sibling work to file at Gate 2 entry:**
1. `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-BACKEND-S574-FOLLOWUP` (apply same pattern to `ai-market-backend`, audit existing workflows for required-job correctness per S574 MP F4).
2. `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-OPS-S574-FOLLOWUP` (formalize the Max manual-followup from `BQ-OPS-AI-MARKET-CI-LINT-GATE` PR #3 advancement-log into a tracked BQ with audit-event protocol).
3. `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-RUNBOOKS-S574-FOLLOWUP` (apply pattern to `aidotmarket/runbooks`).
4. `BQ-RUNBOOK-CI-MERGE-GATE-BRANCH-PROTECTION-S574-FOLLOWUP` (capture AC8 runbook content as a tracked deliverable since runbooks repo is out of Worker scope this Gate).

## 8. Out of Worker Scope (explicit non-deliverables)

- Modifying any code outside `package.json` and `.github/workflows/`.
- Touching `aidotmarket/runbooks` (out of `repos_locked_worker`).
- Touching `aidotmarket/ai-market-backend` workflow files (sibling BQ).
- Adding test runners or test job (Queue position 3 BQ).
- Applying branch protection via API (admin permission required; Max-followup or Primary).

## 9. Verdict-enum reminder for reviewers

DS reviewers: please return verdict from the explicit 6-value enum: `APPROVE | APPROVE_WITH_NITS | APPROVE_WITH_MANDATES | REVISE | REQUEST_CHANGES | REJECT`. (Filed S587 as `BQ-COUNCIL-DS-VERDICT-ENUM-PROMPT-TEMPLATE-DRIFT-S587` — empty-string verdict on REVISE/REQUEST_CHANGES is the regression to work around.)
