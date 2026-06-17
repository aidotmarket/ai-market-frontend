# Gate-2 Implementation Spec — 2FA Login Challenge (Web Frontend)

- **BQ:** BQ-AI-MARKET-WEB-2FA-LOGIN-CHALLENGE-S927
- **Builds from:** Gate-1 design rev 2 (`specs/BQ-AI-MARKET-WEB-2FA-LOGIN-CHALLENGE-S927-GATE1.md`)
- **Scope:** frontend-only, `ai-market-frontend`. NO backend change. OIDC SSO out of scope.
- **Builder:** MP (Codex). **Reviewer != builder:** Gate-3 audit by AG + DeepSeek (MP excluded as builder).
- **Authored:** mars / S934

## A. Backend contract (consume as-is — do NOT modify backend)

| Endpoint | Request | Success | Challenge / Errors |
|---|---|---|---|
| `POST /api/v1/auth/login` | existing | `TokenResponse` | `PreAuthRequiredResponse{pre_auth_token, requires_2fa:true, expires_in:300}` |
| `POST /api/v1/auth/magic-link/verify` | existing | `TokenResponse` | same challenge shape |
| OAuth callback (`google`/`github`) | existing | `TokenResponse` | same challenge shape |
| `POST /api/v1/auth/2fa/verify` | `{pre_auth_token, code}` | `TokenResponse` (sets same-site refresh cookie) | `400 "Invalid verification code"`; `401 "2FA session expired"` (expiry or 5-attempt cap) |

`code` accepts TOTP OR backup code (one field). Pre-auth token TTL 300s, single-use.

## B. Types (`api/auth.ts` / `@/types`)

```ts
export interface PreAuthRequiredResponse {
  pre_auth_token: string;
  requires_2fa: true;
  expires_in: number; // seconds, e.g. 300
}
export type LoginResult = TokenResponse | PreAuthRequiredResponse;

export function isTwoFactorChallenge(r: LoginResult): r is PreAuthRequiredResponse {
  return (r as PreAuthRequiredResponse).requires_2fa === true;
}
```

`login()`, `magicLinkVerify()`, `oauthCallback()` return `Promise<LoginResult>` (was `Promise<TokenResponse>`).

ADD:
```ts
export function verify2FALogin(pre_auth_token: string, code: string): Promise<TokenResponse>;
// POST /api/v1/auth/2fa/verify  body {pre_auth_token, code}
```

## C. Store (`store/auth.ts`)

State: `pendingTwoFactor: { preAuthToken: string; expiresAt: number /* absolute epoch ms */ } | null` (default null).

- `completeSession(tokenRes: TokenResponse)` — shared completion extracted from current login success: set in-memory access token, `getMe()` hydrate, set `isAuthenticated`, clear `pendingTwoFactor`. Reused by login / magic-link / oauth / `verifyTwoFactor`.
- `login` / `magicLinkVerify` / oauth completion: if `isTwoFactorChallenge(res)` -> set `pendingTwoFactor = { preAuthToken: res.pre_auth_token, expiresAt: Date.now() + res.expires_in*1000 }`, do NOT set `isAuthenticated`, return a discriminated result so the caller renders the challenge. Else `completeSession(res)`.
- `verifyTwoFactor(code)` -> `verify2FALogin(pendingTwoFactor.preAuthToken, code)`; on success `completeSession`; on `400` surface inline invalid-code (keep challenge open); on `401` `clearPendingTwoFactor()` + signal caller to return to login.
- `clearPendingTwoFactor()` — sets `pendingTwoFactor=null`. MUST be called on: success, expiry, lockout/`401`, logout, and on store hydrate/reload init.

## D. Component `<TwoFactorChallenge>` (shared)

Props: `{ onVerified?: () => void }` (reads `pendingTwoFactor` + actions from the store). Behavior:
- One text input, accepts authenticator code OR backup code; helper text "Enter the 6-digit code from your authenticator app, or use a backup code."
- Submit -> `verifyTwoFactor(code)`. Disabled while in-flight and when countdown == 0.
- Inline error on `400` ("Invalid verification code"), input stays for retry.
- On `401` / expiry -> clear and route back to the login entry point with a "session expired, please sign in again" notice.
- Countdown rendered mm:ss from `pendingTwoFactor.expiresAt` (absolute target; recompute remaining = expiresAt - Date.now() on each tick — M5). At 0 -> auto-reset + redirect to login (M2).
- On unmount / back-nav -> `clearPendingTwoFactor()` (M3).

## E. Wiring (three surfaces, same component)

- `app/login/LoginForm.tsx` (password)
- `app/auth/verify/page.tsx` (magic link)
- `app/auth/oauth/[provider]/callback/page.tsx` (Google/GitHub)

Each: after its auth call, if the store now has `pendingTwoFactor`, render `<TwoFactorChallenge>` in place of completing/redirecting; on verified, run that surface's normal post-login redirect.

## F. Acceptance criteria (mandates as gates)

- [ ] **M1** `pre_auth_token` lives only in store memory — grep proves no `localStorage`/`sessionStorage`/cookie write and no telemetry/analytics call carries it.
- [ ] **M2** Countdown reaching 0 auto-resets state and redirects to login.
- [ ] **M3** `pendingTwoFactor` cleared on success, expiry, lockout, logout, unmount, back-nav, and reload/hydrate.
- [ ] **M4** No error path, log line, toast, or telemetry event includes `pre_auth_token` or `code`.
- [ ] **M5** Countdown derived from absolute `expiresAt`, not accumulated `setInterval` deltas.
- [ ] Backend untouched (diff is frontend files only).
- [ ] All three surfaces prompt -> verify -> complete; backup code works in the same field.
- [ ] Non-2FA accounts: unchanged behavior (regression-clean).

## G. Tests

Unit/component (jest/RTL): challenge detection sets `pendingTwoFactor` and withholds auth; `verifyTwoFactor` success completes session; `400` keeps challenge + shows inline error; `401` clears + routes to login; countdown reaches 0 -> reset; unmount clears state; M1/M4 (no token/code in storage or logged payloads). Store: `completeSession` parity across all four entry points.

## H. Gate-4 (real browser, post-deploy, Max-in-the-loop — curl NOT valid)

Enable 2FA on a test account, then verify: password + magic-link + Google + GitHub each prompt -> code -> signed in -> **hard refresh holds** (same-site cookie); backup-code path; wrong-code x5 -> lockout; expiry -> restart; abandon -> state cleared; non-2FA regression pass.
