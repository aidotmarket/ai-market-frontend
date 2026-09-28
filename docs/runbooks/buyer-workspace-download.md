# Buyer workspace download

## Browser paths

`WorkspaceDownload` uses `showDirectoryPicker` when the browser exposes it. The
buyer chooses a subfolder, then a fresh numbered folder receives the files.
When the picker is absent, **Download files** requests the same allocation and
saves verified files one at a time to the browser's usual Downloads location.
The browser may ask the buyer to allow multiple downloads. This path holds one
complete file in memory as a Blob, so a very large file may fail on a device
with little available memory. Each file's object URL stays alive until the next
file is ready (or 30 seconds, or cancel/unmount), so at most one saved Blob is
retained while the next file is fetched.
The fallback rejects the whole purchase before fetching any file if any file is
over 1,000,000,000 bytes (1 GB); use Chrome, Edge, or another browser that can
save to a folder for larger files. The download allowance is still consumed by
that attempt, because file sizes arrive with the allocation.

## Checks and recovery

Both paths use `saveWorkspaceFile` for the per-file grant, signed `If-Match`
fetch, expiry, filename, and byte-count checks. The fetch goes directly from
seller storage to the buyer's browser with credentials omitted. A 412 means the
seller's file changed; 403/404 on the grant means access is unavailable. A
cancelled operation stops the current grant or fetch; previously saved files
remain. An allocation retry reuses the pending request ID.

Run `rtk npm test -- components/orders/WorkspaceDownload.test.tsx components/orders/workspaceDownloadStream.test.ts`,
then `rtk npm run lint`, `rtk npm run typecheck`, and `rtk npm test` after edits.
On Node 25, use `rtk proxy env NODE_OPTIONS=--no-experimental-webstorage npm test`
so jsdom owns `localStorage`.
