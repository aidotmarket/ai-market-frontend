# T932 frontend: provider sign-in and seller setup

Implementation is tied to backend candidate `e4ba2c4e072d74409b868771fda138d32eff1c76`, whose authoritative contract is `runbooks/provider-signin-two-factor-setup.md` in the backend checkout. Read the original T932 private JSON and retained seller-wizard addition before implementation. This file contains no private ticket payload.

## Account policy

Authenticated `GET/PATCH /auth/me` supplies optional `two_factor_setup_eligible`, `two_factor_setup_reason`, `two_factor_provider`, `seller_two_factor_satisfied`, and `reauth_method`. Google/GitHub current sessions without native TOTP hide new enrollment and explain “Sign-in security is managed by your Google/GitHub account.” This describes provider responsibility, never observed provider MFA. `totp_enabled` remains the native account state. Enabled native controls and protected disable/backup-code recovery remain available.

Settings and dashboard enrollment also handle the backend's 409 `two_factor_managed_by_provider` or `two_factor_managed_by_sso` refusal at setup and verification. Pending enrollment UI disappears when current policy forbids setup. No linked provider, `primary_auth`, password absence or account `auth_methods` supplies current provider assurance.

The returned `reauth_method` selects the existing password, TOTP or magic-link modal. Magic-link sending requires the existing explicit Send link click; rendering never sends email. Verification, action token use, audience, expiry, CSRF and all backend checks remain unchanged. The payment-method prompt passes the returned method too, while retaining its existing native-TOTP fallback for old servers.

For older `/me` responses, settings/dashboard retain their prior native/password/magic-link selection and passwordless enforced-SSO behavior. Missing provider-policy fields do not infer provider assurance, fabricate MFA, or create new restrictions on unrelated workflows. Explicit unavailable enrollment remains explained in settings.

## Seller setup

Server capability `missing_steps` determines the security step and payout readiness. If capability steps are unavailable, `seller_two_factor_satisfied` falls back to the existing native `totp_enabled` state. A current capability refusal overrides stale `/me` satisfaction. Suspension/ownership and Stripe/cloud readiness remain server-owned.

The floating wizard displays completed Provider sign-in without linking into refused native enrollment. Next follows server `next_action`; profile/company hashes and Stripe onboarding retain their normal navigation. Both legacy listing publication and workspace publication notify the wizard to reload capabilities after confirmed publication. The guided checklist falls back to actual server missing steps when `next_action` is absent, instead of inventing profile-name work. First-publish onboarding is calculated by the backend, not reconstructed from account provider links or response-local TOTP mutation.

Stripe setup/return and AWS/R2 security refusals explain the sign-in security step. Cloud capability, provider availability, ownership, authorization expiry, idempotency, bounded scope and verification controls remain intact. No new provider-reauth endpoint, grants, automatic email or authentication bypass is introduced.

## Local verification

Use the repository lockfile and Node 22 (the existing frontend CI runbook). All shell commands start with `rtk`. Dependencies: `rtk npm ci`. Tests/typecheck/lint can run the installed CLI entrypoints through `rtk proxy <Node22> node_modules/vitest/vitest.mjs run`, `rtk proxy <Node22> node_modules/typescript/bin/tsc --noEmit`, and `rtk proxy <Node22> node_modules/eslint/bin/eslint.js .`.

For isolated build/render verification, start `rtk proxy <Node22> tests/t932/build-api.mjs`. Build with local API URLs and explicitly fake Keystatic values:

```sh
rtk proxy env NEXT_PUBLIC_API_URL=http://127.0.0.1:4201 API_URL=http://127.0.0.1:4201 KEYSTATIC_GITHUB_CLIENT_ID=t932-fixture-client KEYSTATIC_GITHUB_CLIENT_SECRET=t932-fixture-secret KEYSTATIC_SECRET=t932-local-fixture-secret-for-build-only NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=t932-fixture rtk proxy <Node22> node_modules/next/dist/bin/next build
rtk proxy <Node22> node_modules/@playwright/test/cli.js test --config tests/t932/playwright.config.ts
```

The local API serves empty public build data only; it never forwards requests. Browser tests use actual built Next pages and intercept every API request, blocking external browser requests. Fake email, Stripe refusal and cloud refusal responses are local fixtures. Screenshots cover 1440px/390px settings, wizard/dashboard, reauth, publication-triggered setup and cloud refusal, plus native/password/SSO controls. Request receipts show explicit magic-link calls and zero native-enrollment, payment setup-session or connector grant calls in provider scenarios. Existing guided-listing browser tests can also run through `playwright.preview.config.ts` with `guided.pw.ts`.

## Remaining acceptance

HOLD9495 remains active: no deployment, merge, ticket/BQ closure or production writes. Mars's T935 consent and ConnectedApps files are untouched. Root must perform full auth review and authorized live acceptance after backend T618/current-main integration and a compatible release. Local fixtures do not prove real Google/GitHub identities, actual email delivery, native factor enforcement by a live backend, first-publish transactions, Stripe readiness or cloud operations.
