# ai.market frontend

The customer marketplace web app uses Next.js App Router, React, TypeScript and Tailwind CSS. Application routes are in `app/`; shared UI is in `components/`; API clients are in `api/`; Zustand session state is in `store/auth.ts`. Vitest uses the Vite React plugin for tests; the application development and production commands use Next.js.

## Local development

Use Node.js 24.22.1 or later in the 24.x line (see `.node-version` and `package.json`) and the npm lockfile. From this repository:

```sh
npm ci
npm run dev
```

The default Next.js development address is `http://localhost:3000`. The browser API client defaults to `http://localhost:8000/api/v1`. For another backend, set `NEXT_PUBLIC_API_URL` to its origin (without `/api/v1`) in a local environment file, such as `.env.local`. `API_URL` is the server-side fallback for the rewrites in `next.config.ts`.

`NEXT_PUBLIC_*` values enter the browser bundle; keep private credentials out of them. In production, the frontend API origin is `https://api.ai.market` so the browser refresh cookie stays on the same site. Next.js inlines the public value during the build, so changing that value requires a rebuild.

## Existing checks and production commands

Production builds select Keystatic GitHub storage and need the variables listed in `.env.example`: `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET` and `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`. Use the existing secret-management guide below for real configuration; keep private values in local/server environment configuration and out of source control and `NEXT_PUBLIC_*`. Development selects local Keystatic storage. A build without its required configuration can fail while collecting the Keystatic API route.

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm start
```

### Tests from a pinned detached worktree

Install dependencies in that checkout; do not link `node_modules` from another
worktree. With Node 24 selected, run from the checkout root (a detached HEAD is fine):

```sh
rtk npm ci
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

For just Settings recovery and the original 16:14:32–33 double-refresh regression:

```sh
rtk npm test -- api/client.refresh-race.test.ts app/dashboard/settings/session-recovery.integration.test.tsx app/dashboard/settings/SellerAuthority.read-order.test.tsx app/dashboard/settings/SellerAuthority.test.tsx app/dashboard/settings/SellerPublicName.test.tsx app/dashboard/settings/page.test.tsx components/PendingProfileChanges.test.tsx
```

The integrated tests keep the real auth coordinator, interceptors, API wrappers
and section controllers; only HTTP transport and unrelated UI dependencies are
substituted. No backend or credentials are required. They cover all four Settings
readers with persistent 401s and successful refreshes, a successful refresh/replay,
one automatic re-read after external session rotation, manual retry, and the
absence of further reads after focus or subsequent rotations.

`npm start` serves the built application. `nixpacks.toml` runs `npm ci` and `npm run build`, then starts it with `npm start`. Railway deploys the main branch; deployment and browser acceptance guidance lives in the existing runbooks below.

The root layout self-hosts Plus Jakarta Sans upright variable WOFF2 in `app/fonts/`,
using weights 400–800 and `display: swap` while retaining the body font class.
The font and adjacent `OFL.txt` are unmodified from
[tokotype/PlusJakartaSans at 18d1cd2f7ea10481919d2f05c1f7064b7307fc26](https://github.com/tokotype/PlusJakartaSans/tree/18d1cd2f7ea10481919d2f05c1f7064b7307fc26):
`fonts/webfonts/PlusJakartaSans[wght].woff2` (Git blob `eebac44580986b89ed54b1dfc23209ce82ebc073`, 60,612 bytes)
and `OFL.txt` (Git blob `ea69b0ca12a02556c436680ea0a159efb7a748fa`, 4,402 bytes).
The SIL Open Font License 1.1 accompanies the font; builds need no Google font request.

The deploy receipt workflow reads GitHub deployment records with its job token
(`contents: read`, `deployments: read`). It requires the latest Railway App
production attempt/status, current HTTP 200, and the exact independently served
`/api/build-revision` before submitting a deploy receipt. Provider failure emits
the existing alert; provider or revision uncertainty finishes non-success.
Observation retains the initial 120-second wait and bounded 180-second window
(up to 12 samples). Truncated API lists remain unverified. Receipt acceptance,
refusal, or transport uncertainty is reported separately from verification;
an ambiguous POST is never retried automatically. Live provider and release
verification remain owner work.

## PR Rule check

When a PR adds an executable refusal, block, gate, fence, mandatory approval or
proof, or a fail-closed path, explain the harm, the restriction and when it
applies, the cost and who bears it, and why a narrower approach fell short.
The PR template includes the prompts. Prose, bullets, subheadings, tables, and
a details block with a `Rule check` summary and four answers work.
Editing the PR description reruns the check. Ordinary changes can leave the
commented template as-is.

The check compares changed TypeScript and JavaScript runtime files with the
PR's merge base. It reports direct guarded HTTP refusals (401, 403, 423 or 428),
named permission errors, and native controls disabled by a negated
authorization, approval or proof predicate. It also recognizes direct denials
in a catch block after a named verification call. For a confirmed addition,
CI fails when it finds no accepted Rule check answer text. Reviewers assess
whether the explanation answers all four questions and cover restrictions
outside these patterns.

Ambiguous outcomes such as policy-dependent early returns or named fail-closed
callbacks, and source comparison failures, are advisory. The check matches
exact guards and moves. Reviewers can assess an architectural rewrite when its
predicate and effect are demonstrably equivalent. For example, replacing a
literal 403 response with a typed `ForbiddenError` can be equivalent when the
error handler produces the same refusal on that path. Tests, fixtures, docs,
and descriptive UI copy are outside automatic enforcement. The check compares
syntax and can miss indirect predicates, reachability changes, compound
conditions, alternate status codes, or rules expressed in other languages or
configuration.

1. **Harm.** Koskadeux MCP #619 introduced an undocumented restriction that
   invalidated otherwise approved verdicts and interrupted review work.
2. **Mechanism.** A PR-scoped check flags confirmed additions in the diff and
   asks the author to explain them for human review.
3. **Cost.** The workflow runs a short job. Affected authors write a brief
   explanation, and one independent reviewer assesses it.
4. **Narrower approach.** A template alone depends on someone noticing every
   change, and review missed #619. Ordinary changes and existing restrictions
   are exempt, and low-certainty detections are advisory.

Run the checker fixtures with `node --test scripts/ci/pr-rule-check.fixtures.mjs`
after installing the repository dependencies.

## Operating guides

- [Marketplace frontend](https://github.com/aidotmarket/runbooks/blob/main/ai-market-frontend.md): deployment, routes and customer issue diagnosis.
- [Browser session authentication](https://github.com/aidotmarket/runbooks/blob/main/browser-session-auth.md): same-site API configuration and reload verification.
- [Secret management](https://github.com/aidotmarket/runbooks/blob/main/infisical-secrets.md): existing credential setup and ownership.

This setup description was compared with the committed package scripts, API client, Next.js configuration and Nixpacks configuration in S1799 (2026-10-11). It is source evidence, not a new successful build or live browser verification.
