# BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 — Gate 1 Spec v3

**BQ ref:** `build:bq-ci-merge-gate-branch-protection-s574`
**Pillar:** Council/Koskadeux orchestration
**Priority:** P1
**Originating session:** S574
**Spec authored:** S592.W (Worker)
**Entity version reconciled:** v3 from Living State on 2026-05-10
**Repo scope (this Gate):** `aidotmarket/ai-market-frontend` only
**Sibling BQs (out of scope, file at Gate 2):** ai-market-backend, ops-ai-market, runbooks (each gets its own bounded BQ)
**Version metadata:**
- v1 repo commit: `9a5292a5f52994367abec9f6d239d40ecf586371`
- v1 repo file length observed during R2: 155 lines
- v3 entity version: 3
- v3 entity file length recorded: 290 lines
- v3 entity source ref: `9a5292a5f52994367abec9f6d239d40ecf586371`
- v3 entity status: `planned` / Gate 1 `AUTHORED`
- Reconciliation owner: R2 fold worker
- Reconciliation rule: entity v3 supersedes repo v1
- Review fold rule: R1 mandates must apply only after this v3 sync
- Branch base for review diff: `origin/main`
- PR head verified: PR #5 `spec/bq-ci-merge-gate-branch-protection-s574`

---

## 1. Context & Trigger

S574 incident: PR #56 in `aidotmarket/ai-market-backend` was merged to `main` while CI tests were still running. The PR contained a one-line schema fix that the apply script silently dropped (only the test file was committed). CI would have caught the failing tests immediately, but because branch protection did not block merge-on-pending, the PR landed without the fix. PR #57 was needed to ship the actual change. Same session also saw PR #55 merged early (no bug landed but identical discipline gap).

This BQ generalizes the principle locked in `BQ-OPS-AI-MARKET-CI-LINT-GATE` (PR #3 merged S583 with dual APPROVE clean Council Gate 2): turn a discipline gap into a tooling enforcement.

**Repo state at spec authoring:**
- Existing workflows: only `deploy-receipt.yml` (post-merge, not PR-time).
- `gh api repos/aidotmarket/ai-market-frontend/branches/main/protection` returns `404 "Branch not protected"`.
- `package.json` scripts: `dev`, `build`, `start`, `lint`. No `typecheck`. No test runner installed.
- Last 4 merged PRs to `main`: #1 (urgency fix), #2 (Council post-merge cleanup), #3 (status-map fix), #4 (S586 type-gen spec).

**Living State reconciliation note (v3).**
The canonical BQ entity records Gate 1 as authored at PR #5 with `spec_lines: 290`, `spec_sha:
9a5292a5f52994367abec9f6d239d40ecf586371`, `spec_path:
specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574.md`, and `status: AUTHORED`. The repository copy
at that SHA was a shorter v1 file, so this v3 baseline reconciles the repo file to the entity's
Gate 1 intent before R1 review folding. The entity does not embed a full markdown body; this v3
expands the v1 repo text with the entity's recorded metadata, S574 findings, and explicit Gate 2
execution details while preserving the original scope and acceptance criteria numbering.

**Entity-recorded S574 findings folded before Council R1 dispatch:**
- AG primary finding F4: frontend has no PR-time CI, so this Gate must create a PR-time workflow
  before branch protection can use required checks.
- MP cross-vote finding F4: branch protection must require concrete named jobs, not a vague
  workflow-level pass.
- MP solo-operator finding F-Q6: required human review is heavier than the incident demands for
  solo operation; use required checks plus self-review discipline instead.

**Gate 1 PR metadata recorded in entity v3:**
- PR: `https://github.com/aidotmarket/ai-market-frontend/pull/5`
- Branch: `spec/bq-ci-merge-gate-branch-protection-s574`
- Spec path: `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574.md`
- Authored by: `vulcan-worker-S592.W`
- Authored at: `2026-05-10T00:33:00Z`
- Verification evidence: branch pushed, PR #5 open, and branch SHA confirmed by `git ls-remote`.

## 2. Scope

**In scope (this Gate 1):**
1. Add `typecheck` script to `package.json` (precondition AC0a from S574 AG/MP convergent finding F4).
2. Author one new GitHub Actions workflow `.github/workflows/ci.yml` running on `pull_request` to `main`, with three required jobs: `typecheck`, `lint`, `build`.
3. Apply branch protection rules to `aidotmarket/ai-market-frontend` `main` via the GitHub Branches REST API, enforcing required status checks, no merge-on-pending, no merge-on-failing, and a documented admin-only emergency bypass.
4. Runbook addition documenting the protection rule + emergency bypass procedure with audit trail.

**Scope rationale.**
This Gate is intentionally single-repo because the worker queue scope is `ai-market-frontend`. The
root S574 incident happened in `ai-market-backend`, but this spec is the frontend slice of the
cross-repo enforcement pattern. Backend, ops, and runbooks each need their own bounded audit because
their existing workflows and repository settings differ.

**Implementation ownership boundary.**
The Worker can author and merge repository files through PR review. Applying branch protection to
`main` may require repository admin permission, so the post-merge protection step is explicitly
assigned to Max or Primary if the Worker token cannot perform it.

**Out of scope (defer to sibling BQs):**
- Backend repo (`ai-market-backend`) — sibling BQ at Gate 2 follow-on; backend already has `BuildQueueLifecycleGate` and other workflows that need dedicated audit per S574 MP cross-vote finding.
- Ops repo (`ops-ai-market`) — already has CI lint-gate workflow merged at PR #3 (S583); branch protection itself flagged as manual-followup-for-Max in advancement_log; sibling BQ should formalize that.
- Runbooks repo (`aidotmarket/runbooks`) — sibling BQ.
- Adding test runner / E2E tests — covered by `BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574` (queue position 3). Required check set in this Gate 1 deliberately excludes any test job until that BQ ships.

**Non-goals for this Gate.**
- Do not introduce Jest, Playwright, Vitest, Cypress, or a test runner placeholder.
- Do not change application code.
- Do not widen CI to backend API contract drift beyond the existing `build` behavior.
- Do not rely on voluntary merge discipline where GitHub can enforce the invariant.
- Do not require non-admin review approval until the solo-operator review model changes.

**Reserved future required checks.**
Two known S574 sibling BQs will add required CI contexts after this Gate ships. This Gate reserves
their names and requires a branch-protection update at the moment each sibling lands:
- `types-stale-check` — added by `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` when generated
  OpenAPI-derived types become enforceable. That BQ must update `required_status_checks.contexts`
  from `["typecheck", "lint", "build"]` to `["typecheck", "lint", "build",
  "types-stale-check"]` in the same merge/apply sequence that introduces the stale-types job.
- `e2e` — added by `BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574` when customer-journey E2E tests
  exist. That BQ must update `required_status_checks.contexts` to include `e2e` before the E2E
  workflow is treated as complete. Until then, no placeholder `e2e` job is added because a required
  context that never reports would block all merges.

## 3. Acceptance Criteria

**AC0a (precondition).** `package.json` gains a `typecheck` script: `"typecheck": "tsc --noEmit"`. No other script changes. Verified by `npm run typecheck` exiting 0 against current `main` HEAD.

**AC1.** A new file `.github/workflows/ci.yml` exists with these properties:
- Trigger: `on: pull_request: branches: [main]`, `on: push: branches: [main]`, and `on: workflow_dispatch` (push trigger keeps required checks current on `main`; manual dispatch supports admin re-runs without editing YAML).
- Three jobs, each on `ubuntu-latest`, each using `actions/checkout@v4` and `actions/setup-node@v4` with Node version pinned to `20`, verified against `nixpacks.toml` (`nixPkgs = ["nodejs_20"]`):
  - `typecheck`: `npm ci` then `npm run typecheck`.
  - `lint`: `npm ci` then `npm run lint`.
  - `build`: `npm ci` then `npm run build`.
- Job names exactly: `typecheck`, `lint`, `build` (these are the strings GitHub uses for required-status-check matching; any drift breaks AC3).
- Concurrency group keyed on `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` on PR runs only.
- Caching: `actions/setup-node` with `cache: 'npm'` and `cache-dependency-path: package-lock.json`.

**AC1 implementation details.**
Use one workflow named `CI` with separate jobs instead of one matrix job. This keeps required-check
context names stable and easy to bind in branch protection. The jobs may duplicate `npm ci`; this is
accepted for clarity and because GitHub job isolation means sharing `node_modules` would add more
complexity than it removes.

The context is intentionally named `typecheck`, not `type-check`, because it matches the existing
script name and avoids a future mismatch between `package.json`, workflow job ID, and branch
protection context.

**AC2.** The workflow runs successfully on a no-op PR opened against `main` (smoke test). Verified by opening a draft PR with a whitespace-only change to a markdown file post-merge and recording `gh pr checks <PR_NUMBER> --repo aidotmarket/ai-market-frontend --watch` output showing `typecheck`, `lint`, and `build` pass.

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
The `required_pull_request_reviews: null` decision is deliberate: S574's accepted solo-operator
policy uses required CI plus a soft self-review checklist instead of blocking on formal approval.
The branch-protection rule must not require signed commits in this Gate. Signed commits are deferred
because this BQ addresses CI completion before merge, while signed commits are a separate
supply-chain/authorship policy that needs its own repository-wide decision.

**AC3 expected post-apply shape.**
After the protection rule is applied, `gh api repos/aidotmarket/ai-market-frontend/branches/main/protection`
must return `required_status_checks.strict == true`, `required_status_checks.contexts` containing
exactly `typecheck`, `lint`, and `build`, `allow_force_pushes.enabled == false`, and
`allow_deletions.enabled == false`.

**Future protection expansion protocol.**
When `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` lands, the same PR or immediate post-merge apply
step must add the `types-stale-check` context and prove it with:
`gh api repos/aidotmarket/ai-market-frontend/branches/main/protection --jq '.required_status_checks.contexts'`.
When `BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574` lands, the same protocol must add `e2e`. A
sibling is not complete until its new check is both emitted by Actions and present in branch
protection readback.

**AC4.** Required-status-check completion is enforced before merge — neither pending nor failing checks allow the green merge button. Verified by opening a synthetic test PR that introduces a deliberate `tsc --noEmit` failure and committing either (a) `gh pr view <PR_NUMBER> --repo aidotmarket/ai-market-frontend --json mergeable,mergeStateStatus,statusCheckRollup` output showing `mergeStateStatus: BLOCKED`, or (b) a screenshot artifact path plus the failing check URL in the Gate 2 verification log.

**AC5.** Merge methods on the repo settings: squash and merge commit are both allowed; rebase merge is left at current setting (no change required). No bypass for non-admins. Verified with `gh api repos/aidotmarket/ai-market-frontend --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge}'`; PASS requires `allow_squash_merge == true`, `allow_merge_commit == true`, and no intentional change to the observed `allow_rebase_merge` value.

**AC6.** Emergency bypass procedure: admin (`max`) can force-merge via `gh pr merge --admin` per GitHub's documented admin override. Every admin override is recorded as an audit event in the allAI Event Ledger via a `ci_protection_override` event posted manually as part of the bypass procedure (runbook AC8 documents the exact `curl` and event payload).

**AC7.** Self-review checklist replaces approving-review requirement (per S574 MP solo-operator finding F-Q6 — `required_pull_request_reviews: null` in AC3 JSON honors this). Runbook documents the soft self-review checklist: (a) `gh pr diff` reviewed for unintended changes; (b) PR description references BQ ref; (c) all required checks green or admin-bypass justification captured.

**AC8.** Because `aidotmarket/runbooks` is out of scope for this Worker, this Gate commits the exact runbook section content into the Gate 2 verification log and files `BQ-RUNBOOK-CI-MERGE-GATE-BRANCH-PROTECTION-S574-FOLLOWUP` for materialization in the runbooks repo. The verification log section documents:
- The exact protection-rule JSON applied (AC3 verbatim).
- The `gh api PUT` invocation used to apply it (with `--input -` from a file for reproducibility).
- The emergency bypass procedure (`gh pr merge --admin` + manual audit-event POST).
- The self-review checklist (AC7).
- The synthetic-failure verification protocol (AC4).
- Spec-only deferred items: cannot land in this Gate (runbooks repo is out of scope per Section 2). Tracked as a Gate 2 deliverable to file as a sibling BQ (`BQ-RUNBOOK-CI-MERGE-GATE-BRANCH-PROTECTION-S574-FOLLOWUP`) at this BQ's Gate 2 entry.

**AC9.** Verification protocol (combined): a single Markdown verification log committed alongside this spec under `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` at Gate 2, capturing: (a) `gh api branches/main/protection` output post-apply; (b) AC2 smoke-test PR number + check results; (c) AC4 synthetic-failure PR number + `mergeStateStatus: BLOCKED` evidence.

**Gate 2 verification log template.**
The verification artifact must include these headings:
- `Repository and branch`
- `Workflow file evidence`
- `Branch protection apply command`
- `Branch protection readback`
- `No-op smoke PR`
- `Synthetic failing PR`
- `Emergency bypass drill status`
- `Self-review checklist`
- `Deferred sibling BQs`

Each heading must include either a command transcript, a PR URL, or an explicit `not run because`
statement with owner and follow-up.

**Acceptance verification matrix.**
| AC | PASS/FAIL evidence |
| --- | --- |
| AC0a | `npm run typecheck` exits 0 on the implementation PR. |
| AC1 | `test -f .github/workflows/ci.yml` plus YAML inspection showing `pull_request`, `push`, `workflow_dispatch`, Node `20`, and jobs `typecheck`, `lint`, `build`. |
| AC2 | `gh pr checks <NOOP_PR> --repo aidotmarket/ai-market-frontend --watch` shows all three required checks passing. |
| AC3 | `gh api repos/aidotmarket/ai-market-frontend/branches/main/protection --jq '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, reviews: .required_pull_request_reviews, force: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'` matches the spec. |
| AC4 | Synthetic failing PR evidence from `gh pr view <FAIL_PR> --repo aidotmarket/ai-market-frontend --json mergeable,mergeStateStatus,statusCheckRollup` or committed screenshot artifact shows merge blocked. |
| AC5 | `gh api repos/aidotmarket/ai-market-frontend --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge}'` shows squash and merge commit allowed. |
| AC6 | Verification log includes the exact `gh pr merge --admin` bypass command and allAI `ci_protection_override` event payload; no real override is required for PASS. |
| AC7 | Verification log includes completed self-review checklist items and PR description contains the BQ ref. |
| AC8 | Verification log includes the deferred runbook section content and sibling BQ filing evidence or explicit owner/date if filing is blocked. |
| AC9 | `test -f specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` and the artifact contains the required headings listed above. |

## 4. Implementation Plan (Gate 2 preview)

Single PR with:
1. `package.json` — add `typecheck` script (1 line).
2. `.github/workflows/ci.yml` — new file (≈40 lines).
3. After merge, apply branch protection via `gh api PUT` (admin-only, runs locally; not part of the merged PR).
4. Open AC2 smoke-test PR (whitespace markdown change) and AC4 synthetic-failure PR; close both as part of verification log.
5. File `BQ-RUNBOOK-CI-MERGE-GATE-BRANCH-PROTECTION-S574-FOLLOWUP` at Gate 2 entry to capture the runbook AC8 content (out-of-repo work).

**Detailed Gate 2 sequence.**
1. Start from `origin/main` and confirm no existing branch protection with:
   `gh api repos/aidotmarket/ai-market-frontend/branches/main/protection`.
2. Add the `typecheck` script and CI workflow.
3. Run `npm run typecheck`, `npm run lint`, and `npm run build` locally.
4. Open the implementation PR and wait for all three required jobs to pass.
5. Merge the implementation PR only after checks pass.
6. Apply branch protection to `main`.
7. Open a no-op draft PR to prove the required contexts appear and pass.
8. Open a synthetic failing PR to prove merge is blocked while `typecheck` fails.
9. Close the synthetic PR without merge and commit the verification log.
10. File sibling BQs for backend, ops, runbooks, and runbook materialization.
11. When the type-generation sibling lands, update branch protection to add `types-stale-check`.
12. When the E2E sibling lands, update branch protection to add `e2e`.

**File touch list (Gate 2):**
- `package.json` (1 line)
- `.github/workflows/ci.yml` (new file)
- `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` (new file, post-apply)

**Total LOC change estimate:** <60 lines spec-merged, plus the runbook content tracked separately.

**Protection payload file.**
Gate 2 should stage the JSON payload in a temporary local file or heredoc for application, but should
not commit repository secrets or token material. The committed verification log may include the
payload because it contains policy, not credentials.

## 5. Risks

**R1.** Node version drift between CI and Railway production. Railway uses `nixpacks.toml`; if its Node pin differs from CI's, false-pass risk. Mitigation: read `nixpacks.toml` at Gate 2 build time, pin CI to the same major version, document the dependency in runbook AC8.

**R2.** `npm ci` on every job triples install time. Mitigation: `actions/setup-node` `cache: 'npm'` plus `cache-dependency-path` (AC1) reduces this to a single warm cache after first run; jobs run in parallel so wall-clock is bounded by the slowest job (typically `build`).

**R3.** Lint baseline drift. `next lint` may currently fail on existing code if previously not enforced. Mitigation: at Gate 2, run `npm run lint` against current `main` HEAD; if it fails, file a sibling lint-cleanup BQ (precedent: `BQ-OPS-AI-MARKET-LINT-CLEANUP` PR #2 S582) and re-sequence this BQ behind it.

**R4.** Strict-mode checks block legitimate hot-fix merges during real customer incidents. Mitigation: AC6 admin emergency-bypass + audit-event protocol. Cost is one manual `gh pr merge --admin` step + one event-post curl per emergency, accepted.

**R5.** TypeScript version drift. `typescript: ~5.9.3` in devDependencies; `tsc --noEmit` against monorepo-style imports may surface errors that `next build` masks. Mitigation: at Gate 2, run `npm run typecheck` against current `main` HEAD before merging the workflow; if errors exist, file a sibling typecheck-cleanup BQ and re-sequence.

**R6.** Branch-protection JSON schema drift. GitHub occasionally evolves the protection-rule API. Mitigation: pin the `gh api` invocation to the documented v3 REST shape (AC3 JSON), and runbook AC8 captures the exact invocation for re-application.

**R7.** Required-check context mismatch. GitHub required status checks bind to emitted check-run
names. If job IDs or names drift, protection can require contexts that never report. Mitigation:
use job IDs exactly matching the required contexts and verify readback before considering Gate 2
complete.

**R8.** Workflow exists but branch protection not applied. A CI workflow alone does not prevent early
merge. Mitigation: Gate 2 is incomplete until AC3 readback proves protection is active on `main`.

**R9.** Admin bypass overuse. The emergency path is necessary but can recreate the discipline gap if
used casually. Mitigation: each override requires a ledger event and a PR comment or verification
log entry linking the customer-impact justification.

**R10.** Required checks become stale after `main` moves. Mitigation: `strict: true` requires the PR
head to be up to date with `main`; this is the specific protection against stale green checks.

## 6. Open Questions

**Q1.** Does the Worker have admin permission on `aidotmarket/ai-market-frontend` to call `PUT /repos/.../branches/main/protection`? If not, AC3 is a Primary-or-Max-only step. **Recommendation:** Worker authors and ships the workflow + `typecheck` script via PR; Max applies branch protection via the documented runbook command post-merge. This split mirrors the precedent set by `BQ-OPS-AI-MARKET-CI-LINT-GATE` PR #3 advancement-log addendum (`manual_followup_for_max`).

**Q2.** Should `push: branches: [main]` trigger be included or only `pull_request`? Including push keeps `main`-itself check status fresh which `strict: true` requires. **Recommendation:** include both (AC1 reflects this).

**Q3.** Should the workflow also run on `workflow_dispatch` for manual re-runs? **Resolved:** yes. AC1 now requires `workflow_dispatch`.

**Q4.** Required-status-check name binding: GitHub matches by job name string. If the workflow file uses `name: typecheck` at the workflow level vs at the job level, the displayed check name differs. **Resolution in spec:** AC1 fixes job names exactly as `typecheck`, `lint`, `build`. AC3 contexts list matches. Confirmed against GitHub Actions docs at spec authoring.

**Q5.** Is `concurrency: cancel-in-progress: true` correct for PR runs but wrong for `main` push runs? On `main` push, cancelling an in-flight run could leave required-check status stale and block the next merge. **Resolution:** AC1 specifies cancel-in-progress only for PR runs (conditional on `github.event_name == 'pull_request'`); push runs to `main` are not cancelled.

**Q6.** Should admin bypass be disabled by setting `enforce_admins: true`? **Resolution:** no for this
Gate. The accepted policy is admin-only emergency override with audit event. This keeps production
incident response possible while removing bypass for non-admin merges.

**Q7.** Should branch protection require signed commits? **Resolved for this Gate:** not required.
The original Gate scope is CI completion before merge. Signed commits are a separate
supply-chain/authorship policy and are deferred to a future repository-wide decision instead of
being silently added here.

## 7. Sequence & Dependencies

**Unblocks:** `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` AC3 (CI staleness check requires PR-time CI on frontend repo, currently absent).

**Sequence-locked behind:** none. This BQ is independently shippable.

**Depends on existing repo facts:**
- `package-lock.json` exists, so `npm ci` is the correct install command.
- `nixpacks.toml` currently pins Railway to `nodejs_20`.
- `package.json` already has `lint` and `build`; `typecheck` is the only missing script.
- `.github/workflows/deploy-receipt.yml` is post-merge evidence only and cannot satisfy PR gating.

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

**Worker may still verify.**
If the Worker token lacks admin rights, the Worker still records the exact failing command and the
expected Max/Primary follow-up. Lack of permission is not a reason to omit the command, payload, or
readback assertion from the verification artifact.

## 9. Verdict-enum reminder for reviewers

DS reviewers: please return verdict from the explicit 6-value enum: `APPROVE | APPROVE_WITH_NITS | APPROVE_WITH_MANDATES | REVISE | REQUEST_CHANGES | REJECT`. (Filed S587 as `BQ-COUNCIL-DS-VERDICT-ENUM-PROMPT-TEMPLATE-DRIFT-S587` — empty-string verdict on REVISE/REQUEST_CHANGES is the regression to work around.)
