# S1794 — Terms fees anchor

Business value: YES. Pricing and registration links now have a fees target in
the current Terms renderer, with clearance below the sticky header. Approved
estimate: 15–30 minutes. PR only; no merge or deployment performed.

## Pinned source and scope

- Assigned base: `68aa10719828b868b55a2da18fce4deeb18a58f7`.
- Public read-only GETs on 2026-10-08, 08:49 UTC:
  `https://api.ai.market/api/v1/legal/terms/current` and its
  `/api/v1/legal/terms/document` URL both returned HTTP 200.
- Served version: `1.2`; effective date: `2026-10-01T16:54:03Z`.
- Document SHA-256, independently calculated and matching metadata:
  `b401b7b1cd4810fc1bed789d0efec8a6971dcdb057fb767f3923d87ad25d3977`.
- Live `https://ai.market/legal/terms` rendered
  `<h2>5. Commission, transaction costs, payment, and tax</h2>` without a
  `fees` ID. The document contains 20 h2 headings, including the summary.
- Existing links: `app/pricing/page.tsx` and
  `app/register/RegisterForm.tsx` (the latter preserves its redirect query).
- `StaticTerms.tsx` already has `id="fees"` on its Section 5 section and
  `scroll-mt-24`; no fallback change is needed.

Only the exact known numbered Section 5 h2 title receives `id="fees"` and
`scroll-mt-24` in ReactMarkdown. The margin is 6rem with the default Tailwind
spacing, above the 64px sticky header in `components/Layout.tsx`. Legal text,
document fetching/hash/validation, auth, payments and rehype-sanitize are
unchanged.

## Validation

Used the existing frontend runbook at
`/Users/max/Projects/ai-market/runbooks/ai-market-frontend.md`, repository CI
scripts, Node 22.23.3 and the committed npm lockfile.

- Focused Terms/pricing tests: 2 files, 10 tests passed. Existing SSR tests
  check the anchor in versions 1.1/1.2 and fallback parity; existing hash and
  invalid-document refusal checks still pass. The 1.2 fixture matches the live
  document byte-for-byte after substituting the live effective date.
- Full suite with `CI=true`: 168 files, 1,961 tests passed.
- `npm run typecheck -- --incremental false`: passed.
- `npm run lint`: passed, with six existing Next.js image warnings.
- Initial `npm run build`: compiled, then failed on missing local Keystatic
  configuration. Retry passed using the explicitly fake build-only values
  already documented in `docs/reports/s1716-s1294-p1-frontend.md` and
  `docs/runbooks/provider-signin-two-factor-setup.md`; no credentials accessed.
- Built Next server GET `/legal/terms`, using the public live API: exactly one
  `<h2 id="fees" class="scroll-mt-24">5. Commission, transaction costs, payment, and tax</h2>`;
  the other 19 h2 headings remain unanchored. Compiled CSS includes
  `.scroll-mt-24{scroll-margin-top:calc(var(--spacing) * 24)}`.
- `git diff --check`: passed. No browser scroll or deployed candidate proof
  is claimed; this is local SSR and compiled CSS evidence.

Full untruncated private logs, GET bodies/headers and SSR results are retained
at `/var/tmp/s1794-terms-fees-evidence/`, including both build attempts.
