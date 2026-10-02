# S1790 frontend CI flakiness — incident 3a0d8d69

Base: `e36b920ffd95cf87679d0c0a84682da3c1695b87`.
Publication branch: `build/deflake-frontend-ci-s1790`, PR #115.

## Diagnosis and change review

Failed run [36963058626](https://github.com/aidotmarket/ai-market-frontend/actions/runs/36963058626)
expected the second save's version 3 but received version 2. The first save's
button disappears when renamed to “Saving draft…”, before the response
advances the editor baseline. The test now waits for the positive saved status
and absence of both save/busy buttons before editing again. First call is
explicitly asserted as call 1; second call count and last-call payload/version
assertions are retained. Product code is unchanged.

This implements the readiness recommendation in the supplied GLM review
`response-20261002-063642-591217-d20e4ce7.md`. That review predates this delta;
no fresh independent Council approval is claimed here.

Systemic choice: reduce the existing worker cap from two to one only when CI
is set. Keep the default forks pool and all existing test/RTL timeouts. The
[Vitest worker setting](https://vitest.dev/config/maxworkers) bounds concurrency;
its [default pool](https://vitest.dev/config/pool) is forks. This small config
change trades suite wall time for less simultaneous CPU/DOM work. Alternatives
reviewed: raising RTL timeout would not repair this test's false completion
signal; switching pools introduces broader behavior differences. Neither is
needed. Single-worker success does not prove contention caused every flake.

## Measurement and heuristic scan

Node 22.23.3, Vitest 4.1.8, lockfile installed with npm ci. Exact workflow
command: `npm run test`, `CI=true`, default forks pool. On this Mac (32 logical
CPUs), after the test fix and before the config change, maxWorkers=2 passed
151 files / 1,523 tests in 36.71s (37.30s wall). One worker passed the same suite
in 68.97s (69.26s wall). These local timings are not forecasts for Ubuntu;
the original failed GitHub run took 90.64s with two workers.

`rg` multi-line heuristics found 58 adjacent event/assertion pairs and 72
call-count wait sites. These are candidates, not confirmed flakes. Sampled
synchronous callbacks in CountrySelect, LicenseRecordView, and StorageSetupGuide
are invoked directly before any await. Negative/refusal assertions should stay
immediate. `SavedWorkspaceData.guided.test.tsx:18-19` waits for the save request
count then asserts response-driven sourceSaved/navigation; this remains a
potential timing assumption outside this narrow fix. No bulk rewrites were made.

Validation logs and the repeat harness are retained at
`/tmp/s1790-ci-evidence/` on the builder machine. The harness uses `rtk` for every
subprocess, sets Node 22 and CI=true, and launches 32 CPU burners for the three
flaky files. Burners are terminated before five consecutive full-suite runs.

## Completed local proof

- All three files passed together 20/20 alongside 32 busy-loop Node processes
  on 32 logical CPUs: 62 tests per run, 1,240 successful test executions.
- Five consecutive exact CI-command runs passed 151 files / 1,523 tests each
  (7,615 successful test executions). Wall seconds: 73.28, 74.54, 74.99, 74.61, 71.81.
- Node 22.23.3 typecheck (`--incremental false`) and lint passed; lint has
  six existing Next.js image warnings and no errors. `git diff --check` passed.
- No product files, retries, test timeouts, or RTL timeouts changed.
