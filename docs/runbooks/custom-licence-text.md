# Custom licence text in the seller form

The seller enters a title and plain text terms. The frontend submits both to
`POST /licenses/custom` and shows a preview only after the response text, title,
size, and hashes pass verification. Editing the title, text, or AI training choice
clears that preview and the prior approval.

The seller data step loads the saved listing draft before enabling licence save.
An unloaded or failed draft read must never be used as an empty draft for a save.
On a version conflict, reload the draft and keep the seller's unsaved licence
choice visible. Save is disabled when the complete choice already matches the
saved draft. Standard licence, rider, and covenant Read links use the local
`/licenses/...` page without `?download=1`; the page fetches JSON and renders
full text. Only explicit `?download=1` requests use the backend attachment rewrite.

The submit response must be HTTP 201 with exactly the eight required fields.
For a custom text document, the buyer view requires `text/plain; charset=utf-8`,
`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, the
matching source and licence SHA-256 headers, and the listing's `.txt` attachment
filename. It verifies the fetched bytes against both hashes before showing text
or enabling acceptance. Its verified Blob download uses `custom-licence.txt`.

For a title-only resubmission refused with `LICENSE_DOCUMENT_INVALID`, show the
stored title only when a verified submission in the current form session supplied
it for the same canonical text and AI training choice. A fresh form session has
no verified title to display; show the refusal without a title guess. Never use
an unverified response or the seller's proposed title as the stored title.

Check with `rtk proxy npm run lint`, `rtk proxy npm run typecheck`, and
`rtk proxy npm test -- --maxWorkers=1`. The focused cases are in
`components/seller-workspace/SellerLicenseSelection.test.tsx`.
