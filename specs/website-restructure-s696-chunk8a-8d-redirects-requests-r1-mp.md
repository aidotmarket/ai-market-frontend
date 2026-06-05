# PR #15 Review: S696 Chunk 8a+8d Redirects + Sitemap + Requests Polish

Branch: `spec/bq-ai-market-website-restructure-s696-gate2-chunk8a-8d`
HEAD reviewed: `e5f9561de7f471a7979de52926abd2a041f55d1c`
Branch SHA used as diff base: `db1721874f88f7a6a67b7285494dda21d2dc238c`

Overall: APPROVE

## Per-Anchor Verdict

1. Redirects (§6.1): PASS
   - `next.config.ts:7` `/download/aim-channel` -> `/sell-data`, `permanent: true`
   - `next.config.ts:8` `/download` -> `/sell-data`, `permanent: true`
   - `next.config.ts:9` `/download/aim-node` -> `/partner#technology-partner`, `permanent: true`
   - `next.config.ts:10` `/run-federated-learning` -> `/aim-federate`, `permanent: true`
   - No additional redirect entries are present in `redirects()`.
   - `rewrites()` for `/llms.txt` and AI discovery remains present at `next.config.ts:13`.

2. Query-string preservation (§6.1 acceptance test): PASS
   - Redirect entries use Next.js `redirects()` with `permanent: true` at `next.config.ts:7-10`; Next.js preserves query strings by default.
   - `/download/aim-node` destination includes the required fragment at `next.config.ts:9`.
   - Curl-based smoke test wiring is deferred validation per review protocol and is not requested for this chunk.

3. Sitemap + robots (§6.4): PASS
   - Added `/find-data` at `app/sitemap.ts:34`.
   - Added `/sell-data` at `app/sitemap.ts:40`.
   - Added `/run-federated-learning` at `app/sitemap.ts:46`.
   - Added `/aim-data` at `app/sitemap.ts:52`.
   - Added `/aim-federate` at `app/sitemap.ts:58`.
   - Retained `/aim-node` at `app/sitemap.ts:64`.
   - Added `/partner` at `app/sitemap.ts:70`.
   - `/download/aim-channel` is not present in `app/sitemap.ts`.
   - No `app/robots.ts` exists; acceptable per review protocol.

4. `/requests` hero verbatim (§4.8): PASS
   - Headline is exactly `Data Requests.` at `app/requests/page.tsx:57`.
   - Subhead is exactly `Browse open data requests, or post your own. Sellers respond with matching datasets. The whole conversation happens here.` at `app/requests/page.tsx:59`.
   - Primary CTA `Post a Data Request` is retained at `app/requests/page.tsx:66`.

5. `/requests` voice pass (§4.8): PASS
   - Detail page copy edits are limited to headings/helper text and empty-state copy at `app/requests/[slug]/page.tsx:156`, `app/requests/[slug]/page.tsx:231`, `app/requests/[slug]/page.tsx:251`, `app/requests/[slug]/page.tsx:292`, and `app/requests/[slug]/page.tsx:304`.
   - New request form copy edits are limited to helper text, labels, and placeholders at `app/requests/new/page.tsx:100`, `app/requests/new/page.tsx:115`, `app/requests/new/page.tsx:141`, and `app/requests/new/page.tsx:215`.
   - No structural changes, routing changes, state changes, or form submission logic changes were introduced in the `/requests` diff.

## Out-of-Scope Check

PASS

Changed files are limited to:

- `next.config.ts`
- `app/sitemap.ts`
- `app/requests/page.tsx`
- `app/requests/[slug]/page.tsx`
- `app/requests/new/page.tsx`

No layout/nav edits, landing page edits, JSON-LD additions, OG/Twitter card additions, vectoraiz-monorepo edits, dependency changes, shared component primitives, CI smoke wiring, or OG image generation were found in the diff.

## Voice Check

PASS

Manual and `rg` checks found no prohibited phrases in the changed `/requests` pages:

- `Here's...`
- `In summary`
- `It's important to note`
- `Notably,`
- `Importantly,`
- `To summarize`
- `In conclusion`

No decorative em-dashes were introduced in changed `/requests` copy.

## Findings

No findings.

## Mandates Owed For R2

None.

## Verification

- Manual diff inspection against fork point: `git diff db1721874f88f7a6a67b7285494dda21d2dc238c...HEAD`
- Changed-file scope check: `git diff --name-status db1721874f88f7a6a67b7285494dda21d2dc238c...HEAD`
- Whitespace check: `git diff --check db1721874f88f7a6a67b7285494dda21d2dc238c...HEAD`
- Voice phrase check: `rg` across `app/requests/page.tsx`, `app/requests/[slug]/page.tsx`, and `app/requests/new/page.tsx`

Note: `npm run lint` did not complete because this repo's `next lint` command exits into an interactive ESLint configuration prompt when no ESLint config is present. No lint result is claimed.
