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
login and login-2FA flows for password/MFA users. Current Google/GitHub sessions
restart their provider OAuth flow, using `/auth/me`'s `two_factor_provider`, not
linked account providers or `primary_auth`. Fresh interactive provider sign-in
satisfies the binding-action second factor (Max decision, backend `15c89274`).
`SECOND_FACTOR_ENROLLMENT_REQUIRED` routes to existing Settings enrollment at
`/dashboard/settings?redirect=<encoded confirmation>#security`. Successful
enrollment keeps backup codes visible until Done, refreshes the session, and
returns only to an exact `/confirm/<uuid>?t=<token>` path. A legacy
`SECOND_FACTOR_REQUIRED` for an unenrolled password session follows enrollment
too. No recovery path automatically confirms or loops to plain password login.
The settings re-auth dialog is unsuitable: its re-auth token does not stamp
the retained session's MFA time. Provider and email callbacks use the existing
auth return helper. After sign-in, the user reviews again and clicks Confirm.

Backend `cea28992` supplies an authoritative hashed snapshot under `summary`:
`client_display_name`, `requested_at` (aware ISO timestamp), `effect`, and a
nonempty string dictionary `binding_terms`. These appear prominently before
Confirm. Licence-bearing summaries also require `license_hash`, `license_name`,
`license_version`, and `license_url`; the name/version link opens HTTPS or a
safe local licence page. Other snapshot fields remain available as escaped
request details. There is no second licence form.

Missing/blank/invalid required display content disables Confirm with a clear
message. `SUMMARY_CONTENT_UNAVAILABLE` blocks confirmation too. Contract caveat:
this backend commit emits that code at creation, but malformed stored content
on GET/list/decision yields HTTP 503 `CONFIRMATION_UNAVAILABLE`; that also leaves
the page non-actionable. No display text is inferred from IDs or hashes, and
Confirm continues to submit the backend's exact `summary_hash`.

Vitest includes receipt and publish snapshots produced by the pinned backend
summary builder/schema with synthetic locked facts, plus missing-content,
unenrolled-password, MFA, Google/GitHub recovery and safe enrollment returns.
These are frontend/static contract checks; they do not prove live execution.

Use Node 22 and the lockfile. Run `rtk npm test -- pending-actions`,
`rtk npm run lint`, `rtk npm run typecheck`, and `rtk npm run build`.
The confirmation route must serve `Cache-Control: no-store`,
`Referrer-Policy: no-referrer` and CSP `frame-ancestors 'none'`.
Live flag-on proof belongs to the authorized release work; this build does not
enable flags or deploy.

On an exact confirmation URL, terminal shared-client refresh clears the session
but leaves routing to this page. It reads API admission first, then shows either
inert 404 or sign-in with the intact continuation.
