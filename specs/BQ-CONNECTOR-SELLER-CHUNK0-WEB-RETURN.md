# Chunk 0 fresh company sign-in frontend

Contract read at backend `ab0a6be461c7af7e27a5b80f7e2d64ce08a26555`,
including `fb545f135debf4fd8e504b627fb50cd1486a4d50` and
`specs/BQ-CONNECTOR-SELLER-CHUNK0-COMPATIBILITY.md`. Backend remains unchanged.

Build-time `NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED=true` enables this transport.
It defaults off; off preserves the previous controls and login routing. Assumption:
operators enable it only alongside backend `ORG_SSO_NATIVE_TOTP_ENROLLMENT_ENABLED`.
No backend capability field advertises this return transport. Server setup
eligibility continues to govern enrollment; Google/GitHub behavior is unchanged.

Enrollment and lost-authenticator recovery authorize with `/dashboard/settings`;
binding-action fresh login authorizes with `/confirm/<lowercase UUID>`. The
organization slug is entered as Company sign-in ID because `/auth/me` does not
supply it. No organization is inferred from email or selected for a decision.

Sign-in opens in a popup. This preserves the original confirmation link credential
in the original page's memory: the backend pending-action read and decision still
require that credential, while the new return path forbids queries. No credentials
or continuation state are written to browser storage. Popup navigation explicitly
sends an origin-only Referer to satisfy initiation admission even from confirmation
pages with no-referrer headers. Backend owns OIDC state, nonce, factor form and
Secure HttpOnly cookies. The frontend observes only an exact same-origin path
with no query/fragment, skips popup hydration to avoid concurrent refresh-cookie
rotation, closes the popup, refreshes the cookie session and verifies
the same company user through `/auth/me`. Local return detection is navigation
coordination, not authentication or proof; server setup/decision guards remain
mandatory. Setup restarts with a new secret; recovery resumes at backup-code entry;
review reloads under the new session and requires explicit Confirm plus native
TOTP reauthentication. It never automatically decides or disables a factor.

Backend refusal/expired-state responses stay on the backend origin, with no
frontend error redirect in this contract. The frontend explains how to close that
window and retry; closure, a ten-minute timeout, account change or a malformed
same-origin return produces a retry. It does not invent error query parameters.

Operational limits: HTTPS, exact FRONTEND_URL and credentialed refresh cookies
must be configured; backend process-local OIDC state requires the same worker and
survives no restart. Browser popup blocking or IdP opener isolation may interrupt
this flow and display retry. Closing/reloading the original page loses its in-memory
confirmation credential; reopen the original assistant link. Browser/IdP validation
against the Gate 3 backend is still required before enabling the frontend flag.
