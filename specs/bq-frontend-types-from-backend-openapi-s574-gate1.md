# BQ-FRONTEND-TYPES-FROM-BACKEND-OPENAPI-S574 — Gate 1 Spec (v2)

**Status:** Gate 1 author / R2 fold applied
**Pillars:** ai.market product surface; Council/Koskadeux orchestration (clean contracts)
**Originating session:** S574
**Authoring session:** S586.W (Worker; reparented from S585.W after S585 Primary close)
**Repo:** aidotmarket/ai-market-frontend
**Priority:** P2

## Changelog

### v2 (S585.W drafted, S586.W shipped)

R2 fold applied to v1 (which existed only inline in MP R1 task `449f29a7` body — not previously committed; this is the first on-disk commit per Worker-BQ design pattern). R1 verdicts: MP=APPROVE_WITH_MANDATES (3 MED findings); DS=FAILED_READ_TIMEOUT (optional retry pending).

R2 fold logic was drafted by Worker S584.W before its session_open response timeout, then validated by Vulcan-Primary against MP R1 task `449f29a7` and persisted at `build:bq-frontend-types-from-backend-openapi-s574.body.drafted_r2_fold_logic_s585` for cross-Worker resumption. Worker S585.W resumed authoring but reparented to S586.W mid-flight after the parent Primary session closed; v2 ships unchanged from the validated S585 draft.

Folds applied:

- **MED-1 (AC7, staging URL unresolvable)** — replaced `https://api-staging.ai.market/openapi.json` with `https://api.ai.market/openapi.json` and added a production-fallback-until-staging-exists policy paragraph. Cites precedent at `ai-market-backend/specs/BQ-CRM-INTEGRATION-CONTRACTS-GATE2.md:1527,1545` (production used as canonical OpenAPI source when staging unavailable).
- **MED-2 (AC4, BuildQueueDetail not in types/index.ts)** — removed BuildQueueDetail from migration-minimum and added scoping note. Premise validated empirically by S585.W AG dispatch (task `1cf3fcf0`): `grep BuildQueueDetail types/index.ts` returned no match. AC4 now covers only types that DO have a manual mirror; BuildQueueDetail's drift is handled in AC5d.
- **MED-3 (AC5, missing 4th drift case)** — added AC5d covering `BuildQueueDetail.decisions_locked` dict-vs-bool drift (the fourth S574 drift case alongside the three already in AC5).

### v1 (origin)

Authored inline in MP R1 task `449f29a7` dispatch body. Content derived from `build:bq-frontend-types-from-backend-openapi-s574.body.acceptance_criteria_draft` (AC1–AC6) plus AG's `council_review_findings_s574.ag_recommended_acs_to_add` (AC7–AC8). Never committed to disk per Worker-BQ design pattern (first repo commit at R2 fold time).

## Context

S574 incident retrospective: in a single session four type-drift bugs surfaced, all customer-impacting:

1. `UserRole` missing `PENDING` (frontend trusted `/me` to return `UserResponse` with `role='pending'`; backend's response schema didn't allow it; backend PR #57 added it).
2. `DataRequestUrgency` `'medium'` vs backend's `'normal'` (frontend default rejected by backend pattern `low|normal|high|urgent`).
3. `CreateDataRequestPayload.format_preferences` typed as string; backend expects `list[str]`.
4. `BuildQueueDetail.decisions_locked` typed as `bool` on the frontend; backend (`ai-market-backend/app/schemas/bq_lifecycle.py:54`) returns dict shape.

Each was caught only by user-facing failure or post-merge ts-check. The class is "frontend TypeScript types are hand-maintained to mirror backend Pydantic schemas, no enforcement keeps them in sync, drift accumulates until users hit it."

The fix is build-enforce the contract: generate frontend types from the backend's OpenAPI spec on demand and CI-fail PRs whose generated output is stale.

## Production-Fallback-Until-Staging-Exists Policy

There is no `api-staging.ai.market` host. Until a staging environment exists, **production** (`https://api.ai.market/openapi.json`) is the canonical source for type generation. This mirrors the precedent set in `ai-market-backend/specs/BQ-CRM-INTEGRATION-CONTRACTS-GATE2.md:1527,1545` where production is treated as canonical when staging is unavailable.

- CI pins regeneration to `https://api.ai.market/openapi.json`.
- Developer-side override to `http://localhost:8000/openapi.json` permitted for local iteration.
- Frontend-PR-against-unmerged-backend-PR forbidden: backend schema change merges first, deploys to production, frontend regen-and-PR follows.

When a staging environment is added, AC7 will be re-fold to switch CI to staging with production as fallback.

## Acceptance Criteria

**AC1.** Frontend has a generated types module (e.g. `types/api-generated.ts`) produced by `openapi-typescript` or `orval` from the backend's OpenAPI spec at `/openapi.json`. Tooling choice locked to `openapi-typescript` per MP R1 disposition Q1 (no existing codegen tooling in repo; types-only output is the right scope).

**AC2.** A make-target / npm script regenerates the types on demand and is documented in the frontend README. The generated file IS committed (per MP F-Q5: do NOT regenerate inside every Railway build; keep cold builds deterministic and cheap).

**AC3.** A CI check fails the PR if the generated types are stale relative to the OpenAPI spec the backend currently serves on `main` (production: `https://api.ai.market/openapi.json`). This depends on the frontend repo having PR-time CI configured (currently absent — see related BQ `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574`).

**AC4.** Hand-maintained backend-mirror types currently in `types/index.ts` are migrated to import from the generated module; manual frontend-only types (UI state, component props) remain in `types/index.ts`.

> **Scoping note (R2 MED-2 fold).** AC4 covers all hand-maintained backend-mirror types currently in `types/index.ts`. `BuildQueueDetail` does not appear there (verified via S585.W AG dispatch `1cf3fcf0`: `grep BuildQueueDetail types/index.ts` returned no match) and its drift is covered by AC5d.

**AC5.** At least three known-drift cases are validated against the regenerated types and any divergence resolved:

- **AC5a.** `DataRequestUrgency` — frontend value space matches backend pattern `low|normal|high|urgent` (no `'medium'`).
- **AC5b.** `CreateDataRequestPayload.format_preferences` — typed as `list[str]` matching backend.
- **AC5c.** `UserResponse.role` — includes `'pending'` matching backend `UserRole` enum.
- **AC5d.** `BuildQueueDetail.decisions_locked` — dict shape (matches backend `ai-market-backend/app/schemas/bq_lifecycle.py:54`), not `bool`. (Added in R2 MED-3 fold; the 4th S574 drift case omitted from the initial AC5.)

**AC6.** Runbook entry at `specs/openapi-codegen-runbook.md` (per MP R1 disposition Q4) documenting the regeneration workflow + how to handle a breaking backend schema change (regen → resolve type errors in frontend → commit generated file + frontend changes in same PR — backend PR must merge and deploy first).

**AC7.** Polyrepo spec-fetching strategy. Frontend regeneration fetches `openapi.json` from `https://api.ai.market/openapi.json` (production canonical source until staging exists; see production-fallback policy above). Document the workflow: backend merges schema change first, deploys to production, frontend regen-and-PR follows. Frontend-PR-against-unmerged-backend-PR is forbidden. Developer override to `http://localhost:8000/openapi.json` permitted for local iteration only.

**AC8.** Tests-as-precondition. Before declaring OpenAPI generation complete, the frontend must have a test suite (Vitest/RTL or Playwright) covering at minimum:

- Default `/requests/new` form submit.
- Selecting each `DataRequestUrgency` option (low/normal/high/urgent).
- Comma-list serialization for `format_preferences`.
- FastAPI 422 array-shape error rendering.
- FastAPI 422 string-shape error rendering.

Generated types alone don't catch DOM-string-cast bugs like the urgency dropdown option-value bug from S574. Tests are the second line of defense.

## Out of Scope

- Backend OpenAPI surface improvements (separate concern; backend already serves a usable spec).
- Migration of `BuildQueueDetail` to the generated module (no manual mirror exists; covered by AC5d validation only).
- Switching CI from production to staging (deferred until staging environment exists).
- Frontend test runner selection — AC8 mandates a suite but leaves Vitest/RTL vs Playwright to Gate 2 implementation.

## Open Questions

None blocking. MP R1 dispositions Q1–Q4 are locked in (openapi-typescript; production canonical until staging; migrate all detectable backend-mirror types; runbook at `specs/openapi-codegen-runbook.md`). DS R1 retry remains optional per fanout-unreliable rule.

## Related BQs

- `BQ-CI-MERGE-GATE-BRANCH-PROTECTION-S574` — PR-time CI on frontend repo is a prerequisite for AC3 enforcement; both BQs need to land for full enforcement.
- `BQ-BACKEND-422-RESPONSE-SHAPE-UNIFICATION-S573` — sibling backend contract cleanup; reduces the surface area the frontend must defend against. Reclassified as Primary-owned post-S581.W rejection.
- `BQ-COUNCIL-KD-SESSION-OPEN-RESPONSE-TIMEOUT-HARDENING-S585` — unrelated infra hardening filed during S585 polling cycle (parent of S585.W's bootstrap experience).
