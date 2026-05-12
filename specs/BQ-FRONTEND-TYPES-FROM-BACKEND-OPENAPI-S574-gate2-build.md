# BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574 — Gate 2 Build Spec

**Predecessor pin:** Gate 1 v3 at PR #4 squash **1f3cd09b** on `aidotmarket/ai-market-frontend` (S586 R2 dual-APPROVE clean: MP APPROVE_WITH_NITS task 80865dd2 + AG APPROVE clean task 42e7a045).

**Repo:** `aidotmarket/ai-market-frontend` (single-repo).

**Pillar:** ai.market product surface.

**Authored by:** Vulcan-Worker S614.W (sandbox-no-read posture; builder reconciliation required — see §7).

**Target branch:** `spec/bq-frontend-types-from-backend-openapi-s574-gate2-build` (Gate 1 branch deleted post-merge per S613-Primary verification at 16:18Z).

---

## §1 Scope

Gate 2 build spec for the auto-generated frontend types contract from Gate 1 v3. Eliminates S574-class type-drift by replacing hand-maintained `types/index.ts` mirrors with codegen output from the backend's OpenAPI spec at `/openapi.json`.

Six chunks, 13 AC-Bs, sequenced in safe-rollback order: install tooling → regen artifact → migrate consumers → enforce drift gate → validate against known cases → runbook.

## §2 Design seed (Gate 1 + Vulcan-validated R2 folds)

Gate 1 v3 locks four design decisions worth surfacing here:

1. **Codegen tool:** `openapi-typescript` (MP Q1 disposition: "right fit; no existing codegen tooling found"). Other options (orval, swagger-typescript-api) rejected as over-large surface for this BQ's types-only goal.
2. **Canonical OpenAPI source:** `https://api.ai.market/openapi.json` (production-fallback-until-staging-exists per `drafted_r2_fold_logic_s585.fold_1`). CI pins to production URL; localhost override permitted for dev. Forbid frontend-PR against unmerged-backend-PR.
3. **AC4 scope:** Migrate all hand-maintained backend-mirror types from `types/index.ts`; UI/component-prop types stay (per `drafted_r2_fold_logic_s585.fold_2`).
4. **AC5 drift cases:** Four known cases including `BuildQueueDetail.decisions_locked` dict-shape (per `drafted_r2_fold_logic_s585.fold_3` — the AC5d addition).

## §3 Build chunks

### Chunk 1 — Tooling install + regen script + README

Establishes the codegen baseline.

- **AC-B1:** Add `openapi-typescript` as a `devDependency` in `package.json` at a pinned major version (`^7.x` recommended; builder verifies current stable). Pin documented in §6 runbook. Lockfile updated.
- **AC-B2:** Add npm script `generate-types` to `package.json`. Script fetches `${OPENAPI_URL:-https://api.ai.market/openapi.json}` and emits `types/api-generated.ts`. Localhost override via `OPENAPI_URL=http://localhost:8000/openapi.json npm run generate-types`.
- **AC-B3:** README section "Type generation" documents: regen workflow, canonical URL policy, localhost override, version-pin location, and how to handle a breaking backend schema change (cross-link to §6 runbook).

### Chunk 2 — Initial codegen artifact

Commits the first generated output so the rest of the migration can compile against it.

- **AC-B4:** Run `npm run generate-types` against production canonical URL; commit `types/api-generated.ts` at PR-time snapshot. File header carries an auto-generation banner with source URL and `openapi-typescript` version. File must compile under repo's existing `tsconfig.json` (no `strict` regressions, no new TS errors).

### Chunk 3 — Migrate backend-mirror types

Wires the generated module into existing code paths.

- **AC-B5:** Inventory `types/index.ts`. For each declared type, classify as: (a) backend-mirror (replicates a Pydantic schema name 1:1), (b) UI-state/component-prop (frontend-only construct), or (c) hybrid (backend-mirror with frontend augmentation). All (a) types replaced with re-exports from `api-generated.ts`; all (b) types remain unchanged; all (c) types refactored to compose: `type Foo = components['schemas']['FooBase'] & { uiOnly: ... }`. Migration decisions logged inline in PR description.

### Chunk 4 — CI staleness gate

The structural enforcement. Without this, codegen is discipline-enforced and the BQ doesn't earn its keep.

- **AC-B10:** Add `.github/workflows/types-staleness.yml` (or extend existing CI workflow) with a job that: (1) checks out PR branch, (2) runs `npm run generate-types` against the canonical URL, (3) diffs result against committed `types/api-generated.ts`, (4) fails the PR if diff is non-empty. Job runs on every PR touching `types/`, `package.json`, or `package-lock.json`. Job pins to production URL — no localhost override in CI.
- **AC-B11:** CI failure message instructs the contributor: "Run `npm run generate-types` locally, commit the result. If the diff includes backend changes, verify the backend PR is merged to main before rerunning."

### Chunk 5 — Drift case validation tests

The four known S574 drift cases get pinned type-assert tests so future regressions surface immediately.

- **AC-B6:** Type-assert test that `DataRequestUrgency` enum from `api-generated.ts` includes `'normal'` (not `'medium'`). Implementation pattern: `const _check: DataRequestUrgency = 'normal'; // @ts-expect-error const _bad: DataRequestUrgency = 'medium';`
- **AC-B7:** Type-assert test that `CreateDataRequestPayload.format_preferences` is `string[]` (not `string`). Build fails if shape regresses to scalar.
- **AC-B8:** Type-assert test that `UserResponse.role` includes `'pending'` (the S574 UserRole enum drift case that motivated this BQ).
- **AC-B9:** Type-assert test that `BuildQueueDetail.decisions_locked` is the dict shape from `ai-market-backend/app/schemas/bq_lifecycle.py:54` (the AC5d addition; the 4th S574 drift case).

Tests live in a single file under existing test convention (builder verifies path — `__tests__/types-drift.test.ts` if Vitest/Jest, or co-located `types/api-generated.drift.ts` for pure tsc-time assertion). Pure type-level — no runtime overhead, no test-runner change required.

### Chunk 6 — Runbook + breaking-change playbook

Operational documentation so the next breaking-schema-change doesn't trigger BQ-class repeat.

- **AC-B12:** `specs/openapi-codegen-runbook.md` per repo convention (MP Q4 disposition). Sections: (1) regen workflow happy path, (2) version-pin policy + when to bump, (3) breaking-schema-change procedure — backend merges first, deploys, frontend regen + PR follows, (4) CI staleness gate operations + how to interpret failure messages, (5) production-canonical-URL rationale + staging-fallback when staging exists, (6) cross-link to BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 once that lands.
- **AC-B13:** Out-of-scope declaration: AC8 (tests-as-precondition) from Gate 1 is sequence-locked behind BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574 (E2E coverage of `/requests/new` with select-option enumeration). Gate 1 declared this as parallel-not-blocking. Generated types alone don't catch DOM-string-cast bugs; E2E BQ covers that surface. AC-B13 records the dependency and confirms this spec does NOT block on E2E ship.

## §4 Sequencing

Chunks ship in order 1→2→3→4→5→6 in one PR (single Gate 2 build). Internal commit-by-commit ordering allows safe rollback:

- Chunks 1+2 must land together (generation tooling + first artifact); without artifact, downstream compiles fail.
- Chunk 3 must come after 1+2 (imports require the generated module).
- Chunk 4 must come after 2 (CI compares against committed snapshot).
- Chunk 5 can run in parallel with 4 (independent files).
- Chunk 6 lands last so runbook reflects final shape of 1–5.

## §5 Risks

- **R1 (MEDIUM):** Hybrid types in `types/index.ts` — backend-mirrors with frontend augmentation — may not all migrate cleanly. Mitigation: Chunk 3 inventory classifies (a)/(b)/(c); (c) cases get explicit compose-pattern refactor. Worst case: a (c) type is detected only after codegen output diverges and surfaces a TS error. Builder records each (c) decision in PR description.
- **R2 (MEDIUM):** `openapi-typescript` output for FastAPI discriminated unions or generic types may not match hand-authored types exactly even when semantically equivalent. Mitigation: when migration produces a type-mismatch, prefer adjusting consumers to match codegen output rather than hand-editing the generated file. Generated file remains source-of-truth.
- **R3 (LOW):** CI fetches from production canonical URL — production downtime makes CI fail. Mitigation: CI step has 30s timeout and retry-once policy; sustained outage requires manual override via committed-snapshot path. Document in §6 runbook.
- **R4 (LOW):** Production schema may include endpoints/types frontend doesn't consume — codegen output is wider than needed. Acceptable: dead code in `api-generated.ts` is tree-shaken by Next.js build. No action required.
- **R5 (MEDIUM):** Sequence-lock with backend deploy — frontend PR regenerated against backend `main` could include schema not-yet-deployed. Mitigation: AC-B11 message instructs "verify the backend PR is merged to main"; runbook §3 enforces "backend deploys first." Forbid frontend-PR-against-unmerged-backend-PR.
- **R6 (LOW):** `openapi-typescript` major-version bump (v6→v7→v8) changes output format. Mitigation: pin in `package.json` with `^` (allow patch+minor); major-version-bump is an intentional runbook event with regen + diff review.
- **R7 (LOW):** Generated file diff churn from non-semantic backend changes (re-ordered properties, new endpoints) could create review noise. Mitigation: codegen output uses stable property ordering; reviewers verify staleness gate works correctly during the first round.

## §6 Open questions

- **Q1:** `types/api-generated.ts` location — at repo root `types/api-generated.ts` (recommended; matches single-file simplicity) or `types/generated/index.ts` subdir? Builder decides at implementation; documents choice in runbook.
- **Q2:** Caching strategy for offline dev — committed snapshot suffices for `tsc` purposes; no separate cache layer required. Confirms in runbook.
- **Q3:** Backend-mirror identification heuristic for Chunk 3 — exact-name 1:1 match with Pydantic schema name is the default rule. Hybrid types are detected by manual review of each `types/index.ts` declaration. No tooling required beyond grep.
- **Q4:** Production canonical URL schema versioning — does `https://api.ai.market/openapi.json` carry stable `info.version` field? If yes, runbook references it for breaking-change detection. Builder verifies on first regen.
- **Q5:** Test runner choice for AC-B6/B7/B8/B9 — repo's current test convention (Vitest/Jest/Playwright) determines test file location. Builder verifies via `package.json` `scripts` at Chunk 5 time.

## §7 Honest-posture caveats (sandbox-no-read)

This spec authored without filesystem read on `ai-market-frontend`. Builder MUST reconcile the following at Gate 3 / implementation time:

1. **`types/index.ts` actual content:** S613-Primary filesystem recon confirms the file exists with hand-maintained types but does not enumerate which are backend-mirrors. Chunk 3 inventory is the reconciliation step.
2. **`package.json` test-runner convention:** Determines AC-B6–B9 test file location and Chunk 5 implementation path. Builder reads `package.json` `scripts` block at Chunk 5 time.
3. **`tsconfig.json` strictness:** AC-B4 requires generated file to compile under existing config; "no new TS errors" assumes current config is the baseline. Builder verifies before commit.
4. **Existing CI workflow files:** AC-B10 says "add or extend" — builder reads `.github/workflows/` and decides between new file or job-extension at Chunk 4 time.
5. **Predecessor SHA verification:** Spec pins Gate 1 v3 at `1f3cd09b` per S613-Primary stamp and `body.gate1.last_note`. Builder verifies `git show 1f3cd09b -- specs/` matches the cited 8-AC structure before authoring Gate 2 PR description.
6. **Stale `core_pillars_tied`:** BQ entity body has `core_pillars_tied: ['Council/Koskadeux orchestration']` but the BQ pillar narrative reads `ai.market product surface` and queue-body has `core_pillars_tied: ['ai.market']`. Flagged here for Vulcan-Primary housekeeping; does not block Gate 2 ship.
7. **Sequence-lock status with E2E BQ:** BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574 Gate 2 build spec stashed by S613.W round 2 at `infra:worker-artifact-stash:S613:bq-frontend-e2e-customer-journey-tests-s574-gate2`. Drain status pending at S614.W open. Check before Gate 3 dispatch in case E2E PR opens against same `types/` paths.

## §8 Out of scope

- Tests-as-precondition AC8 surface (covered by sibling BQ-FRONTEND-E2E-CUSTOMER-JOURNEY-TESTS-S574; parallel ship; declared in AC-B13).
- Backend OpenAPI schema improvements (e.g., adding stable `info.version` semver). Backend-side BQ if pursued.
- Auto-generation of API client functions (orval-style). This spec is types-only per Gate 1 decision.
- Staging environment provisioning. Production-fallback policy is explicit until staging exists.
- CI merge-gate enforcement on `ai-market-frontend` repo — separate BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574 (which AC-B10's staleness check depends on at full-enforcement level).

## §9 Acceptance summary

| AC-B | Chunk | Layer | Notes |
|------|-------|-------|-------|
| AC-B1 | 1 | tooling | `openapi-typescript` pinned |
| AC-B2 | 1 | tooling | npm script + URL policy |
| AC-B3 | 1 | docs | README section |
| AC-B4 | 2 | artifact | initial generated file |
| AC-B5 | 3 | migration | `types/index.ts` inventory + rewire |
| AC-B6 | 5 | drift test | `DataRequestUrgency` 'normal' |
| AC-B7 | 5 | drift test | `format_preferences` `string[]` |
| AC-B8 | 5 | drift test | `UserResponse.role` includes 'pending' |
| AC-B9 | 5 | drift test | `BuildQueueDetail.decisions_locked` dict (AC5d) |
| AC-B10 | 4 | CI | staleness gate workflow |
| AC-B11 | 4 | CI | failure-message + coordination policy |
| AC-B12 | 6 | runbook | regen + breaking-change procedure |
| AC-B13 | 6 | scope | E2E sequence-lock disclosure |

13 AC-Bs across 6 chunks; sandbox-no-read posture with 7 builder reconciliation items in §7.
