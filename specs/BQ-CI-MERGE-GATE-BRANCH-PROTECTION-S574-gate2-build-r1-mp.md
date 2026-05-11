# R1 MP Review - BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 Gate 2 Build Spec

Verdict: REQUEST_CHANGES_HIGH

Reviewed target: PR #7 branch `spec/bq-ci-merge-gate-branch-protection-s574-gate2-build` at `9c1f893e112bc60f61839654be270ffc9be0b0dc`.

Review diff basis: `git diff 9ace4a4...9c1f893 -- specs/`.

## Findings

1. HIGH - `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-gate2-build.md:198` - Branch protection does not require PRs; the payload explicitly sets `required_pull_request_reviews: null`, and the readback at line 217 expects `reviews: null`, which leaves the "require PR" acceptance surface uncovered. Suggested fix: define the GitHub rule shape that requires pull requests while preserving the solo-operator "zero required approvals" policy if that is still desired, then add readback assertions proving PRs are required, required checks are enabled, and `strict` is true.

2. HIGH - `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-gate2-build.md:221` - Test plan covers one failing check and all-passing checks, but it never exercises the "no checks emitted / required context absent" scenario requested for this BQ. Suggested fix: add a concrete AC and executable procedure that opens a PR from a branch where the required contexts do not report, or otherwise creates an auditable absent-context condition, and records GitHub blocking merge because required checks are missing.

3. HIGH - `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-gate2-build.md:186` - The spec has an emergency bypass path, but no rollback procedure for accidental bad branch-protection rules, required-context drift, or an emergency where the correct response is temporary rule relaxation rather than `gh pr merge --admin`. Suggested fix: add a rollback AC/runbook section with exact read-current-state, save-backup, restore/reapply, and audit steps; distinguish bad-rule rollback from legitimate emergency merge bypass and define who can authorize each.

4. MED - `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-gate2-build.md:57` - The AC list is executable in many places, but it does not include an explicit current CI workflow inventory AC even though this BQ depends on knowing which workflows/check names already exist. Suggested fix: add a baseline inventory step that records `.github/workflows/deploy-receipt.yml`, its workflow name `Deploy Receipt`, job ID `verify-deploy`, trigger `push` to `main`, and the absence of existing PR-time required checks before adding `ci.yml`.

5. LOW - `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-gate2-build.md:219` - The Worker-without-admin path says AC-B7 can be "PASS-pending", which weakens the otherwise crisp PASS semantics for the core enforcement step. Suggested fix: use a separate blocked/hand-off status in the verification log and keep AC-B7 failing/incomplete until an admin actually applies and reads back the rule.

## Anchor Verification

Repo-state claims checked against the branch at `9c1f893`:

- Actual workflow inventory: only `.github/workflows/deploy-receipt.yml` exists at this SHA.
- `.github/workflows/deploy-receipt.yml:1` declares workflow name `Deploy Receipt`.
- `.github/workflows/deploy-receipt.yml:3`-`5` runs only on `push` to `main`.
- `.github/workflows/deploy-receipt.yml:12`-`14` has job ID `verify-deploy`.
- `package.json:6`-`11` has scripts `dev`, `build`, `start`, `lint`; no `typecheck`.
- `nixpacks.toml:1`-`5` pins `nodejs_20` and runs `npm ci`, `npm run build`.
- `tsconfig.json:22` includes `**/*.ts` and `**/*.tsx`, so the synthetic `_synthetic/synthetic.ts` type error should be picked up by `tsc --noEmit`.

No direct drift found in the spec's concrete claims about existing package scripts, Node 20, or the planned `typecheck`/`lint`/`build` job names. The problem is missing inventory coverage in the Gate 2 acceptance criteria, not a false statement about the files.

## Sibling BQ Check

The four declared sibling BQs at lines 261-264 and entity keys at lines 433-436 match Gate 1 lines 315-319:

- Backend branch-protection follow-up.
- Ops branch-protection follow-up.
- Runbooks repo branch-protection follow-up.
- Runbook content materialization follow-up.

The boundary is mostly clean: this BQ owns frontend CI and frontend branch protection; siblings own backend, ops, runbooks, runbook materialization, future `types-stale-check`, and future `e2e` expansion. No mandate here.

## Test Plan Executability

The operator can execute the happy path and synthetic failing path from the spec text. The missing no-check/absent-context scenario prevents full acceptance against the requested three-scenario test matrix.

## Open Questions Disposition

- Q-B1: Material design issue, acceptable parking-lot only if the spec adds an explicit wait/readback step for the post-merge `main` run before applying protection. Current sequence gestures at this but should be more concrete.
- Q-B2: Nit; squash is a reasonable fixed choice.
- Q-B3: Nit; typecheck failure is the right synthetic failure.
- Q-B4: Material but resolved acceptably; cleanup BQ keeps this branch-protection BQ scoped.
- Q-B5: Material and acceptable for Gate 3; do not auto-retry drift without Primary review.

## Summary

The spec is close on workflow creation, named required checks, sibling boundaries, and concrete command shape. It should not advance until it adds PR-required protection semantics, a no-checks blocking test, and a real rollback procedure.
