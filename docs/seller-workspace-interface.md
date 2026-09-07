# Seller Workspace interface

The seller dashboard now includes a journey overview, storage management, and a scoped file browser with temporary file selection. This is an incomplete frontend increment toward the browser seller journey.

## Agreed seller journey, September 7

Max approved: **Connect storage → Choose what to sell → Describe and price it → Review and publish.** Profiling is not a mandatory step or primary navigation item. Allai is central to listing preparation: she drafts the description and metadata tags, then the seller reviews and approves. Marketplace data verification remains a separate offering.

## Allai editor

The reference is AIM-DATA's `frontend/src/pages/DatasetDetail.tsx`: generated title/description/category/tags, field navigation, embedded chat, Looks good / Change it, and seller acceptance. The web editor follows that interaction model in a Prepare with Allai section, with manual edits and seller-controlled price/license.

The listing assistant has a separate typed request/response boundary. It accepts the seller's brief, draft metadata, active field and instruction; it returns a message and bounded proposed changes to the four allowed metadata fields. Proposals do not overwrite fields until accepted. Price, license, ownership and publication are not allowed proposal fields. Leaving the editor aborts a pending request. Explicit private draft saving is available only when the backend capability enables it; saving never publishes.

Live assistant connection remains unfinished. The existing website Allai chat sends to `/api/allai/support/anonymous/message`, a public-support/retrieval surface; the editor does not send seller drafting context there. Without a listing assistant adapter, generation and chat submission are disabled with an explicit unavailable state. The local preview injects synthetic responses from outside the application repository. Permitted source metadata and live assistant generation remain to be connected. Private draft persistence is implemented in companion backend PR 342 and tested locally; production deployment remains outstanding.

## Behavior

- AWS S3 and Cloudflare R2 both have visible provider cards, including when storage is unavailable. The AWS action follows the server capability gate. R2 is represented explicitly with its unfinished setup status and no enabled connection action; showing the provider does not claim its integration is complete.

- Storage connections retain the existing create, trust setup, verify, rotate, and disconnect contracts. Setup values remain in memory only and are cleared when changing workspace sections. Setup and result headings receive keyboard focus when opened.
- Connection cards foreground the bucket, folder, region, and verification time. Technical identifiers are under Connection details.
- Choose what to sell lists current objects from a verified connection using its exact pinned prefix. It displays file names as text, supports opaque-cursor pagination, and searches only loaded files. Checkboxes select object bindings in page memory and display count and size. Switching connections or leaving the screen discards selection. Saving to a listing is explicitly unavailable. Browsing and selection never create selectors, start jobs, retrieve evidence, or analyze file contents.
- Profiling activity and evidence components are not mounted or linked in the seller flow. Their preparatory code does not add a verification requirement or integrate with the separate marketplace verification offering.
- The existing server-owned master/connect gate remains in place. Profile reads are additionally gated on an explicitly enabled, available profile stage. Unknown capability states do not enable actions. API failures use fixed seller-facing errors, never raw provider responses.
- Dashboard navigation stacks above the content on small screens, with horizontal scrolling confined to navigation and wide tables.

## Existing backend contracts used

`GET /seller-workspace/connections/{id}/objects`, `GET /seller-workspace/profile-jobs`, `POST /seller-workspace/profile-jobs/{id}/cancel`, and `GET /seller-workspace/profile-evidence/{id}`. The common client adds `/api/v1`. Object discovery uses `version_mode=current`, limit 100, the connection's pinned prefix, and the returned opaque cursor. Activity pages use limit 50.

## Remaining journey

Next: seller-owned listing assistant backend and permitted metadata context, persistent source selection, exact seller review, then workspace publication/delivery. Cloudflare R2 connection remains unfinished. Allai should do most drafting/tagging work; manual editing remains available and separate marketplace verification is not a listing prerequisite. Existing manual listings remain at `/dashboard/listings`; this interface never sends a workspace draft through the legacy publication path.

Backend contract gap: the inspected object-list endpoint currently shares the W3 profile capability gate. The frontend respects that availability gate without asking the seller to run a profile. Independent source-discovery availability must be established server-side before this flow can work when profiling is disabled. No feature flags or provider resources are changed here.

## Verification

- 65 focused tests across the API, Workspace page, dashboard layout, source selection, and Allai editor, including no-send without an adapter, explicit proposal acceptance, protected price/ownership fields, failure recovery and request cancellation on exit.
- TypeScript and focused ESLint pass; whitespace validation is clean.
- Next production compilation and type validation succeed. Final page collection cannot finish in the isolated checkout because the existing Keystatic GitHub credentials are absent. This is not a successful full production build.
- Normal Chrome local preview with synthetic fixtures exercises desktop storage, file search, result inspection, empty and disabled states, and mobile setup. At a phone viewport the document has no horizontal overflow. These are UI checks, not production/AWS integration evidence.

Preview fixtures and the local preview server live outside this repository. They are not included in the production application.
# Guided cloud storage setup

## Private account draft saving

When backend `master.enabled` and `drafts.enabled/status=available` permit it, Prepare with Allai loads the seller's private working draft before editing. The seller explicitly saves brief/title/description/category/tags/price/license with Save private draft. The backend version and request identity protect competing tabs and retries. Save responses never overwrite newer local edits; unknown outcomes and conflicts keep the local draft. A read failure blocks opening a misleading empty draft. AWS connection availability does not gate draft preparation.

Contract: GET/PUT `/seller-workspace/listing-draft`; PUT contains `content`, `expected_version`, `request_id`. Backend companion branch `codex/seller-listing-drafts` adds a default-off capability and database migration. This is one working draft per seller; source selection, unaccepted proposals and chat are not saved. It is not publication or full W4 completion. Preview uses the actual endpoint/service through an isolated local synthetic account. Browser save/reload restored the title, description and license. Production not deployed or enabled.

## Temporary workspace progress

Visited workspace sections now remain mounted while hidden. Listing edits, accepted and pending Allai proposals, chat and file selection survive switching sections. Hidden sections are excluded from the accessible page; data browsing only mounts on first visit. Connection identity/version changes still reset file selection, and authorization material still clears on section changes. Leaving the editor aborts its pending assistant request; a late response cannot replace newer work after returning.

Unsubmitted changes, chat and file selections remain in memory and are lost when leaving or reloading. Explicitly saved listing fields restore from the account draft endpoint when enabled. Browser proof uses synthetic files and a synthetic listing title.

Both provider cards offer a browser-based guide for customers starting without storage: account, private bucket, upload files, return to connection. Existing customers can skip to the connection step. Provider links open in another tab; navigation does not verify an account, create resources, upload files, or enable a connection. AWS handoff preserves the existing capability gate. R2 ends with the actual unavailable connection status. No passwords, keys or billing details are collected by the guide.

Instructions checked against official documentation on 2026-09-07:
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/r2/buckets/create-buckets/
- https://developers.cloudflare.com/r2/objects/upload-objects/
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html

Guide state is temporary and resets when closed or unmounted. Three focused interaction tests cover existing-storage handoff, capability enforcement, and R2's unavailable boundary. Normal Chrome verified both guides in the synthetic preview.
