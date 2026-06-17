# Gate-1 Design — 2FA Login Challenge (Web Frontend)

- **BQ:** BQ-AI-MARKET-WEB-2FA-LOGIN-CHALLENGE-S927
- **Pillar:** ai.market
- **Priority:** P1
- **Process class:** auth_ui_feature (frontend-only)
- **Gate-1 status:** APPROVED — unanimous (S931), rev 2 is the Gate-1 artifact
- **Authored / reconstructed to repo:** mars / S934 (canonical content from Living State `build:bq-ai-market-web-2fa-login-challenge-s927`)

## 1. Problem

Accounts with 2FA (TOTP) enabled cannot complete sign-in on the ai.market website. The backend correctly issues a pre-auth challenge instead of a token, but the web frontend ignores the challenge: `api/auth.ts` reads `tokenRes.access_token` unconditionally and there is no login-time verify call (only the 2FA *setup* UI exists). Affected: every 2FA-enabled account, via password login, magic-link verify, and Google/GitHub OAuth callback. Evidence (S927 prod read): `max@kisa.cat` (totp_enabled=TRUE) is locked out; accounts with totp_enabled=FALSE log in fine. The only difference is the 2FA flag.

## 2. Scope

**In scope (the three paths that already return the challenge):** password login, magic-link verify, and Google/GitHub OAuth callbacks. Detect the pre-auth challenge, prompt for an authenticator-or-backup code via one shared `<TwoFactorChallenge>` component, call `POST /auth/2fa/verify`, then establish the in-memory access token + cookie session exactly as a normal login.

**Out of scope:** any backend change (backend is complete — see §4); **OIDC SSO**, which does NOT route through the challenge and is a distinct P0 (`BQ-AI-MARKET-OIDC-SSO-TOTP-BYPASS-S931`). The `<TwoFactorChallenge>` component is built to be reusable by that P0 later, but its SSO wiring is not part of this BQ.

## 3. Root cause

For password login, magic-link verify, and OAuth callbacks, the backend `_build_auth_success_response` (`app/api/v1/endpoints/auth.py`) returns `PreAuthRequiredResponse` instead of a token when `totp_enabled` + `totp_secret_enc` are set. The deployed frontend (`ai-market-frontend` `api/auth.ts` + `store/auth.ts`) has no challenge handling and no login-time verify function, so a 2FA account is left signed out with no prompt. (Corrected S931: the earlier claim that OIDC SSO also routes through `_build_auth_success_response` is FALSE — OIDC is the separate P0.)

## 4. Backend contract (verified S930 + independently re-traced S931 — no change needed)

- `POST /api/v1/auth/login`, `POST /api/v1/auth/magic-link/verify`, OAuth callbacks: return `TokenResponse` OR `PreAuthRequiredResponse{ pre_auth_token: str, requires_2fa: true, expires_in: 300 }`.
- `POST /api/v1/auth/2fa/verify` (DISTINCT from `2fa/verify-setup`): body `TOTPVerifyRequest{ pre_auth_token, code }` -> `TokenResponse`. On success `_build_token_response_for_request(request, response)` sets the same-site refresh cookie, so the session establishes exactly like a normal login and the S916 reload fix carries over.
- The single `code` field accepts a TOTP code OR a backup code (TOTP tried first, then backup-code fallback).
- Rate limiting: 5-attempt lockout; `400 "Invalid verification code"` on a wrong code; `401 "2FA session expired"` on expiry or after the attempt cap. Pre-auth token TTL = 300s, single-use.

## 5. Design direction (pure frontend)

1. Add a `PreAuthRequiredResponse` type and widen `login` / `magicLinkVerify` / `oauthCallback` return types to `TokenResponse | PreAuthRequiredResponse`.
2. Store: on a challenge response, set `pendingTwoFactor { preAuthToken, expiresAt }` and STOP (do not set `isAuthenticated`); add `verifyTwoFactor(code)` which POSTs to `/auth/2fa/verify` and, on success, runs the SAME post-login completion path as a normal login (set in-memory access token, hydrate user via getMe, redirect). DRY this as `completeSession(tokenRes)`.
3. One shared `<TwoFactorChallenge>` component wired into all three entry surfaces: single code field (authenticator OR backup, with a "use a backup code" hint), submit, inline error on `400`, `401` -> clear state and return to login, and a countdown.

Backend untouched. Final sign-off is a real-browser test per `runbooks/browser-session-auth.md`.

## 6. Binding mandates (Gate-1, folded into the Gate-2 spec)

- **M1** `pre_auth_token` is memory-only — never persisted to storage and never sent to telemetry.
- **M2** When the countdown reaches 0, auto-reset state and redirect to login.
- **M3** Clear `pendingTwoFactor` on success, expiry, lockout, logout, component unmount, back-navigation, and app reload (hydrate).
- **M4** Errors must never include or log the `pre_auth_token` or the `code` value.
- **M5** Countdown is computed from an absolute target timestamp (no `setInterval` drift).

## 7. Frontend touch points

- `api/auth.ts`: `login()`, `magicLinkVerify()`, `oauthCallback()` widen to the union; ADD `verify2FALogin(pre_auth_token, code)` -> `POST /auth/2fa/verify`; ADD `isTwoFactorChallenge(res)` guard (`requires_2fa === true`); ADD `PreAuthRequiredResponse` type.
- `store/auth.ts`: `login` and `magicLinkVerify` (and oauth path) detect the challenge and hold `pendingTwoFactor` rather than treating it as failure; ADD `verifyTwoFactor(code)`; `completeSession(tokenRes)` shared completion; `clearPendingTwoFactor()`.
- UI: shared `<TwoFactorChallenge>` reused by `app/login/LoginForm.tsx`, `app/auth/verify/page.tsx` (magic link), `app/auth/oauth/[provider]/callback/page.tsx`.

## 8. Council verdicts (S931)

Round 1: MP=REJECT (caught the real OIDC SSO 2FA-bypass gap), AG=APPROVED_WITH_MANDATES (doc-only), DeepSeek=APPROVE_WITH_NITS (doc-only). Corrected to rev 2 (OIDC scoped out to its own P0, contract fixed, mandates folded). Round 2: MP re-confirmed APPROVED -> unanimous. Open store-shape decision resolved unanimously to option A (global store, memory-only, cleared per M3).

## 9. Gate-4 verification requirement

Real browser only (curl is NOT valid sign-off, per `runbooks/browser-session-auth.md`): enable 2FA on a test account; verify password, magic-link, and Google/GitHub OAuth each prompt -> code -> signed in -> hard refresh holds; backup-code path; wrong-code x5 lockout; expiry restart; abandon clears state; non-2FA regression. Requires a deploy + Max-in-the-loop browser check.
