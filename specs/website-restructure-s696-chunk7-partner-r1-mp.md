# MP Review - PR #13 - S696 Chunk 7 Partner Page - Round 1

Branch SHA used as diff base: `f17cdf91943a8a21d7ef7ecd3101c191ef220f92`

Head reviewed: `1f3cf6210ea803f8c41ca10ac00e19be074f5e36`

Overall: `APPROVE_WITH_MANDATES`

## Per-Anchor Verdict

Anchor 1 - Hero: `PASS` - headline/subhead and both CTA blocks are present at `app/partner/page.tsx:117`, `app/partner/page.tsx:119`, `app/partner/page.tsx:125`, and `app/partner/page.tsx:136`.

Anchor 2 - Data Partners section: `PASS` - `id="data-partner"`, required blockquote, four data-partner steps, and the required mailto CTA are present at `app/partner/page.tsx:149`, `app/partner/page.tsx:157`, `app/partner/page.tsx:9`, and `app/partner/page.tsx:164`.

Anchor 3 - Technology Partners section: `FAIL` - section anchor, intro, AIM Node blockquote, table, requirements, CTAs, and runbook link are present, but the catalog-search step does not include the required capability/schema/license/price/quality-score facets (`app/partner/page.tsx:44`).

Anchor 4 - Co-sell paragraph: `FAIL` - the paragraph covers the "Some partners do both" concept, but it does not cross-link to both partner tracks (`app/partner/page.tsx:287`).

Anchor 5 - Cross-link block: `PASS` - the required related-path copy and links to Find Data, Sell Data, and Run Federated Learning are present at `app/partner/page.tsx:297`, `app/partner/page.tsx:298`, `app/partner/page.tsx:302`, and `app/partner/page.tsx:306`.

Out-of-scope check: `PASS` - diff from `f17cdf91943a8a21d7ef7ecd3101c191ef220f92..HEAD` modifies only `app/partner/page.tsx`; no layout, nav, AIM Node deep page, or download redirect files are touched.

## Findings

1. `app/partner/page.tsx:44` - Anchor 3 content omission - `MED`
   The "Search the catalog" step says to use the MCP API, but it omits the required capability/schema/license/price/quality-score detail. Mandate: update the step copy to explicitly mention all required facets.

2. `app/partner/page.tsx:287` - Anchor 4 cross-link omission - `MED`
   The co-sell paragraph says a partner can list with AIM Data and integrate AIM Node, but the acceptance anchor requires cross-links to both tracks. Mandate: link "list with AIM Data" to `#data-partner` and "integrate AIM Node" to `#technology-partner`.

## Mandates Owed For R2

1. Add the required catalog-search facets to the AIM Node integration step: capability, schema, license, price, and quality score via MCP API.

2. Add in-page cross-links from the co-sell paragraph to both partner tracks: `#data-partner` and `#technology-partner`.
