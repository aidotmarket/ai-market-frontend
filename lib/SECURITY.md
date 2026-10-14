# Security Notes

## Browser session authentication and CSRF

The access token is held in memory in the [Zustand auth store](../store/auth.ts), without persistence to localStorage or cookies. The [API client](../api/client.ts) attaches it as `Authorization: Bearer <access_token>`.

The browser refresh token is separate: the backend stores it in the `refresh_token` cookie with `HttpOnly`, `SameSite=Lax` and `Path=/api/v1/auth`. `Secure` is conditional on production configuration (`ENVIRONMENT`, `RAILWAY_ENVIRONMENT` or `PRODUCTION`), as implemented in backend `app/core/auth_cookies.py`.

The frontend refresh request is `POST /api/v1/auth/refresh` with `{}` and `withCredentials: true`. In backend `app/api/v1/endpoints/auth.py`, this route uses `allowed_origin_refresh_cookie` to read the cookie only when the request's `Origin` matches a configured `CORS_ORIGINS` entry. This cookie-origin guard is specific to refresh; Bearer authentication and these cookie attributes do not establish universal CSRF immunity.

For background refresh with `SameSite=Lax`, the frontend and API must be same-site; `https://ai.market` and `https://api.ai.market` satisfy this requirement, while the raw Railway API host is cross-site. See the canonical [browser-session-auth runbook](https://ops.ai.market/docs/browser-session-auth.md) for operational troubleshooting. These notes describe source behavior, not verified production browser session persistence or cookie acceptance.
