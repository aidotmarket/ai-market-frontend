# S1719 frontend no-content-gate implementation

Authority: `/var/tmp/koskadeux/s1719-max-decision-no-content-gate.md`.

Scope: browser viewer of seller-published verified sample previews. This branch
does not merge or deploy anything.

## Recorded implementation choices

1. Policy admission is an exact pair whitelist: legacy
   `aim-preview-policy-v1` / `1.0.0` and seller-attested
   `aim-preview-policy-v2` / `2.0.0`. Unknown or mismatched pairs fail closed.
   Neither accepted pair runs a browser content corpus. `scan_verdict=passed`,
   proof signatures, the scan-attestation digest, and the recomputed exact
   fetched-leaf-list digest remain required.
2. The following gates remain unchanged after direct code-path audit:
   - The platform envelope signature is verified before seller signing keys are
     admitted or used.
   - Seller disclosure, commitment, and per-proof signatures remain required.
   - Merkle inclusion is checked for every manifest proof and again for every
     fetched package row.
   - The ordered sample hash remains bound to both the signed proof order and
     the fetched package order.
   - Checkpoint signature, log inclusion, and predecessor consistency remain
     required.
   - A fresh manifest is fetched and fully reverified immediately before a
     display handle is issued.
   - Seller transport remains direct HTTPS with omitted credentials, no
     referrer, redirect refusal, public-host admission, and bounded streaming.
   - Optional column labels remain joined only after the signed-payload hash and
     signed revision identity match.
   - The package and table modules remain lazy-loaded only after explicit
     **View sample** activation.
   - Verified rows remain only in React component memory and are cleared on
     visibility/page lifecycle changes.
3. Rendering derives an inert text representation without changing verified
   row values. Unicode control, format, and surrogate code points (`Cc`, `Cf`,
   `Cs`) become the visible replacement character. Scalar and nested values use
   text nodes only; long text retains the existing truncate/expand affordance.
   Formula-looking strings remain ordinary text.

No production code change was needed for item 2; this audit is the item artifact.

## Item 4 transport inventory

Response `Content-Type`, response `Cache-Control`, response
`Content-Encoding`, and declared `Content-Length` are not admission gates. Fetch
handles CORS and decompression; the viewer parses JSON itself and enforces the
limit against bytes actually delivered to JavaScript. The signed media-type
label is retained for wire compatibility but its value is not judged. Seller
subdomains on the shared public `r2.dev` service are admitted.

Every condition retained on the display path is technical or cryptographic:

- URL: syntactically valid, visible ASCII, at most 2,048 characters, HTTPS,
  DNS hostname with a public-looking suffix, no credentials, query, fragment,
  backslash, invalid port, localhost/private-use suffix, IP literal/alias, or
  platform-owned origin. These prevent credential leakage, ambiguous URL
  identity, insecure transport, private-network access, and platform row
  transit. DNS and connected-address enforcement remains the browser/network's
  responsibility.
- Fetch: browser-only, credential-free CORS GET, omitted referrer, redirect
  refusal, request cache bypass, non-opaque successful response, live abort
  signal, readable body, and five-second component deadline. These are direct
  transport, privacy, lifecycle, and CORS requirements.
- Bounds/parser: streamed delivered-body ceiling, JSON parse, 100 rows, 25
  displayed fields, 250,000 canonical row bytes, 1 MiB envelope, depth 16,
  10,000 nodes, and bounded manifest/proof/schema structures. These prevent
  resource exhaustion and ensure the verified wire format can be interpreted.
- Wire identity: closed supported profiles, exact v1/1.0.0 or v2/2.0.0 policy
  pair, required seller confirmations, supported table/tabular schema and
  logical types, canonical values, and valid timestamps/identifiers. These are
  parser compatibility or signed authorization requirements, not content
  judgments.
- Cryptography: platform envelope before seller-key trust; seller disclosure,
  commitment and proof signatures; schema/row/attestation/fetched-leaf/sample
  digests; every Merkle inclusion; log checkpoint signature, inclusion and
  consistency; approval/freshness; exact signed manifest bindings; and final
  fresh manifest identity. These establish provenance, exact membership,
  authorization, freshness, and non-equivocation.
- Rendering: only an in-memory verified handle with the supported table type
  and signed column identity may mount. Values become neutralized text nodes;
  no cell-derived element, HTML, URL, network request, or persistence exists.

## Item 5 fixture and tests

The named AIM Data branch was present at
`58bece43e7ef24fd884556ba2130c8675ec84281`, but contained no published v2
shared fixture. The frontend therefore carries a provisional fixture following
the existing policy fixture structure at
`tests/fixtures/preview/aim_preview_policy_v2.json`, pinned locally by
`aim_preview_policy_v2.sha256`. Its SHA-256 is
`acd9ff50afd097f93a8bc1aa348a5c5bfaed8477f62d71ee2351086e447702e0`.
This file and hash must be replaced and re-pinned byte-for-byte when AIM Data
publishes the canonical shared fixture.

Tests cover exact v1/v2 pair admission, unknown/mismatched pair refusal, the
attestation and fetched-leaf digest bindings, ordinary display of dates,
places, email, URLs, 2,000-word prose, UUIDs, hashes, phone numbers, negative
decimal text, formulas, control/format/surrogate code units, literal XSS text,
and the existing cryptographic mutation suite. The obsolete browser
deterministic corpus and its generator were removed.

## Validation

- `rtk proxy npx tsc --noEmit`: exit 0.
- `rtk proxy npx vitest run --maxWorkers=1`: 101 files / 960 tests; 100
  files and 959 tests passed. The sole failure was the known origin/main
  baseline `app/login/LoginForm.test.tsx` test `shares one flight between a
  manual click and subsequent hinted hydration`, with the unchanged
  `oauth_nonce` storage assertion.
- `rtk proxy npx eslint components/listings lib/listing-preview tests`: exit 0
  with 0 errors and 2 warnings in unchanged `SellerShareControls.tsx` and
  `ShareKitModal.tsx` (`@next/next/no-img-element`).
- `rtk proxy npx vitest run lib/listing-preview components/listings/ListingSamplePreview.test.tsx components/listings/SampleTable.test.tsx --maxWorkers=1`:
  7 files and 169 tests passed.
- `rtk proxy python3 scripts/preview-mutations.py`: all 6 cryptographic/current
  pointer mutations produced observed assertion failures.

## Risks and scope boundary

- The v2 fixture is provisional until AIM Data publishes the canonical shared
  file; its bytes and SHA must then be re-pinned.
- Browser JavaScript cannot independently verify DNS resolution or the connected
  peer address. Public-host/CORS/private-network behavior still needs live
  seller-origin integration evidence.
- Lone surrogate code units are retained for signed canonical JSON and replaced
  only in rendered text. Cross-language producers must preserve the same escaped
  JSON representation for cryptographic parity.
- Response media/cache/encoding headers are intentionally non-authoritative;
  protection relies on credential-free CORS Fetch, parseability, request cache
  bypass, and the actual streamed-byte cap.
- Scope is the frontend browser viewer, its fixtures/tests, mutation harness,
  runbook and this report. No backend/AIM Data code, merge, deployment or live
  provider state was changed.

## Files changed

- `components/listings/ListingSamplePreview.tsx`
- `components/listings/ListingSamplePreview.test.tsx`
- `components/listings/SampleTable.tsx`
- `components/listings/SampleTable.test.tsx`
- `lib/listing-preview/policy.ts`
- `lib/listing-preview/policy.test.ts`
- `lib/listing-preview/verifier.ts`
- `lib/listing-preview/wire.ts`
- `lib/listing-preview/transport.ts`
- `lib/listing-preview/types.ts`
- `lib/listing-preview/registry.ts`
- `lib/listing-preview/primitives.ts`
- `lib/listing-preview/adversarial.test.ts`
- `lib/listing-preview/api.test.ts`
- `tests/previewFixture.ts`
- `tests/fixtures/preview/aim_preview_policy_v2.json`
- `tests/fixtures/preview/aim_preview_policy_v2.sha256`
- `tests/fixtures/preview/aim-preview-policy-v1-deterministic-vectors.json`
  (deleted)
- `tests/fixtures/preview/aim-preview-policy-v1-deterministic-vectors.sha256`
  (deleted)
- `scripts/preview-mutations.py`
- `scripts/preview-policy-vectors.py` (deleted)
- `docs/runbooks/listing-sample-preview.md`
- `docs/reports/s1719-no-content-gate-implementation.md`
