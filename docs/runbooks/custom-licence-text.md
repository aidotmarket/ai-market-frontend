# Custom licence text in the seller form

The seller enters a title and plain text terms. The frontend submits both to
`POST /licenses/custom` and shows a preview only after the response text, title,
size, and hashes pass verification. Editing the title, text, or AI training choice
clears that preview and the prior approval.

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
