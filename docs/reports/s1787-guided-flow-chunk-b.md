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
- Full Vitest: 1,453/1,453 tests passed in 259 files, zero skipped. Relevant seller-workspace, buyer and dialog coverage: 237 tests in 25 files. Base archive with the same Node compatibility setting: 1,407/1,407 tests in 246 files passed. Net new coverage: 46 tests.
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
