# Connector pending action confirmation

Authority: runbooks `specs/BQ-CONNECTOR-ACTION-PATH-GATE2.md` §4.2,
AP3–AP8 and AP16, plus Gate 1 §4.5. This frontend implements Chunk 2 only.

The backend controls availability. With `CONNECTOR_ACTION_PATH_ENABLED=false`,
pending APIs return 404 and the page shows the same non-actionable not-found
message as a wrong owner or token. There is no frontend feature flag.

The adapter sends a first-party bearer session and SHA-256 of
`aim.pending.csrf.v1\0` followed by that exact credential. Reads send the digest
in `X-CSRF-Token`; decisions send it as `csrf`. Confirm also sends the displayed
backend `summary_hash`; decline sends only `token` and `csrf`. Decisions never
automatically retry or submit after login.

`RECENT_LOGIN_REQUIRED` and `SECOND_FACTOR_REQUIRED` resume through the existing
login and login-2FA flows with the strict `/confirm/<uuid>?t=<token>` return.
The settings re-auth dialog is unsuitable: its re-auth token does not stamp
the retained session's MFA time. Provider and email callbacks use the existing
auth return helper. After sign-in, the user reviews again and clicks Confirm.

The summary is an open backend JSON object. All fields, nested values and exact
terms are displayed as escaped text. The current backend producer supplies
action/user/client IDs and allowlisted binding fields, but no verified client
display name, requested time or plain-language effect. Do not infer these from
client IDs. Binding freshness currently demands MFA for all binding actions,
including users without native 2FA. These are backend gaps to resolve before
live acceptance proof; frontend tests cannot prove backend execution or policy.

Use Node 22 and the lockfile. Run `rtk npm test -- pending-actions`,
`rtk npm run lint`, `rtk npm run typecheck`, and `rtk npm run build`.
The confirmation route must serve `Cache-Control: no-store`,
`Referrer-Policy: no-referrer` and CSP `frame-ancestors 'none'`.
Live flag-on proof belongs to the authorized release work; this build does not
enable flags or deploy.

On an exact confirmation URL, terminal shared-client refresh clears the session
but leaves routing to this page. It reads API admission first, then shows either
inert 404 or sign-in with the intact continuation.
