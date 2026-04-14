# BQ-FRONTEND-AIM-NODE-PAGES — Gate 1 Spec
## Design Review — AIM Node Seller/Buyer Pages + Download Page Fix

**BQ Code:** BQ-FRONTEND-AIM-NODE-PAGES
**Gate:** 1 (Design)
**Repo:** ai-market-frontend
**Author:** Vulcan (S439)

---

## Problem Statement

The ai.market frontend currently has no page explaining the AIM Node product — how sellers publish AI models and pipelines, how buyers discover and consume them, or how the distributed peer-to-peer architecture works. The existing `/download` page (nav label "List Data") is exclusively about the AIM Channel (data listing) flow and still references the old "vectorAIz" brand name throughout.

Visitors landing on ai.market have no way to learn about model/pipeline selling or buying via AIM Node, which is now a core product alongside AIM Channel for data.

---

## Goals

1. **New `/aim-node` page** — comprehensive explanation of AIM Node for both sellers and buyers, with P2P architecture explanation and download links
2. **Top-level nav item** — "AIM Node" added to the main site navigation in `Layout.tsx`
3. **Fix `/download` page copy** — replace all "vectorAIz" references with "AIM Channel" (the current brand name for the data processing tool)
4. **Footer update** — add AIM Node link to the Developers section

---

## Design: `/aim-node` Page

### Page Structure

The page follows the same design language as the existing `/download` and `/protocol` pages: hero section, stepped how-it-works cards, feature grid, download CTA. Uses existing color palette (`#3F51B5` indigo, `#E8EAF6` light indigo bg, gray-900/600 text).

### Section 1: Hero

**Headline:** "Sell or Buy AI Models & Pipelines on ai.market"

**Subheadline:** AIM Node runs on your infrastructure and connects to ai.market's distributed peer-to-peer network. Sellers wrap their models as MCP tools and publish. Buyers discover, purchase, and connect directly — no centralized proxy, no model uploads, no middleman.

**CTA buttons:**
- "Install AIM Node" (primary, `bg-[#3F51B5]`) → scrolls to download section
- "Browse Models" (secondary, outlined) → `/listings?category=models`

### Section 2: How It Works — Sellers

**Section eyebrow:** "FOR SELLERS"

4-step horizontal card grid (matching `/download` step card pattern):

| Step | Title | Description |
|------|-------|-------------|
| 1 | Install AIM Node | Install via pip on your server. AIM Node runs alongside your model — no containers required, no data leaves your infrastructure. |
| 2 | Wrap Your Model | Expose your model or pipeline as an MCP tool using AIM Node's SDK. Define input/output schemas, set pricing, add descriptions. |
| 3 | Publish to ai.market | AIM Node registers your tool with the marketplace. Only metadata, schemas, and descriptions are shared — model weights and code stay with you. |
| 4 | Earn Per-Call | Buyers connect peer-to-peer. Each invocation is metered, settled, and paid out. You set the price; ai.market handles billing. |

### Section 3: How It Works — Buyers

**Section eyebrow:** "FOR BUYERS"

4-step horizontal card grid:

| Step | Title | Description |
|------|-------|-------------|
| 1 | Browse & Discover | Search ai.market for models and pipelines by capability, schema, price, or quality score. AI agents can discover tools programmatically via MCP. |
| 2 | Install AIM Node | Run AIM Node in consumer mode on your infrastructure. It acts as a local proxy that handles authentication and connection management. |
| 3 | Purchase Access | Buy access to a tool on ai.market. A cryptographically signed, time-limited delivery token is generated for your transaction. |
| 4 | Connect Peer-to-Peer | AIM Node connects directly to the seller's node using the delivery token. Run inference, pass data, get results — all point-to-point over encrypted channels. |

### Section 4: The Distributed Architecture

**Section eyebrow:** "PEER-TO-PEER BY DESIGN"

**Headline:** "No Uploads. No Proxies. No Middleman."

Content block (prose, not bullets) explaining the P2P model:

- **What the platform handles:** Discovery, authentication, billing, delivery tokens, dispute resolution, quality scoring. The marketplace is the coordination layer — it connects buyers and sellers and handles money.
- **What the platform never touches:** Model weights, training data, inference inputs, inference outputs, raw API payloads. Data flows exclusively between the seller's AIM Node and the buyer's AIM Node.
- **How delivery works:** When a buyer purchases access, ai.market generates a signed delivery token scoped to that transaction. The buyer's AIM Node presents the token to the seller's AIM Node. The seller verifies the token against ai.market's registry, then opens an encrypted peer-to-peer channel. Every invocation is metered and reported back for settlement.
- **Why this matters:** Models and pipelines are too large, too sensitive, and too latency-critical to proxy through a central server. P2P delivery means sellers keep full control, buyers get direct performance, and no single point of failure exists in the delivery path.

This section includes a visual diagram (SVG or simple illustration) showing:
```
[Seller's Infrastructure]        [ai.market]         [Buyer's Infrastructure]
   AIM Node (provider)  ←→  Discovery + Billing  ←→   AIM Node (consumer)
   Your Model/Pipeline       Token Generation          Your Application
                         ↕                          ↕
                    metadata only              metadata + token
                         
          ← ─ ─ ─ ─ ─  P2P encrypted channel  ─ ─ ─ ─ ─ →
                    (inference data flows here)
```

### Section 5: Download / Install

**Headline:** "Get Started with AIM Node"

Two install methods side by side (matching `/download` page card pattern):

**Card 1: pip install (recommended)**
```
pip install aim-node
```
- For: Python environments, any OS
- Requirements: Python 3.10+

**Card 2: Docker**
```
docker pull ghcr.io/aidotmarket/aim-node:latest
docker run -p 8400:8400 -p 8401:8401 ghcr.io/aidotmarket/aim-node:latest
```
- For: Containerized deployments
- Requirements: Docker

Both cards include copy buttons (reuse existing `CopyButton` component from `/download`).

Link to full docs: "View setup guide at get.ai.market" → `https://get.ai.market`

### Section 6: System Requirements

Minimal grid (matching `/download` requirements section):
- Python 3.10+ (for pip install) OR Docker
- 4 GB RAM minimum
- Network access to ai.market API

---

## Navigation Changes

### Header (`Layout.tsx`)

Current desktop nav order:
```
Browse | Request Data | List Data | The Protocol | [Dashboard]
```

New order:
```
Browse | Request Data | List Data | AIM Node | The Protocol | [Dashboard]
```

New entry:
```tsx
<Link href="/aim-node" className="text-sm text-[#666666] hover:text-[#1A1A1A]">
  AIM Node
</Link>
```

Same addition in mobile menu.

### Footer (`Layout.tsx`)

Add to "Developers" section:
```
Developers:
  - The Protocol → /protocol
  - AIM Node → /aim-node         ← NEW
  - AIM Channel → /download      ← RENAME from "vectorAIz"
```

---

## Download Page Fixes (`/download`)

All "vectorAIz" references replaced with "AIM Channel":

| Location | Current | New |
|----------|---------|-----|
| Step 1 title | "Install vectorAIz" | "Install AIM Channel" |
| Step 1 desc | "vectorAIz runs as a Docker container..." | "AIM Channel runs as a Docker container..." |
| Step 4 desc | "...from your vectorAIz instance" | "...from your AIM Channel instance" |
| Install section h2 | "Install vectorAIz" | "Install AIM Channel" |
| Hero paragraph | "vectorAIz runs on your infrastructure..." | "AIM Channel runs on your infrastructure..." |
| Footer link | "vectorAIz" → vectoraiz.com | "AIM Channel" → /download |

Note: Install URLs (`get.vectoraiz.com`) remain unchanged — those are the actual installer endpoints. Only display text changes.

---

## File Inventory

### New files
- `app/aim-node/page.tsx` — the AIM Node page

### Modified files
- `components/Layout.tsx` — add "AIM Node" nav item + footer updates
- `app/download/page.tsx` — replace "vectorAIz" with "AIM Channel" throughout

### No new dependencies
- All components use existing patterns (copy button, step cards, feature grid)
- Same Tailwind classes used throughout the site

---

## Out of Scope

- AIM Node management UI (separate BQ: BQ-AIM-NODE-SETUP-WIZARD)
- Interactive demos or playground
- Model/pipeline-specific listing pages (existing `/listings` handles all listing types)
- API documentation (lives at `get.ai.market`)
- AIM Channel download page redesign (only copy fixes)

---

## Success Criteria

1. A visitor can navigate to `/aim-node` from the main nav and understand what AIM Node is, how it works for both sellers and buyers, and how to install it
2. The P2P architecture is explained clearly enough that a technical founder understands the trust model (platform handles money, never touches payloads)
3. Download commands are copy-pasteable and link to `get.ai.market` for full docs
4. All "vectorAIz" references on the download page are updated to "AIM Channel"
5. No broken links, consistent design language with existing pages

---

## R1 Mandate Resolutions (APPROVE_WITH_MANDATES — MP)

### Mandate 1: Existing `/download/aim-node` page duplication
The existing `app/download/aim-node/page.tsx` is replaced by the new `/aim-node` page. Changes:
- `app/download/aim-node/page.tsx` → deleted, replaced by redirect: `redirect('/aim-node')` (Next.js server redirect)
- Homepage CTA (`app/page.tsx` line ~91): `href: '/download/aim-node'` → `href: '/aim-node'`
- `/aim-node` is the single canonical AIM-Node product page going forward

### Mandate 2: Browse Models CTA URL
Fixed: `/listings?category=models` → `/listings?type=models` (matches `MarketplaceSearchExperience.tsx` type switcher)

### Mandate 3: Product naming standardization
Canonical brand form: **AIM-Node** (hyphenated, capital N). All references in the new page and across modified files use `AIM-Node`. This matches existing site copy on the homepage, protocol page, and former download page. The spec body above should be read with `AIM Node` → `AIM-Node` throughout.

### Mandate 4: Install messaging — pip-first replaces Docker-first
This is an intentional product update. AIM-Node is now pip-installable (`pip install aim-node`) as the primary install method. Docker (`ghcr.io/aidotmarket/aim-node`) is the secondary method for containerized deployments. The old `/download/aim-node` page's Docker-first messaging is outdated and replaced by the new page's pip-first flow. The spec explicitly supersedes the old install narrative.

### Updated File Inventory (additions from mandates)

**Deleted files:**
- `app/download/aim-node/page.tsx` — replaced by redirect

**Additional modified files:**
- `app/page.tsx` — update AIM-Node CTA href from `/download/aim-node` to `/aim-node`

**New files:**
- `app/download/aim-node/page.tsx` — server redirect to `/aim-node` (or use Next.js `redirect()` in a route handler)
