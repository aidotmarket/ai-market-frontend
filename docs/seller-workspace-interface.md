# Seller Workspace interface

The seller dashboard now includes a journey overview, storage management, a scoped file browser, and profiling activity with result inspection. This is a frontend increment toward the browser seller journey in `seller-workspace-cloud-listing-delivery.md`; it does not complete W3, W4, or W5.

## Behavior

- AWS S3 and Cloudflare R2 both have visible provider cards, including when storage is unavailable. The AWS action follows the server capability gate. R2 is represented explicitly with its unfinished setup status and no enabled connection action; showing the provider does not claim its integration is complete.

- Storage connections retain the existing create, trust setup, verify, rotate, and disconnect contracts. Setup values remain in memory only and are cleared when changing workspace sections. Setup and result headings receive keyboard focus when opened.
- Connection cards foreground the bucket, folder, region, and verification time. Technical identifiers are under Connection details.
- Your data lists current objects from a verified connection using its exact pinned prefix. It displays file names as text, supports opaque-cursor pagination, and searches only loaded files. Switching connections discards old responses and data. Browsing does not create selectors or start jobs.
- Profiling activity lists jobs, supports explicit refresh and pagination, displays observed counts, and requests cancellation only after a seller confirmation. Cancellation sends the observed version and a stable idempotency key; `cancel_requested` is never represented as cancelled.
- Completed evidence shows field positions, observed types, missing values, and sensitivity/quality findings. It discloses partial results and distinguishes observed rows from total source rows. No raw field names or cells are required.
- The existing server-owned master/connect gate remains in place. Profile reads are additionally gated on an explicitly enabled, available profile stage. Unknown capability states do not enable actions. API failures use fixed seller-facing errors, never raw provider responses.
- Dashboard navigation stacks above the content on small screens, with horizontal scrolling confined to navigation and wide tables.

## Existing backend contracts used

`GET /seller-workspace/connections/{id}/objects`, `GET /seller-workspace/profile-jobs`, `POST /seller-workspace/profile-jobs/{id}/cancel`, and `GET /seller-workspace/profile-evidence/{id}`. The common client adds `/api/v1`. Object discovery uses `version_mode=current`, limit 100, the connection's pinned prefix, and the returned opaque cursor. Activity pages use limit 50.

## Remaining journey

Starting a new profile still needs the seller runtime setup/recovery, immutable object selection, estimate receipt, and explicit cost acknowledgement interface. W4 listing preparation and public-sample approval, and W5 workspace publication/delivery are not implemented here. Existing manual listings remain at `/dashboard/listings`; this interface never sends a workspace draft through the legacy publication path. R2 remains unavailable. No feature flags or provider resources are changed.

## Verification

- 61 focused tests across the API, Workspace page, dashboard layout, and data/activity components, including existing connection lifetime/rotation tests.
- TypeScript and focused ESLint pass; whitespace validation is clean.
- Next production compilation and type validation succeed. Final page collection cannot finish in the isolated checkout because the existing Keystatic GitHub credentials are absent. This is not a successful full production build.
- Normal Chrome local preview with synthetic fixtures exercises desktop storage, file search, result inspection, empty and disabled states, and mobile setup. At a phone viewport the document has no horizontal overflow. These are UI checks, not production/AWS integration evidence.

Preview fixtures and the local preview server live outside this repository. They are not included in the production application.
