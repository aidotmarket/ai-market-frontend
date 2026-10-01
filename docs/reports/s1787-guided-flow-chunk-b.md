# S1787 chunk B: guided seller listing frontend

Implemented the approved frontend chunk in the assigned detached checkout, based on `ac0e0e40072329d96cc5d2dca09b39037989ebdb`. Publish only to `build/guided-flow-chunk-b-s1787`.

Authority: `aidotmarket/runbooks` origin/main `specs/BQ-SELLER-GUIDED-LISTING-FLOW-S1787-GATE1.md`, sections 2.1–2.6, chunk B and AC1–5, AC7 frontend, AC8; Max's T-877 walkthrough at `/Users/max/koskadeux-state/s1787/t877-thread.md`. Backend schemas and endpoint shapes inspected at `3586cc1d`.

## Delivered scope

- One pure saved-progress function and shared task names; six tasks plus Your listings. Removed the static SellerJourney card. Checklist appears on every tab, in a wide-screen right column and a collapsible phone bar, with text and icons, one Next step, account-setup delegation, publication link and start-another action.
- Page-owned source, category, review and publication reads. Existing versioned draft store, object browser, licence selection, approval, publication and account-setup actions are reused. Approval and publication require current saved progress; unsaved edits withdraw completion. Current server review refusals also withdraw step 4 and show the reason.
- Next saves changes before advancing. Unchanged saved choices need no save button or save request. Failures retain the step and show the reason; partial sample reconciliation explains that the files committed and requires finishing the sample choice. Saved files hydrate immediately after reload and subsequent changes use the saved source version.
- Source-bound Allai suggestions, private-metadata disclosure, public-text warning and fixed suggestion-location hint. No browser source summary. Changed files clear suggestions/chat; late or mismatched replies are discarded. Only acceptance of the matching description or explicit confirmation stamps its source; manual description edits clear the stamp.
- Categories from the seller endpoint, allowing empty drafts. A legacy non-slug stays stored through unrelated edits until a seller picks a new value.
- Separate licence task. With licences enabled the dead free-text input disappears and preview uses the real selection; the existing input remains when off. One labelled reading dialog is shared by seller and buyer, with focus trapping, Escape, focus return, full text and a new-tab link. Opening both documents unlocks confirmation; buyer byte verification remains in place. Summary expansion alone does not count as reading.

No backend changes, new libraries or new flags. Backend A2 category admission, spec 2.7/chunk C, production deployment and Max's live sign-off are outside this delivery.

## Verification

- Typecheck: passed, exit 0.
- Lint: exit 0, zero errors, six pre-existing image warnings outside changed files.
- Full Vitest: 1,453/1,453 tests passed in 144 files (259 suites), zero skipped. Relevant seller-workspace, buyer and dialog coverage: 237 tests in 25 files. Base archive with the same Node compatibility setting: 1,407/1,407 tests in 137 files (246 suites) passed. Net new coverage: 46 tests.
- Playwright: 2/2 passed, at 1280px and 390px, using the actual workspace page and synthetic HTTP responses. Each walk reloads and resumes the saved file selection, saves an empty-category licence, accepts Allai's draft, approves and publishes using checklist/Next. Exactly one source PUT and two draft PUTs; no duplicate saves. Dialog keyboard behaviour is checked in Chromium and Vitest.
- Production Next build: exit 0, 50/50 static pages generated. Workspace route: 37.4 kB, 191 kB first-load JS.
- `git diff --check`: passed.

Exact successful validation commands (log redirections included):

```sh
rtk npm ci
rtk npm run typecheck
rtk proxy sh -c 'rtk npm run lint > /tmp/s1787-final-lint.log 2>&1'
rtk proxy sh -c 'rtk proxy env NODE_OPTIONS=--no-experimental-webstorage npm test -- --reporter=json --outputFile=/tmp/s1787-final-tests.json > /tmp/s1787-final-tests.log 2>&1'
rtk proxy sh -c 'rtk proxy npx playwright test --config=playwright.preview.config.ts tests/preview-browser/guided.pw.ts > /tmp/s1787-final-browser.log 2>&1'
rtk proxy sh -c 'rtk proxy env API_URL=https://api.ai.market NEXT_PUBLIC_API_URL=https://api.ai.market KEYSTATIC_GITHUB_CLIENT_ID=local-build-fixture KEYSTATIC_GITHUB_CLIENT_SECRET=local-build-fixture KEYSTATIC_SECRET=local-build-fixture-only-not-a-live-secret NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=local-build-fixture npm run build > /tmp/s1787-final-build.log 2>&1'
rtk git diff --check
```

## Limits and observed issues

Plain `rtk npm run build` compiles but fails page collection without the existing Keystatic environment. The successful build reuses the documented build-only fixtures from `docs/reports/s1716-s1294-p1-frontend.md`; those are not live credentials and this build is not a deployment.

Node v25.6.0's native Web Storage caused 41 failures in the first unconfigured full test run. Disabling it for jsdom resolves those failures. An unchanged gateway page polling test (`confirms exact description text, polls to described, and renders columns`) failed transiently during repeated full-suite checks; the final full run passes. The noted seller-workspace page timing flake did not fail in the final run. No test was skipped or changed to suppress either timing issue.

Browser evidence uses synthetic endpoints, not live storage, a live model, real money or production publication. Backend A2 remains necessary for server-enforced category slugs. Production acceptance and Max's sign-off remain to be done by the owner.

## Changed files and size

39 files; 954 added lines, 134 removed lines; net +820 lines (including tests, browser fixtures and this report).

- `api/sellerListingDraft.ts`
- `api/sellerListingReview.ts`
- `api/sellerListingSource.ts`
- `app/dashboard/seller-workspace/page.test.tsx`
- `app/dashboard/seller-workspace/page.tsx`
- `components/BuyButton.test.tsx`
- `components/BuyButton.tsx`
- `components/LicenseReadingDialog.test.tsx`
- `components/LicenseReadingDialog.tsx`
- `components/ListingLicenseDisclosure.tsx`
- `components/onboarding/SellerSetupProgressBar.tsx`
- `components/seller-workspace/GuidedListingFlow.test.tsx`
- `components/seller-workspace/GuidedListingFlow.tsx`
- `components/seller-workspace/GuidedPublishStep.tsx`
- `components/seller-workspace/SavedLicenseStep.test.tsx`
- `components/seller-workspace/SavedLicenseStep.tsx`
- `components/seller-workspace/SavedListingEditor.test.tsx`
- `components/seller-workspace/SavedWorkspaceData.guided.test.tsx`
- `components/seller-workspace/SavedWorkspaceData.test.tsx`
- `components/seller-workspace/SavedWorkspaceData.tsx`
- `components/seller-workspace/SellerApproval.tsx`
- `components/seller-workspace/SellerLicenseSelection.test.tsx`
- `components/seller-workspace/SellerLicenseSelection.tsx`
- `components/seller-workspace/SellerListingDraftStore.tsx`
- `components/seller-workspace/SellerListingEditor.guided.test.tsx`
- `components/seller-workspace/SellerListingEditor.tsx`
- `components/seller-workspace/SellerPublication.tsx`
- `components/seller-workspace/SellerReview.tsx`
- `components/seller-workspace/WorkspaceData.guided.test.tsx`
- `components/seller-workspace/WorkspaceData.test.tsx`
- `components/seller-workspace/WorkspaceData.tsx`
- `components/seller-workspace/WorkspaceOverview.tsx`
- `components/seller-workspace/listingSteps.test.ts`
- `components/seller-workspace/listingSteps.ts`
- `docs/reports/s1787-guided-flow-chunk-b.md`
- `docs/seller-workspace-interface.md`
- `tests/guidedListingFixture.ts`
- `tests/preview-browser/guided.pw.ts`
- `tests/preview-browser/main.tsx`

## Gate 3 R1 review fold (2026-10-01)

Continued from `1e30e6572bf2b3ea33a85b1dff4a0aeae017bed7` in the assigned detached checkout. New commits only; publication remains limited to `build/guided-flow-chunk-b-s1787`. Reviews: codex2 `response-20261001-072757-464194-ea681538.md` (REVISE) and DeepSeek `response-20261001-072754-705014-a622c23a.md` (AWN).

- F1: a refreshed Review with different source or draft versions immediately withdraws step 4 with a recovery reason. Reload the authoritative source and draft through the real provider, then re-read Review. Approval stays disabled until versions and description binding agree. Failed reconciliation stays blocked with a refresh action; each refresh attempts reconciliation once per reported version pair, avoiding repeated reads on persistent divergence. A current server missing-fields refusal withdraws step 4.
- F2: licences enabled with drafts unavailable now explains that the licence cannot be saved, offers Describe and price as the preparation step and asks the seller to return when drafts are available. It never shows perpetual loading or sends a draft save.
- F3: corrected the original file counts above using the original JSON artifacts: candidate 144 files / 259 suites, base 137 files / 246 suites.
- DeepSeek 1: pre-stamp drafts still show the warning and leave step 4 incomplete until a matching Allai description or “This description matches my files” confirms them. Opening the page does not write a stamp or save a draft. A server-provided approval matching the current source and draft remains visible and counted as approved if the missing stamp is the only description issue; a new approval remains blocked. Saving a confirmation still changes the backend draft/review binding and requires a new approval, as before. Changed sources, mismatched versions, other invalid fields and server refusals receive no exemption.
- DeepSeek 2–5: licence checklist state is skipped when licences are off; Your listings empty-state copy uses Describe and price; the editor without draft saves hides Next: Review; categories validate the array and every slug/name pair, with malformed responses entering read recovery.

Regression coverage uses the real draft provider and real Review/approval UI: externally changed source and draft, initially enabled approval becoming unavailable, current missing-field refusal, failed reload, pre-stamp approval preservation without saves, malformed category payloads, unavailable licences without saves, skipped licences and the legacy editor's hidden Next.

### R1 verification

- Typecheck: exit 0.
- Lint: exit 0; zero errors, six existing image warnings.
- Full Vitest with `NODE_OPTIONS=--no-experimental-webstorage`: 1,463/1,463 passed in 145 files (260 suites), zero skipped. R1 adds 10 tests and one test file; total chunk-B gain over the original base is 56 tests..
- Guided Playwright: 2/2 passed (1280px and 390px), synthetic HTTP fixtures using the actual workspace page.
- Next production build: exit 0; 50/50 static pages. Seller workspace 37.8 kB, 191 kB first-load JS. Same documented build-only Keystatic fixtures as the original run.
- Diff whitespace check: passed.

The full-suite rerun encountered the already documented unchanged gateway polling timing failure (1,462 passed / 1 failed); no test was skipped or altered to hide it. A subsequent full rerun is recorded below. The strengthened real-approval regression file also passed 7/7 separately.

R1 logs: `/tmp/s1787-r1-lint.log`, `/tmp/s1787-r1-tests.json`, `/tmp/s1787-r1-tests.log`, `/tmp/s1787-r1-browser.log` and `/tmp/s1787-r1-build.log`. Commands are the original validation commands above with `s1787-r1` artifact names; npm subprocesses also run through `rtk`. These are local fixture checks, not production deployment or live acceptance.

### R1 changed files

14 files changed relative to the R1 base; 148 added lines, 17 removed lines; net +131 lines.

- `api/sellerListingSource.ts`
- `components/seller-workspace/GuidedListingFlow.reconciliation.test.tsx`
- `components/seller-workspace/GuidedListingFlow.test.tsx`
- `components/seller-workspace/GuidedListingFlow.tsx`
- `components/seller-workspace/SavedLicenseStep.test.tsx`
- `components/seller-workspace/SavedLicenseStep.tsx`
- `components/seller-workspace/SellerListingDraftStore.tsx`
- `components/seller-workspace/SellerListingEditor.guided.test.tsx`
- `components/seller-workspace/SellerListingEditor.tsx`
- `components/seller-workspace/SellerPublications.tsx`
- `components/seller-workspace/SellerReview.tsx`
- `components/seller-workspace/listingSteps.test.ts`
- `components/seller-workspace/listingSteps.ts`
- `docs/reports/s1787-guided-flow-chunk-b.md`
