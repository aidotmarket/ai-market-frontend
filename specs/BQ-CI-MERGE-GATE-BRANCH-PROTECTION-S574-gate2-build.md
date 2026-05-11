# BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 — Gate 2 Build Spec v1

**BQ ref:** `build:bq-ci-merge-gate-branch-protection-s574`
**Pillar:** Council/Koskadeux orchestration
**Priority:** P1
**Predecessor:** Gate 1 spec v3 at `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574.md` (merge SHA `9ace4a4`, PR #5, S592.W; Gate 1 status `COMPLETE` per BQ entity v4)
**Authored:** S599.W (Worker)
**Repo scope:** `aidotmarket/ai-market-frontend` only

---

## §1 Purpose

Convert Gate 1 v3's ten acceptance criteria (AC0a, AC1–AC9) into an executable build plan with discrete commits, measurable verification predicates, and a recorded test protocol. Gate 1 captures intent; Gate 2 produces the bytes.

Gate 1 mapping (do not re-read for build):

- AC0a → `typecheck` script (1-line edit in `package.json`)
- AC1 → `.github/workflows/ci.yml` (3 jobs: typecheck, lint, build)
- AC2 → smoke-test that the workflow runs and emits contexts
- AC3 → branch-protection JSON applied via `gh api PUT`
- AC4 → synthetic failing PR proving merge is blocked
- AC5 → repo merge-method settings unchanged
- AC6 → emergency bypass + audit-event protocol (runbook content)
- AC7 → self-review checklist (runbook content)
- AC8 → runbook materialization deferred to sibling BQ
- AC9 → verification log `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md`

---

## §2 Build deliverables

Three commits across two PRs, one admin step, four sibling BQ filings.

**Implementation PR (PR-I):**

1. `package.json` — add `"typecheck": "tsc --noEmit"` script. 1 line.
2. `.github/workflows/ci.yml` — new file (~45 lines YAML).

**Admin step (post-merge, no commit):**

3. `gh api PUT repos/aidotmarket/ai-market-frontend/branches/main/protection` with the AC3 JSON. Returns 200 with the applied rule.

**Verification PR (PR-V):**

4. `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` — new file (~120 lines markdown).

**Living State writes:**

5. File 4 sibling BQs per Gate 1 §7 list (templates in §6 below).
6. Patch this BQ's `body.gate2` to `AUTHORED` then `COMPLETE` per build phase.

Total LOC change estimate: <180 lines across 3 files.

---

## §3 Build-level acceptance criteria

### AC-B1 — Pre-build baseline check

Before opening PR-I, run all three workflow commands against current `origin/main` HEAD on local Node 20:

- `npm ci`
- `npm run lint`
- `npm run build`
- After adding the typecheck script locally: `npm run typecheck`

**PASS condition:** all four exit 0.

**FAIL handling:**

- If `lint` fails → file `BQ-FRONTEND-LINT-BASELINE-CLEANUP-S574-FOLLOWUP` and sequence Gate 2 behind it (Gate 1 R3).
- If `typecheck` fails → file `BQ-FRONTEND-TYPECHECK-BASELINE-CLEANUP-S574-FOLLOWUP` and sequence Gate 2 behind it (Gate 1 R5).
- If either filed, halt Gate 2 build; report to Primary.

**Verifiable artifact:** baseline check transcript pasted into verification log §Baseline check.

### AC-B2 — `package.json` edit

Add exactly one entry to `package.json` `scripts` block: `"typecheck": "tsc --noEmit"`.

**PASS condition:** `git diff --stat origin/main -- package.json` reports `1 file changed, 1 insertion(+)`.

**Smoke check:** `npm run typecheck` exits 0 on the implementation branch.

### AC-B3 — Workflow file `.github/workflows/ci.yml`

Author a new workflow with this exact shape (no drift — required-check binding is by job-name string identity):

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: package-lock.json
      - run: npm ci
      - run: npm run typecheck

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: package-lock.json
      - run: npm ci
      - run: npm run lint

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: package-lock.json
      - run: npm ci
      - run: npm run build
```

**PASS condition:**

- YAML parses: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` exits 0.
- Job IDs exactly `typecheck`, `lint`, `build` (verified: `grep -c '^  typecheck:$' .github/workflows/ci.yml` = 1 and same for `lint` and `build`).
- Node version `'20'` (quoted string; matches `nixpacks.toml` `nixPkgs = ["nodejs_20"]`).
- `cancel-in-progress` is the conditional expression — PR runs cancel, push runs to `main` do not (Gate 1 Q5).
- Three triggers present: `pull_request`, `push`, `workflow_dispatch`.

### AC-B4 — Implementation PR opened

Open a single PR from `build/bq-ci-merge-gate-branch-protection-s574-gate2` against `aidotmarket/ai-market-frontend:main` carrying AC-B2 + AC-B3.

**PR title:** `[Worker] BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 Gate 2 build v1`

**PR body MUST include:**

- `BQ ref: build:bq-ci-merge-gate-branch-protection-s574`
- Reference to Gate 1 spec at `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574.md@9ace4a4`
- Reference to this Gate 2 spec (PR-S URL)
- `Worker instance. Primary review pending — do not merge.`

**PASS condition:** PR URL captured in verification log.

### AC-B5 — Implementation PR CI green

After PR-I is open, the three new required jobs (`typecheck`, `lint`, `build`) all complete with status `success` on PR head.

**PASS condition:**

```bash
gh pr checks <PR-I> --repo aidotmarket/ai-market-frontend --json name,conclusion \
  | python3 -c "import json,sys; d=json.load(sys.stdin); \
    n={c['name']:c['conclusion'] for c in d}; \
    assert n.get('typecheck')=='success' and n.get('lint')=='success' and n.get('build')=='success', n"
```

Exit code 0. This doubles as the Gate 1 AC2 smoke test: the workflow itself runs and the three contexts emit check-runs.

### AC-B6 — Implementation PR merged

Merge PR-I via squash merge once AC-B5 passes (Gate 1 Q-B2 resolution). Record merge SHA in verification log.

**PASS condition:** `gh pr view <PR-I> --json mergeCommit --jq '.mergeCommit.oid'` returns the commit SHA present on `main`.

### AC-B7 — Branch protection applied

Run the exact `gh api PUT` invocation with Gate 1 AC3 JSON staged via heredoc (no secrets, just policy). **Owner: Max or Primary** (Worker token may lack admin per Gate 1 Q1).

```bash
cat > /tmp/protection.json <<'EOF'
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
EOF
gh api -X PUT repos/aidotmarket/ai-market-frontend/branches/main/protection \
  --input /tmp/protection.json
```

**PASS condition (readback):**

```bash
gh api repos/aidotmarket/ai-market-frontend/branches/main/protection \
  --jq '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, force: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled, reviews: .required_pull_request_reviews}'
```

Output must show: `strict: true`; `contexts` containing exactly the set `{"typecheck","lint","build"}` (order-insensitive); `force: false`; `deletions: false`; `reviews: null`.

**Worker-without-admin path:** if Worker token returns 403, Worker commits `protection.json` artifact + the `gh api` command into the verification log and assigns Max as the follow-up actor. AC-B7 PASS-pending until Max executes.

### AC-B8 — Synthetic failing PR

After AC-B7 PASS, open a synthetic failing PR proving merge is blocked when CI fails (Gate 1 AC4).

Procedure:

1. From `main`, create branch `synthetic/ci-merge-gate-block-test`.
2. Add one line to a temp `*.ts` or `*.tsx` file that breaks `tsc --noEmit` — e.g., `export const __syn: number = "broken";`.
3. Commit + push + open **draft** PR (NOT ready for review). Label `do-not-merge` if available.
4. Wait for `typecheck` check to report `failure`.
5. Capture `gh pr view <PR-S-FAIL> --json mergeable,mergeStateStatus,statusCheckRollup`.

**PASS condition:** `mergeStateStatus == "BLOCKED"` AND `statusCheckRollup` shows `typecheck` with conclusion `FAILURE`.

**Cleanup:** close PR without merge; delete branch.

### AC-B9 — Verification log

Author `specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` with the headings mandated by Gate 1 AC9:

- `## Repository and branch`
- `## Workflow file evidence`
- `## Branch protection apply command`
- `## Branch protection readback`
- `## No-op smoke PR` (or note that AC-B5 doubles as smoke)
- `## Synthetic failing PR`
- `## Emergency bypass drill status`
- `## Self-review checklist`
- `## Deferred sibling BQs`

Each section captures either a command transcript, a PR URL, or `not run because <reason>; owner: <name>; follow-up: <bq-code>`.

Commit via PR-V on branch `verify/bq-ci-merge-gate-branch-protection-s574-gate2`. Squash-merge.

**PASS condition:** `test -f specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md` on `main` AND a grep over the 9 headings exits 0.

### AC-B10 — Sibling BQs filed

File the four sibling BQs identified in Gate 1 §7:

1. `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-BACKEND-S574-FOLLOWUP`
2. `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-OPS-S574-FOLLOWUP`
3. `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-RUNBOOKS-S574-FOLLOWUP`
4. `BQ-RUNBOOK-CI-MERGE-GATE-BRANCH-PROTECTION-S574-FOLLOWUP`

Each filed as `kind=build` Living State entity with: `summary`, `body.summary`, `body.priority="P2"` (deferred follow-ups), `body.parent_bq="BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574"`, `body.status="planned"`, `body.pillar="Council/Koskadeux orchestration"`.

**PASS condition:** `state_request action=get` on each of the four entity keys returns `version >= 1`.

**Caveat (Gate 1 R6 + bq_entity_hook phantom):** when filing, watch for phantom suffix-truncated siblings per `BQ-BQ-ENTITY-HOOK-PHANTOM-SUFFIX-TRUNCATED-SIBLINGS-S587`. If phantoms appear, document them in verification log §Deferred sibling BQs as cleanup deltas (do not delete in this BQ).

---

## §4 Build sequence (executable plan)

### Step 1 — Baseline check (AC-B1)

```bash
cd /Users/max/Projects/ai-market/ai-market-frontend
git fetch origin && git checkout main && git pull origin main --quiet
npm ci
npm run lint        # expect: exit 0
npm run build       # expect: exit 0
# Add typecheck script temporarily for the check:
node -e "const f=require('./package.json'); f.scripts.typecheck='tsc --noEmit'; \
  require('fs').writeFileSync('package.json', JSON.stringify(f, null, 2) + '\n')"
npm run typecheck   # expect: exit 0
git checkout -- package.json
```

If any step fails → file the relevant cleanup sibling BQ, halt Gate 2.

### Step 2 — Implementation PR (AC-B2, AC-B3, AC-B4)

```bash
git checkout -b build/bq-ci-merge-gate-branch-protection-s574-gate2
# Add typecheck script (1-line edit):
node -e "const f=require('./package.json'); f.scripts.typecheck='tsc --noEmit'; \
  require('fs').writeFileSync('package.json', JSON.stringify(f, null, 2) + '\n')"
# Author ci.yml from §3 AC-B3 template
mkdir -p .github/workflows
# (write the workflow content from AC-B3)
git add package.json .github/workflows/ci.yml
git commit -m "BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574: add CI workflow + typecheck script (Gate 2 build)"
git push -u origin build/bq-ci-merge-gate-branch-protection-s574-gate2
gh pr create --base main --head build/bq-ci-merge-gate-branch-protection-s574-gate2 \
  --title "[Worker] BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 Gate 2 build v1" \
  --body "$(cat <<'PRBODY'
BQ ref: build:bq-ci-merge-gate-branch-protection-s574

Gate 2 build for the CI merge-gate branch-protection pattern on ai-market-frontend.

Predecessor: specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574.md @ 9ace4a4 (Gate 1 v3).
Gate 2 spec: specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-gate2-build.md @ <PR-S URL>.

Adds:
- package.json: typecheck script (tsc --noEmit)
- .github/workflows/ci.yml: 3 jobs (typecheck, lint, build) on pull_request + push to main

After merge, admin applies branch protection per Gate 2 AC-B7.

Worker instance. Primary review pending — do not merge.
PRBODY
)"
```

### Step 3 — Wait for AC-B5 (CI green on PR-I)

```bash
gh pr checks <PR-I> --repo aidotmarket/ai-market-frontend --watch
# Run the assertion in AC-B5 PASS condition.
```

### Step 4 — Merge PR-I (AC-B6)

After Primary approves the implementation PR:

```bash
gh pr merge <PR-I> --squash --delete-branch
```

Record merge SHA.

### Step 5 — Apply branch protection (AC-B7)

Admin step (Max or Primary). Worker stages the JSON file + `gh api PUT` command in the verification log; the actor with admin runs it. Confirmation via readback in AC-B7.

### Step 6 — Synthetic failing PR (AC-B8)

```bash
git checkout main && git pull origin main --quiet
git checkout -b synthetic/ci-merge-gate-block-test
mkdir -p _synthetic
echo "export const __syn: number = 'broken';" > _synthetic/synthetic.ts
git add _synthetic/synthetic.ts
git commit -m "synthetic: deliberate typecheck failure for AC-B8 verification (DO NOT MERGE)"
git push -u origin synthetic/ci-merge-gate-block-test
gh pr create --draft --base main --head synthetic/ci-merge-gate-block-test \
  --title "[SYNTHETIC] CI merge-gate block test (AC-B8 — DO NOT MERGE)" \
  --body "Synthetic failing PR for BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 AC-B8 verification. DO NOT MERGE."
sleep 60
gh pr view <PR-S-FAIL> --json mergeable,mergeStateStatus,statusCheckRollup
gh pr close <PR-S-FAIL> --delete-branch
```

Capture output → AC-B8 evidence in verification log.

### Step 7 — Verification log (AC-B9)

```bash
git checkout main && git pull origin main --quiet
git checkout -b verify/bq-ci-merge-gate-branch-protection-s574-gate2
# Author specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md with all 9 sections
git add specs/BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574-VERIFICATION.md
git commit -m "verify: BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 Gate 2 build"
git push -u origin verify/bq-ci-merge-gate-branch-protection-s574-gate2
gh pr create --base main --head verify/bq-ci-merge-gate-branch-protection-s574-gate2 \
  --title "[Worker] BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 Gate 2 verification log" \
  --body "Verification artifact for Gate 2 build. Worker instance. Primary review pending."
# After review + merge:
gh pr merge <PR-V> --squash --delete-branch
```

### Step 8 — Sibling BQ filings (AC-B10)

Worker calls `state_request action=put` four times with the §6 entity templates.

### Step 9 — BQ entity close patch

Worker patches `build:bq-ci-merge-gate-branch-protection-s574` body to set `gate2.status=COMPLETE` with `merge_sha`, `pr_url`, `verification_pr_url`, `sibling_bqs_filed[]`. Mirrors the `body.gate1` shape from entity v4.

---

## §5 Risks (build-specific, additive to Gate 1 R1–R10)

| # | Risk | Mitigation |
|---|------|-----------|
| **RB1** | Lint baseline fails against current `main` → AC-B5 fails on PR-I | AC-B1 baseline check catches before PR-I opens. File `BQ-FRONTEND-LINT-BASELINE-CLEANUP-S574-FOLLOWUP` and halt Gate 2. |
| **RB2** | Typecheck baseline fails against current `main` → AC-B5 fails on PR-I | Same as RB1 with `BQ-FRONTEND-TYPECHECK-BASELINE-CLEANUP-S574-FOLLOWUP`. |
| **RB3** | Worker token lacks admin → AC-B7 cannot run | AC-B7 assigns Max/Primary as fallback. Worker stages payload + command, records hand-off in verification log, marks AC-B7 PASS-pending. |
| **RB4** | `actions/setup-node` cache miss on first `npm ci` slows PR-I run | Accept; first run only. Cache key tied to `package-lock.json` hash. |
| **RB5** | Required-check contexts not yet registered when AC-B7 applies → `gh api PUT` succeeds but the required-contexts list pretends to require checks that have never run | Sequence enforces: AC-B5 (CI green on PR-I) runs the workflow so contexts exist on the PR; AC-B6 merge triggers a push-run on `main` registering contexts at the branch level; only THEN AC-B7. Verify on readback that GitHub recognizes the three contexts. |
| **RB6** | `bq_entity_hook` phantom siblings on AC-B10 BQ filings (known S587 issue) | Watch for suffix-truncated phantoms; document in verification log §Deferred sibling BQs as cleanup deltas. |
| **RB7** | Synthetic failing PR (AC-B8) accidentally lands if AC-B7 not applied | Explicitly draft-only; "DO NOT MERGE" in title + body; close immediately after capturing evidence. |
| **RB8** | `next lint` warning-vs-error semantics drift — lint job passes locally but fails in CI on stricter defaults | AC-B1 runs `npm run lint` with same Node version (`20`) and same `npm ci` install as CI. Mismatch surfaces in baseline check, not in PR-I. |
| **RB9** | Branch-protection rule applied without `restrictions: null` could silently block all pushes | AC3 JSON in Gate 1 sets `restrictions: null` explicitly; AC-B7 readback asserts no unexpected `restrictions` block. |

---

## §6 Sibling BQ filing templates (AC-B10)

Each entity created via `state_request action=put` with the following shape, varying `key`, `summary`, and `body.summary` per BQ:

```json
{
  "key": "build:bq-ci-merge-gate-branch-protection-backend-s574-followup",
  "kind": "build",
  "summary": "Apply CI merge-gate branch-protection pattern to aidotmarket/ai-market-backend (sibling of BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574)",
  "body": {
    "summary": "Apply the Gate 1 v3 pattern from BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 to ai-market-backend. Audit existing workflows (BuildQueueLifecycleGate plus others) for required-job correctness per S574 MP cross-vote finding F4 — newly added tests in PRs must be included in required jobs (the PR #56 incident exposed this gap).",
    "priority": "P2",
    "parent_bq": "BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574",
    "status": "planned",
    "pillar": "Council/Koskadeux orchestration"
  },
  "updated_by": "vulcan",
  "source_ref": "S599.W"
}
```

The four entity keys to file:

1. `build:bq-ci-merge-gate-branch-protection-backend-s574-followup` — backend repo
2. `build:bq-ci-merge-gate-branch-protection-ops-s574-followup` — ops repo (formalizes the existing Max manual-followup from BQ-OPS-AI-MARKET-CI-LINT-GATE PR #3 advancement log)
3. `build:bq-ci-merge-gate-branch-protection-runbooks-s574-followup` — runbooks repo
4. `build:bq-runbook-ci-merge-gate-branch-protection-s574-followup` — captures Gate 1 AC8 runbook section content in `aidotmarket/runbooks` (different surface from #3)

---

## §7 Open questions (build phase resolves)

| # | Question | Suggested resolution |
|---|----------|---------------------|
| **Q-B1** | Does GitHub re-emit `typecheck`/`lint`/`build` contexts after merging the workflow, or only on subsequent PRs? | The `push: branches: [main]` trigger ensures one run on `main` post-merge, registering contexts at branch level. Sequence in §4 enforces wait before AC-B7. |
| **Q-B2** | Squash vs merge-commit for PR-I? | Squash. Spec PRs and small-surface workflow adds are cleanest as single squash commits. AC-B6 fixes squash. |
| **Q-B3** | Synthetic failing PR (AC-B8): introduce typecheck error or lint error? | Typecheck — single-line change is sufficient and matches Gate 1 AC4 wording. Lint errors are easier to land cleanly by accident; typecheck gives clearer evidence. |
| **Q-B4** | If lint baseline (AC-B1) fails by ≤3 issues, fix-and-ship in-line vs file sibling cleanup? | File sibling cleanup. Keep Gate 2 scope clean; lint fixes blur scope and complicate Council review. |
| **Q-B5** | Should AC-B7 be retried automatically if readback shows context drift? | No. Treat readback mismatch as a fail and surface to Primary; do not silently re-apply. Drift indicates either a GitHub API change or an unexpected merge race; investigate before re-running. |

---

## §8 Sequence and dependencies

**Sequence-locked behind:** none. Gate 1 already merged at `9ace4a4`.

**Unblocks (per Gate 1 §7):**

- `BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574` AC3 (CI staleness check requires PR-time CI)
- `BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574` Gate 2 build (requires PR-time CI gating)

**Sibling BQs filed at Gate 2 entry (AC-B10):** four BQs per §6.

**Future required-check expansion:** Gate 1 §2 reserves `types-stale-check` and `e2e`. Each sibling BQ that introduces a new check MUST update `required_status_checks.contexts` in its own merge sequence (Gate 1 §3 AC3 "Future protection expansion protocol"). Out of scope for this Gate.

---

## §9 Out of scope for Gate 2

- Backend, ops, runbooks repo branch protection (sibling BQs per AC-B10).
- Adding test runners (Jest, Playwright, Vitest) — Gate 1 §2 Non-goals.
- Lint or typecheck baseline cleanup — only via sibling BQs if AC-B1 surfaces issues.
- Materializing the runbook section in `aidotmarket/runbooks` — sibling BQ #4.
- Required-check expansion for `types-stale-check` / `e2e` — owned by those siblings per Gate 1.
- Signed-commit policy (Gate 1 Q7: deferred).

---

## §10 Changelog

- **v1 (S599.W, 2026-05-11):** Initial Gate 2 build spec. Ten build-level ACs (AC-B1 through AC-B10), 9-step execution plan, 9 build-phase risks (RB1–RB9), 5 open questions, sibling BQ filing templates. Predecessor: Gate 1 spec v3 at SHA `9ace4a4`.

---

**End of Gate 2 Build Spec v1.**
