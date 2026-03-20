## Task State

- Status: completed
- Current step: committed password reset frontend changes
- Notes:
  - Confirmed relevant files: `api/auth.ts`, `app/login/LoginForm.tsx`, `components/Toast.tsx`
  - Confirmed existing app-router `Suspense` pattern from login/register pages
  - Added `forgotPassword` and `resetPassword` helpers in `api/auth.ts`
  - Added `/forgot-password` and `/reset-password` frontend pages
  - Updated login form to link to `/forgot-password`
  - Verified with `npm run build`
