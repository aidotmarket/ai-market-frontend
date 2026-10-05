# Custom licence text in the seller form

The seller enters a title and Markdown terms. The frontend submits both to
`POST /licenses/custom` and shows a verified saved preview only after the response text, title,
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

## T-2026-000878 frontend implementation

The existing textarea keeps the source verbatim while a small labelled toolbar
inserts Markdown at its selection (heading, bulleted/numbered list, bold, italic).
The live preview does not count as reading the verified licence. One shared
`CustomLicenseMarkdown` display renders the live and verified seller previews
and the buyer's verified custom-text reading dialog. Standard documents and
historical PDF display retain their existing reading surfaces.

The renderer permits headings, lists, bold and italic only. A remark transform
replaces every unsupported node with its literal source slice before conversion
(including HTML, images, links, code and reference definitions). The text handler
preserves whitespace; terms without supported formatting retain exact literal
text. A restricted rehype-sanitize schema permits only the display tags, with no
URL attributes. No raw HTML plugin, editor framework or new dependency is used.
Only display is transformed: source submission, normalization, both hashes,
verified Blob bytes, document contracts and legal/read callbacks stay unchanged.
Editing through the toolbar uses the same invalidation as typing.

Backend matching PDF remains a separate portion of this same ticket; this
frontend candidate does not complete T-2026-000878. Focused verification includes
CustomLicenseMarkdown, SellerLicenseSelection, LicenseReadingDialog,
ListingLicenseDisclosure (hash and buyer rendering cases), and listingLicenses.
