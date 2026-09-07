# Seller Workspace interface

The seller dashboard now includes a journey overview, storage management, and a scoped file browser with temporary file selection. This is an incomplete frontend increment toward the browser seller journey.

## Agreed seller journey, September 7

Max approved: **Connect storage → Choose what to sell → Describe and price it → Review and publish.** Profiling is not a mandatory step or primary navigation item. Optional listing assistance belongs inside listing preparation; marketplace data verification remains a separate offering. This product decision supersedes the earlier UI projection of W3 profiling as a required selling step.

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

Next: persistent source selection, seller-authored listing description, price and license, exact seller review, then workspace publication/delivery. Cloudflare R2 setup remains unfinished. Optional listing assistance can be added within the editor; it must not become a prerequisite for listing. Existing manual listings remain at `/dashboard/listings`; this interface never sends a workspace draft through the legacy publication path.

Backend contract gap: the inspected object-list endpoint currently shares the W3 profile capability gate. The frontend respects that availability gate without asking the seller to run a profile. Independent source-discovery availability must be established server-side before this flow can work when profiling is disabled. No feature flags or provider resources are changed here.

## Verification

- 62 focused tests across the API, Workspace page, dashboard layout, and preparatory data/activity components, including existing connection lifetime/rotation tests and source selection without analysis.
- TypeScript and focused ESLint pass; whitespace validation is clean.
- Next production compilation and type validation succeed. Final page collection cannot finish in the isolated checkout because the existing Keystatic GitHub credentials are absent. This is not a successful full production build.
- Normal Chrome local preview with synthetic fixtures exercises desktop storage, file search, result inspection, empty and disabled states, and mobile setup. At a phone viewport the document has no horizontal overflow. These are UI checks, not production/AWS integration evidence.

Preview fixtures and the local preview server live outside this repository. They are not included in the production application.
