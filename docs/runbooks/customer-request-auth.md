# Customer request sign-in repair — T-2026-000943 / S1766

The backend auth callback and email-link origins are canonical `https://ai.market`.
Next.js redirects ordinary exact `www.ai.market` requests to apex before rendering
the app or starting authentication. The private support recovery paths described
below are excluded from that redirect and refuse a noncanonical origin. The first redirect in `next.config.ts` preserves the
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

## C2 support recovery integration — source implemented, native NOT RUN

This frontend delta integrates public backend C2
`6968349a9be36ea4f8de8d27d36eab5869b9da85` with frontend public84
`84a06ec8f4a0e29fd7f4480cb578205fada0eb98`. The backend's
`integrations/frontend` files are reviewable candidates against older source;
this integration adapts their contracts into actual app/config files and retains
the existing C3/C4 controllers, normal provider order and post-refresh admission.
No backend code, shared MCP, controls, deployment or account is changed here.
Source review, ordinary source publication and synthetic tests do not qualify an
installed frontend, a real customer session or any full acceptance row.

Backend `neutral_challenge` and `neutral_entry` emit canonical HTTPS
`FRONTEND_URL/api/v1/support/mailbox-confirm#<secret>` in frozen plain-text MIME.
The entry purpose remains distinct from mailbox delivery proof. The secret is a
fragment, never a query parameter. Backend GET HTML clears it into memory and
requires an explicit choice; scanner GET does not consume. The account choice
navigates to `/support/mailbox-account#<secret>` on the same origin. Email-only
consumption POSTs to `/api/v1/support/mailbox-confirm/email`; an authorized entry
may return `/api/v1/support/email-visit/<ticket UUID>`. These HTML handlers remain
backend handlers; there is no frontend substitute API or invented availability.

`next.config.ts` adds only these seven same-path rewrites to a configured HTTPS
API origin: mailbox-confirm HTML, mailbox-confirm/email, and email-visit ticket
HTML plus conversation, draft, messages and customer-receipts. No wildcard
support/auth/account/history proxy is added. Invalid, credential-bearing,
non-HTTPS or path/query/fragment API origins fail closed for support rewrites.
Existing unrelated development discovery rewrites retain their fallback. The
account POST uses the existing API host directly, including its retained
HttpOnly web session and preflight refresh cookie; refresh is never proxied.

The actual Next15 proxy source and stream-only fake transport tests preserve
original `Origin` and `Cookie`, and retain multiple backend `Set-Cookie` values
without Domain/Path/SameSite rewriting. `changeOrigin` changes upstream Host,
not browser Origin. Backend double-submit `__Host-support-confirm` is Secure,
Path=/, SameSite=Strict and readable for `X-Support-CSRF`; the separate
`__Host-support-visit` is also HttpOnly. Both have 900-second cookie bounds;
backend visit authorization enforces its own absolute expiry and scope. No
cookie attribute or native proxy/browser behavior is certified by these tests.

The account page initially disables consumption. It captures one fragment,
clears the URL immediately in its capture effect, validates the link, and permits
one explicit logical consumption. It uses a valid current account directly or
calls the actual store hydrate/API-host refresh and /me flow. A same-principal
preflight rotation is admitted through the existing session-mutation helper.
That helper's optional POST callback now receives its exact headers (existing
zero-argument callbacks and PATCH admission remain compatible), allowing the
page to match current bearer plus token-derived `X-CSRF-Token` after refresh.
Owner/principal changes, logout, token replacement while a response is pending,
multiple credential installations during a restore/preflight, unmount and
fragment replacement retire the capability. A late old-owner success cannot
show or retain confirmed status. A refusal, malformed response or unknown
transport outcome stays unavailable and is never automatically POST-replayed.
No extra login/code/signup fallback is offered, and terminal refresh refusal on
this private page does not redirect into login. The backend independently binds
the challenge to its current human principal; the client cannot infer a link's
intended principal from an opaque secret.

The private boundary omits normal Providers/AuthHydrator, Layout,
NotificationCenter, general allAI/history, FAB and panel on this page. Actual
normal components are exercised on ordinary routes as a positive control.
Every other page retains its original provider order and request behavior.
Private pages use no analytics, external assets or persistent bearer/draft
storage. `middleware.ts` requires canonical HTTPS `ai.market` and installs a
per-request nonce CSP in both the request and response for the account page;
the page layout is dynamic so the nonce is not statically cached. The policy
has no unsafe-inline/unsafe-eval, permits self assets and only self plus the
configured HTTPS API origin for connections, and sets no-referrer/private
no-store. Actual Next15 nonce extraction is tested; production framework
bootstrap execution, CSS/font loading and final proxy header composition still
need native qualification. Backend HTML retains its own nonce CSP. Browser URL
normalization, raw/forwarded Host/protocol handling and cross-origin cookie
policy are explicitly unqualified; use the exact canonical emitted URLs.

Only the typed `support.reply` adapter moves from legacy ticket `/messages` to
`/customer-messages`, with the same immutable body/UUID nonce and current-visit
admission. Generic legacy callers and request-thread commands keep their own
contracts. Strict CustomerConversation envelopes, string message versions,
opaque cursors and foreign-proposal/conversation quarantine are retained.
Backend C3 `ce720791cd4caf89cbc952f0a6475155fd5bbd40` assigns the ticket ID from
the proposal ID; its confirmation and C2 projection therefore agree without
client remapping. A displayed outbound version is the backend SHA256 of exact
id/direction/body; a receipt identifies that exact visible version, never email
acceptance. Missing C5 enrollment/reopen readiness remains an unavailable or
unknown outcome with the existing draft/command retained.

### Later native checklist — AUTHORED, NOT RUN

Run only in a separately authorized Hades window, with the real installed source
identities and ordinary operator identity recorded. This checklist authorizes
no execution or customer/mail/account action:

- Confirm exact canonical HTTPS routes, real Next rewriting, raw Host/protocol,
  original Origin/Cookie, multiple Set-Cookie, Secure/host-only/Path=/ and Strict
  SameSite behavior through the actual proxy. Reject noncanonical private hosts
  without redirecting a fragment. Check framework URL normalization separately.
- Verify real account hydrate, API-host refresh and retained-session CSRF with a
  valid same-principal session and no additional sign-in/code. Replace/log out
  before capture, during hydration, preflight and response; no old-owner POST or
  confirmed status may cross those boundaries. Check privacy after navigation.
- Inspect the production DOM/bootstrap and final nonce CSP, script/style/font
  requests, no-store/no-referrer, no external assets/analytics/widgets, no bearer
  in request URLs/referrers/logging or storage, immediate fragment clearing,
  scanner GET nonconsumption and one explicit consumption after duplicate clicks.
- Exercise actual email-only visit entry, different ticket denial, two tabs,
  visit replacement, exact 15-minute absolute expiry, preserved drafts, blank
  edits and deferred reads, protected reply/dedup and displayed outbound-version
  receipt. Cookie lifetime is not proof of the absolute server visit bound.
- Verify real C3/C4 session retirement, proposal/ticket identity, original
  conversation replies, exact-command unknown recovery and C5 refusal/reopen
  truth. Positive DOM receipt, sender/provider acceptance and customer receipt
  are separate evidence. No automatic mail or consume action is part of tests.

For rollback, use ordinary reviewed source/release procedures to remove only
this C2 integration delta while retaining public84 C3/C4 and their fixes. Do not
reset preserved jobs/reviews, erase uncertain commands or invalidate evidence to
make a state appear successful. No data deletion, restore, flag change or
operational rollback was performed. Root audits the limited delta, then ordinary
C2-only review; ongoing Hades31897 C2,31901 original C3 raisers and31910 C4 scope
remain on their existing source identities/handles. No duplicate full pair,
source adoption, paired approval or native qualification is claimed.
