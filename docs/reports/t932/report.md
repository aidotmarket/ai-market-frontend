# T932 frontend implementation evidence

Implemented the original T932 account-settings change and retained seller-wizard addition in the assigned checkout. Application source was tested at local author commit `0cd0b3986c6da0c2591dabc8637f4c6f3f6ab1c8`; a later browser-fixture followup uses an obvious short fake token, with application source unchanged. The final publication commit contains the corrected source and all evidence, directly descended from the assigned base. Base: `bc6125162706df1c51b952237a20e847d5a3ce15`. Publication branch: `codex/s1766-t932-provider-signin-frontend`. Original local author/evidence history is preserved at `refs/t932-preserved/original-author-history`. Publication uses the same corrected final tree in one commit; it does not rewrite any remote or peer history.

Read before edits: the original private ticket JSON at the supplied path and the exact backend contract from candidate `e4ba2c4e072d74409b868771fda138d32eff1c76`. File hashes, environment and locations are recorded in [environment-contract.json](environment-contract.json). No private ticket body is published. The implementation uses existing configured author tooling; no model configuration was changed.

## Delivered behavior

- Authenticated `/auth/me` current-request eligibility/reason/provider/seller assurance/reauth fields are typed and consumed. Account provider links and `primary_auth` do not identify the current session.
- Google/GitHub current sessions without native TOTP hide native enrollment and explain provider-managed sign-in security without claiming observed MFA. Backend 409 refusals stop setup/verification UI. A policy change hides pending native enrollment. Enabled native TOTP disable/recovery controls and the existing protected flows remain.
- Settings/dashboard and the payment-method prompt use returned reauth methods, including existing magic-link reauth despite a legacy password. Email requires Send link; no automatic email or provider-reauth shortcut is added. Existing action-token expiry, audiences, link verification, native-code/password checks and CSRF/rate/ownership contracts remain backend-owned and unchanged.
- Seller dashboard/wizard consume server missing steps and current seller security satisfaction. Stripe remains a separate server readiness step. Provider sign-in is shown complete without setting native `totp_enabled=true`. Stale `/me` assurance cannot erase a current capability missing-step refusal.
- Actual wizard navigation retains profile/company settings targets and Stripe onboarding. Both legacy publication and guided workspace publication refresh server capabilities after confirmed publication; the guided checklist falls back to actual missing steps, without inventing profile work.
- Stripe setup/return and AWS/R2 cloud refusal prompts refer to sign-in security. Provider availability, active/suspended ownership, idempotency, scope, authorization expiry, payout readiness and publication guards are preserved.
- Older-server fallback is explicit in [the runbook](../../runbooks/provider-signin-two-factor-setup.md). Missing fields do not infer provider/native MFA or introduce restrictions on unrelated workflows.

## Verification

Node 22.23.3, matching the existing frontend CI runbook; dependencies from the unchanged package lock. All shell commands and explicitly launched tool subprocesses use RTK.

| Check | Result | Evidence |
|---|---|---|
| Focused policy, settings/reauth, seller wizard, Stripe return, payment setup/return, AWS/R2, publication, guided checklist and legacy edit tests | 15 files / 186 tests passed | [focused-policy.txt](focused-policy.txt) |
| Full suite, earlier run | 156 files / 1,615 tests passed, before the final small additions | [vitest-node22.txt](vitest-node22.txt) |
| Full suite, final source | 155 files passed, 1 failed; 1,617 tests passed, 1 failed | [vitest-final.txt](vitest-final.txt) |
| Gateway file isolated on assigned base | 53 passed | [baseline-gateway.txt](baseline-gateway.txt) |
| Same gateway file isolated on candidate | 53 passed | [candidate-gateway.txt](candidate-gateway.txt) |
| Typecheck | Exit 0 | [typecheck-final.txt](typecheck-final.txt) |
| Lint | Exit 0; six existing image-element warnings, no errors | [lint-final.txt](lint-final.txt) |
| Production build with local fixture API and explicitly fake Keystatic config | Exit 0 | [build-final.txt](build-final.txt) |
| Actual built Next pages, intercepted API only | 9 passed; 1440px/390px provider settings, navigation, Stripe refusal, explicit magic link, publication-triggered setup, cloud refusal, native/password/SSO controls | [render.txt](render.txt) |
| Existing guided-listing browser suite | 2 passed; 1280px and 390px full checklist → publish | [existing-guided-render.txt](existing-guided-render.txt) |
| Source diff checks | Passed; T935 consent/ConnectedApps paths have zero diff from assigned base | Git/source commit |

The final full-suite failure is the unchanged gateway test “confirms exact description text, polls to described, and renders columns,” at its fake-timer `getByText('safe')` assertion (line 276). It passes in isolated runs on both base and candidate. No gateway source/test was edited, and this evidence is not a claim of a fully green final suite or a proven baseline reproduction of the intermittent failure. The new T932 outcomes remain independently covered. The owned baseline checkout `/var/tmp/t932-baseline-0cd0b39` is preserved.

Initial Node 25 full-suite execution failed connector/browser-storage assertions; Node 22 removes those failures without changing tests or fixtures. Initial build attempts used WHATWG-blocked local ports 9 and 4190, then a permitted local port 4201; final build serves honest empty public data from `tests/t932/build-api.mjs`. No production API or real secret was used. Two initial browser assertions matched Next's route announcer as well as the cloud refusal; narrowing the alert locator fixed the test, with no product change.

Screenshots and request receipts are in this directory; image hashes are in [screenshots-sha256.json](screenshots-sha256.json). Desktop settings and mobile dashboard, wizard, reauth and cloud-refusal renders were visually inspected. The existing floating wizard can be collapsed to inspect underlying content; no ConnectedApps or consent visual repair is included. Provider request receipts record explicit fake magic-link calls and zero native-enrollment, payment setup-session or connector grant calls. The legacy publish fixture simulates the server capability transition; it does not execute the backend first-publish transaction. The separate existing guided browser tests exercise the saved listing/checklist/publication UI using isolated fixtures.

Initial publication attempts were rejected by the bridge secret scanner on a fake browser access token, including its earlier unpublished commit. The fixture now uses the obvious short literal `test`; no real credential was involved. Browser verification was repeated after the fixture change. The original local history is preserved, and the corrected final tree is published in one new commit from the assigned base so every published commit passes normal history scanning. The scanner/hook was not changed or bypassed, and the push is non-forced.

## Remaining review and live gaps

HOLD9495 stays active. No deployment, merge, ticket/BQ update, production write, real email, real Stripe/cloud operation or real connector grant occurred. Mars's `app/oauth/connect/page.tsx`, consent flow and ConnectedApps repair remain untouched.

Backend candidate has no PR yet and must integrate T618/current main before release. Root full auth review of the exact frontend/backend candidates and authorized live acceptance remain required. Live acceptance still needs actual Google and GitHub sessions (including unknown legacy passwords), separate password/native TOTP/SSO/recovery controls, wizard/first-publish transitions, real email delivery and Stripe/cloud readiness behavior. Local frontend fixtures prove rendering, navigation, requests and refusal handling; they do not establish live identities, provider MFA, backend token enforcement, actual publication transactions or provider operations.
