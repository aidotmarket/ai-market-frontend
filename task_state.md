Task: Frontend Auth UI - Magic Link Login + 2FA Settings

Status: completed

Progress:
- Created scratchpad file.
- Inspecting existing auth API, login form, settings page, and shared types.
- Identified that `refreshAuth()` refreshes tokens only, which would leave settings UI stale after profile and 2FA changes.
- Patching auth types/API/store, then implementing magic link login and dashboard 2FA UI.
- Main feature code is in place.
- Running a review pass for JSX/TypeScript issues before build verification.
- Build caught a type narrowing issue in the 2FA verification button state; patched and re-running verification.
- Verified with `npm run build`.
- Remaining caveat: disable/regenerate 2FA flows still need a real frontend re-auth token source; placeholder TODOs are in place.
