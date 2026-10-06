# Customer request sign-in repair — T-2026-000943 / S1766

The backend auth callback and email-link origins are canonical `https://ai.market`.
Next.js redirects exact `www.ai.market` requests to apex before rendering any app
or starting authentication. The first redirect in `next.config.ts` preserves the
path and query; apex, local and preview hosts stay on their own origin. Next's
host condition matches the raw HTTP `Host` header, ignoring `x-forwarded-host`.
The Railway middleware's internal `nextUrl` hostname is not the matching input.
Root must verify that the production proxy preserves raw public `Host`; an
internal raw host with only forwarded www will not match this rule.

On the login form, **Sign in or sign up with email** requests
`{email, purpose: 'register'}` from `/auth/magic-link/request`. The existing
backend uses login for active existing users, skips blocked users, and creates
new passwordless users only after verified redemption. `requestMagicLink`
retains a default and explicit `login` purpose for callers needing existing
accounts only. Password login, MFA, onboarding and legal acceptance remain in
their existing flows. A generic HTTP 200 does not prove email delivery, so the
confirmation says **Email link requested** and explains retry/Google recovery.

Request return paths are validated on save and consumption. OAuth uses
origin-scoped session storage, while email uses same-origin local storage to
support opening a link in another tab of the same browser. Only a public path
and expiry are stored; no email address, token, cookie or credential is copied.
Encoded query values retain their meaning. The return is consumed after
authentication and any required MFA, with existing AIM Data/connector fallbacks.
An email link opened in another browser/device has no saved return path and uses
the existing fallback.

Focused local regression command:

```sh
rtk proxy npm test -- next.config.test.ts middleware.test.ts api/auth.test.ts lib/request-auth-return.test.ts app/login/LoginForm.test.tsx tests/connector-auth-callbacks.test.tsx tests/aim-data-oauth.test.tsx tests/aim-data-continuation.test.ts lib/redirect.test.ts store/auth.test.ts app/register/RegisterForm.test.tsx
```

For Node 25, run with `NODE_OPTIONS=--no-experimental-webstorage` so jsdom owns
browser storage. Verify real production-mode `next start` HTTP responses too:
www must return 308 with the exact path/query; apex/local/preview must stay local.
Test raw Host and forwarded-host independently; a config-object test alone does
not prove deployment proxy behavior.

HOLD10016 remains active. This repair authorizes no production merge, deployment
or provider configuration change. Root owns live Google sign-in, real email
delivery/redemption and request-response proof. Do not submit mail, inspect
customer tokens/mailboxes, create or impersonate customer accounts during local
verification. Green tests are not evidence that the customer incident is fixed.
