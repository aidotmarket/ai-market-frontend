# Frontend CI timing failures

The current source of truth is `.github/workflows/frontend-ci.yml`: PRs and
pushes to main run `npm ci`, lint, typecheck and `npm run test` on Node 22.
This supersedes the older central frontend runbook statement that there is
no PR CI. Vitest uses its default forks pool, with one worker when `CI` is set
and two locally. Test and RTL async timeouts remain at their defaults.

For an asynchronous interaction, wait for the resulting state before the next
interaction. A mock call proves a request started, not that its response or
React effects finished. A disappearing button can mean it was renamed while
busy; wait for the positive saved/ready state too. Keep immediate safety
assertions immediate when the requirement is synchronous refusal.

## Reproduce and verify

Use Node 22 and the lockfile (`rtk npm ci`). Run `CI=true rtk npm run test`;
this is the workflow command and reads the same worker settings. Time it with
`rtk proxy /usr/bin/time -p rtk npm run test` with `CI=true` exported. Keep the
full log when diagnosing a failure using `rtk proxy npm run test`.

Search for candidate timing assumptions:

```sh
rtk rg -n -U 'fireEvent\.[^\n]+\n[ \t]*expect\([^\n]+(toHaveBeen|toBeNull|toBeDisabled)' --glob '*.test.tsx'
```

Also inspect assertions that wait for a mock call count and immediately check
state changed after the response. These are heuristics, not automatic defects:
synchronous callbacks and safety refusals are valid.

For incident 3a0d8d69, repeat the gateway-source, seller-workspace page, and
GuidedListingFlow reconciliation files 20 times alongside CPU load, then run
the whole suite five consecutive times with CI settings. Run typecheck, lint,
and diff checking. Publish only the assigned branch and verify the Frontend CI
run belongs to its exact new head and succeeded. No retries or timeout
increases should substitute for waiting on the actual completion state.
