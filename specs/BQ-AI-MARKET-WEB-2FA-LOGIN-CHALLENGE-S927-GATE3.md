# Gate-3 Audit Verdict — 2FA Login Challenge (Web Frontend)

- **BQ:** BQ-AI-MARKET-WEB-2FA-LOGIN-CHALLENGE-S927
- **Build under audit:** PR #30, commit `1523410ca3ccfb61e9196d97bee782ef3b454d36`
- **Builder:** MP (Codex). **Reviewers (builder excluded):** AG + DeepSeek.
- **Session:** mars / S934
- **Outcome:** **PASS** — both independent reviewers PASS on all five binding mandates.

## Verdicts

- **AG (Gemini 3.5 Flash):** APPROVED. M1–M5 all PASS. Confirmed: the `api/client.ts` 401-interceptor skip for `/auth/2fa/verify` is correct (no session exists yet to refresh); the module-level `deferredClearTimer` is safe because `<TwoFactorChallenge>` mounts as a single page-level instance; `pre_auth_token` is memory-only in an unpersisted zustand store.
- **DeepSeek (v4):** APPROVED_WITH_NITS. M1–M5 all PASS. One LOW nit: the module-level `deferredClearTimer` is a fragile pattern *if* the component is ever instanced in parallel (not the case today).
- **MP:** excluded (builder).
- **Mars pre-audit:** PASS on M1–M5; scope clean (frontend only, backend untouched).

## Mandate results

| Mandate | Result |
|---|---|
| M1 pre_auth_token memory-only (no storage/cookie/telemetry; store unpersisted) | PASS |
| M2 countdown==0 auto-reset + redirect to login | PASS |
| M3 cleared on success / expiry / lockout(401) / logout / unmount / back-nav / reload | PASS |
| M4 no pre_auth_token or code in logs / telemetry / errors | PASS |
| M5 countdown from absolute expiresAt (no setInterval drift) | PASS |

## Non-blocking follow-up

- LOW: consider refactoring `deferredClearTimer` from a module-level singleton to a `useRef` in a later tidy-up. Both reviewers consider it safe for the current single-instance usage.

## Build validation (MP)

typecheck pass · lint pass (pre-existing `<img>` warnings only) · `npm test` 8 files / 23 tests pass · `git diff --check` pass.

## Next: Gate-4 (real browser, deploy + Max-in-the-loop — curl NOT valid)

Per `runbooks/browser-session-auth.md`: enable 2FA on a test account; verify password / magic-link / Google / GitHub each prompt → code → signed in → hard refresh holds; backup-code path; wrong-code ×5 lockout; expiry restart; abandon clears state; non-2FA regression. Branch base is `30ce9a89`; main has since advanced to `b0d22611` — check branch is current before merge.

## Process notes (for next session)

- `council_request` review-mode preload rejected dispatch (`ag_review_preload_unresolved`: no head-ref input) even after populating `git_state.branch_head_sha`. Both reviews were run via `mode=open_response` with the diff inlined. P3 fix candidate.
- The degraded reconciler cleared this BQ's `git_state` PR linkage mid-flight (pr open→none, head nulled); re-asserted manually. Same class as the S621 reform target.
