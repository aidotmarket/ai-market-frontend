# Seller Workspace interface

The seller dashboard now includes a journey overview, storage management, and a scoped file browser with temporary file selection. This is an incomplete frontend increment toward the browser seller journey.

## Agreed seller journey, September 7

Max approved: **Connect storage → Choose what to sell → Describe and price it → Review and publish.** Profiling is not a mandatory step or primary navigation item. Allai is central to listing preparation: she drafts the description and metadata tags, then the seller reviews and approves. Marketplace data verification remains a separate offering.

## Allai editor

The reference is AIM-DATA's `frontend/src/pages/DatasetDetail.tsx`: generated title/description/category/tags, field navigation, embedded chat, Looks good / Change it, and seller acceptance. The web editor follows that interaction model in a Prepare with Allai section, with manual edits and seller-controlled price/license.

The listing assistant has a separate typed request/response boundary. It accepts the seller's brief, draft metadata, active field and instruction; it returns a message and bounded proposed changes to the four allowed metadata fields. Proposals do not overwrite fields until accepted. Price, license, ownership and publication are not allowed proposal fields. Leaving the editor aborts a pending request. Explicit private draft saving is available only when the backend capability enables it; saving never publishes.

The authenticated adapter now uses `/seller-workspace/listing-assistant` when the master and `listing_assistant` capability permit it. Listing context never goes to the public support endpoint. Max selected existing starter credits for this flow: the backend reserves and settles that allowance without paid fallback or a new grant. Insufficient credit leaves the draft editable. Unknown responses retry with the same request identity; stale responses cannot clear a newer retry identity. Without the capability, assistant submission stays disabled.

Normal Chrome exercised the actual HTTP adapter and credit ledger with an isolated synthetic seller and model. Suggestions required acceptance and saved through the private draft endpoint. Live provider behavior and production deployment remain unverified. Companion backend PR 342 contains both the draft and assistant migrations, all default off.

## Behavior

- AWS S3 and Cloudflare R2 both have visible provider cards, including when storage is unavailable. The AWS action follows the server capability gate. R2 is represented explicitly with its unfinished setup status and no enabled connection action; showing the provider does not claim its integration is complete.

- Storage connections retain the existing create, trust setup, verify, rotate, and disconnect contracts. Setup values remain in memory only and are cleared when changing workspace sections. Setup and result headings receive keyboard focus when opened.
- Connection cards foreground the bucket, folder, region, and verification time. Technical identifiers are under Connection details.
- Choose what to sell lists current objects from a verified connection using its exact pinned prefix. It displays file names as text, supports opaque-cursor pagination, and searches only loaded files. Checkboxes select object bindings in page memory and display count and size. Switching connections or leaving the screen discards selection. Saving to a listing is explicitly unavailable. Browsing and selection never create selectors, start jobs, retrieve evidence, or analyze file contents.
- Profiling activity and evidence components are not mounted or linked in the seller flow. Their preparatory code does not add a verification requirement or integrate with the separate marketplace verification offering.
- The existing server-owned master/connect gate remains in place. Profile reads are additionally gated on an explicitly enabled, available profile stage. Unknown capability states do not enable actions. API failures use fixed seller-facing errors, never raw provider responses.
- Dashboard navigation stacks above the content on small screens, with horizontal scrolling confined to navigation and wide tables.

## Existing backend contracts used

`GET /seller-workspace/connections/{id}/source-objects`, `GET /seller-workspace/profile-jobs`, `POST /seller-workspace/profile-jobs/{id}/cancel`, and `GET /seller-workspace/profile-evidence/{id}`. The common client adds `/api/v1`. Object discovery uses `version_mode=current`, limit 100, the connection's pinned prefix, and the returned opaque cursor. Activity pages use limit 50.

## Remaining journey

Next: permitted metadata context, exact seller review, then workspace publication/delivery. Cloudflare R2 connection remains unfinished. Allai should do most drafting/tagging work; manual editing remains available and separate marketplace verification is not a listing prerequisite. Existing manual listings remain at `/dashboard/listings`; this interface never sends a workspace draft through the legacy publication path.

Independent AWS file discovery is implemented in the companion backend, default off behind `SELLER_WORKSPACE_AWS_DISCOVERY_ENABLED`. The frontend now requires `providers.aws.discovery`, calls `/connections/{id}/source-objects`, and does not infer availability from the profiling stage. The old profiling objects route remains separately gated. Normal Chrome showed file selection with synthetic profiling explicitly disabled. Real AWS proof and production enablement remain outstanding.

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

## Private listing preview

Preview my listing brings current title, description, category, deduplicated tags, USD price and license together. It includes unsaved edits and explicitly remains private. Brief/chat/unaccepted proposals are excluded. Missing fields and invalid prices show placeholders; there is no publish button or recorded approval. Two focused tests and normal Chrome verified this view. Source binding and final versioned approval remain outstanding.

## Saved file selection

When `sources` and independent discovery are available, Choose what to sell loads the account's working selection before mounting the picker. Explicit Save selected files sends at most ten file identities to the owner-scoped backend; file contents never pass through the frontend or Allai. Unknown save outcomes retry the same request identity/version. A stale save preserves local choices and asks for a refresh; failed initial reads block a misleading empty picker. The restored selected-file list remains visible even when a file is outside the currently loaded page. Connection version changes require choosing and saving again. Clearing checkboxes is a local edit; this increment does not delete a saved source record.

Normal Chrome saved a synthetic file through the actual local source HTTP service and restored it after reload, with profiling disabled. Backend preview used real PostgreSQL and envelope encryption with a test-only KMS implementation and synthetic metadata, not live AWS. Three focused frontend tests cover restoration, exact retry and failed-read recovery. Source selection is not publication, and final approval/source-version binding remains outstanding.

## Review saved listing

The new Review listing section loads the backend's coherent saved draft/source view when the review capability is enabled. It refreshes when re-entered and can be refreshed explicitly, distinguishes saved fields from the editable preview, reports missing fields and uses safe recovery messages. It has no approval or publish action yet. The public-sample requirement is pending a product answer; browser integration for this new saved-review route remains to be exercised in a unified local backend fixture. TypeScript, ESLint and focused frontend tests pass.

## Shared saved-state verification

The local preview now uses the actual draft, source, assistant accounting and saved-review routes against one isolated PostgreSQL database. Normal Chrome verified that saving a $25 price updates the review, an unsaved $99 edit does not change it, and synthetic Allai proposals leave price/license and saved fields unchanged until accepted and saved. External metadata/model calls and KMS are synthetic; this is not live provider or production proof.

Connection selection is disabled while a source save is pending, with a shared request guard across picker instances. Newer checkbox edits survive the earlier save response. Retrying a failed file read no longer resets local choices to the original saved selection. The focused picker/review suite passes 15 tests; TypeScript and focused ESLint pass. Final sample approval, publication/delivery and the actual R2 connection remain incomplete.

## Exact inert saved presentation

Saved review now returns one deterministic HTML document and its SHA-256 digest under presentation version `seller-listing-review-v2`. The review binding includes that digest alongside saved public/source versions. The frontend verifies the UTF-8 document digest before displaying it in an empty-sandbox iframe with no referrer. The document has a deny-by-default content policy, fixed bundled styles, escaped seller text and no scripts or external resources. It is a prepared render, not a stored approval or pixel-level attestation. Later approval/publication must retain and reuse this exact artifact, not reconstruct a different public view.

Thirteen backend render/review tests pass, including active-HTML/resource injection, price changes, invalid prices and private-field exclusion. Eight frontend transport/render tests pass, including changed bytes, unsupported presentation versions, oversized content, cancellation and sandbox attributes. TypeScript and focused ESLint pass. Normal Chrome showed the actual sandboxed saved title, description, tags, $25 price and license from the shared synthetic backend. No approval/publication action has been enabled.

The existing marketplace disclosure schema and service explicitly support `sample_decision=none` as well as approved rows. Preserve this product capability in the new contract, but never infer a seller's choice or a product-policy answer from silence. No sample decision is selected automatically.

## Explicit approval screen

SellerReview now displays server-provided confirmation statements when the approval stage is available. The seller explicitly chooses no public sample and confirms ownership, privacy, price/license and public discovery; all boxes start unchecked. Approval waits for the verified presentation frame to load. A saved receipt restores on refresh; any changed saved review resets the controls. Unknown responses retain the request identity, stale conflicts require refresh, and navigation ignores late results. This step saves approval only; publication and public sample preparation remain unfinished.

Normal Chrome verified the real local approval endpoint/service/migration against synthetic data: $25 approval saved and survived refresh, while a saved $30 price required fresh unchecked confirmation. Focused tests, TypeScript and ESLint pass. No production action occurred.

Approval review additionally displays the saved source filenames and sizes in a separate private section. They are never inserted into the public HTML presentation. The source summary is owner-only, decrypted under the saved review's locks and checked against its source version. A PostgreSQL-backed HTTP test verifies the source summary, matching receipt and foreign-owner denial; a frontend test checks that filenames remain outside the public iframe. The final frontend approval/render/transport run passed 13 tests.
