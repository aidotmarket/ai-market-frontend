Branch SHA used as diff base: 3b8827917d1d9b7c52f79be3132b7389e20b824f

Spec section read: §4.3 Sell Data landing (gate1.md lines 398-450)

Acceptance anchor list extracted from spec:
1. Route `/sell-data`; new file `app/sell-data/page.tsx`; supersedes `/download/aim-channel` via later redirect work.
2. Hero headline: "Sell your data without giving it away."
3. Hero subhead: "Install AIM Data on your own infrastructure. Your raw data stays put. We handle discovery, payments, and delivery tokens. Bytes move peer-to-peer the moment a buyer purchases."
4. Primary CTA text "Install AIM Data" targeting `/aim-data#install`; secondary CTA text "How it works" anchoring to §4.3.2.
5. Four-step section with exactly four steps: Install AIM Data; Prepare with allAI; Publish; Deliver securely, including the specified operational references.
6. Features section with exactly four feature blocks: Local-first processing; AI-assisted listings; Honest PII signals; Stripe payouts.
7. Pricing teaser noting platform fee details are deferred to the pricing page, linking to `/support` or surfacing `TBD-on-pricing-page-bq`.
8. For Agents callout with heading "Selling to AI agents?" and the specified MCP API paragraph.
9. Final CTA text "Install AIM Data" targeting `/aim-data#install`.
10. Cross-link block to `/find-data`, `/run-federated-learning`, and `/partner` with the specified destinations.

Overall: REQUEST_CHANGES

Per-anchor verdict:
1. Route/file: PASS (`app/sell-data/page.tsx:149`)
2. Hero headline: PASS (`app/sell-data/page.tsx:158`)
3. Hero subhead: PASS (`app/sell-data/page.tsx:161`)
4. Primary/secondary hero CTAs: FAIL. Target paths pass at `app/sell-data/page.tsx:166` and `app/sell-data/page.tsx:172`; secondary text passes at `app/sell-data/page.tsx:175`; primary text fails because rendered text is `Install AIM Data →` instead of exact spec text `Install AIM Data` at `app/sell-data/page.tsx:169`.
5. Four-step section: PASS (`app/sell-data/page.tsx:10`, rendered at `app/sell-data/page.tsx:193`)
6. Features section: PASS (`app/sell-data/page.tsx:39`, rendered at `app/sell-data/page.tsx:220`)
7. Pricing teaser: PASS (`app/sell-data/page.tsx:243`, `/support` link at `app/sell-data/page.tsx:250`)
8. For Agents callout: PASS (`app/sell-data/page.tsx:258`, paragraph at `app/sell-data/page.tsx:261`)
9. Final CTA: FAIL. Target path passes at `app/sell-data/page.tsx:285`; text fails because rendered text is `Install AIM Data →` instead of exact spec text `Install AIM Data` at `app/sell-data/page.tsx:288`.
10. Cross-link block: PASS (`app/sell-data/page.tsx:297`, destinations at `app/sell-data/page.tsx:298`, `app/sell-data/page.tsx:302`, `app/sell-data/page.tsx:306`)

Out-of-scope check: PASS. Diff against `3b8827917d1d9b7c52f79be3132b7389e20b824f` only adds `app/sell-data/page.tsx`; no layout component edits, no other page edits, no dependency changes, no shared primitive changes.

Voice check: PASS. Copy is terse plain business English; no prohibited phrases found. The rendered em dash in operational reference separators follows the spec's reference style rather than a stylistic emphasis sentence.

Findings:
1. `app/sell-data/page.tsx:169` and `app/sell-data/page.tsx:288` - MED - CTA labels do not match the spec's exact text. §4.3.1 and §4.3.6 require `Install AIM Data`; the page renders `Install AIM Data →` in both the hero and final CTA. Remove the arrow glyphs or move arrow treatment outside the accessible/button text if the visual arrow is required.

Mandates owed for R2: None. This is REQUEST_CHANGES; resubmit with exact CTA text.
