# Public page canonical metadata

Keep `metadataBase` in `app/layout.tsx`, but put the homepage canonical `/`
only in `app/page.tsx`. A root-layout canonical is inherited by child routes
that do not override `alternates`, causing distinct public pages to point home.

Use a static `Metadata` export with `alternates: { canonical: '/route' }`
on each independently indexable public page. For the client-rendered protocol
page, its server layout supplies the canonical. Do not add canonicals on
private, account, authentication, OAuth, redirect or error routes. Leave
existing robots controls and dynamic listing/request metadata unchanged.

The inventory for this repair includes the homepage, listings, find-data,
requests, search, sell-data, aim-data, partner, protocol, investors, management-team,
support, privacy and cookies. Pricing, docs/claude, verified and blog already
have their own canonicals. Search has its own public route and search-mode
metadata, so it also receives a self canonical. Legal site-terms redirects to terms;
legal terms is deliberately untouched. Licenses, blog articles and short
listing shares retain their existing dynamic canonicals. Request creation,
legal identity support/settings and all dashboard/auth/account flows are
outside the public acquisition-page inventory.

Run `rtk npm run test -- tests/canonical-metadata.test.ts`, then follow
`docs/runbooks/frontend-ci.md` for Node 22, lint, typecheck and the full suite.
Run `rtk npm run build` and inspect server-rendered HTML canonical links when
possible. Record environment failures without changing unrelated fallback
content or build behavior. A draft PR and passing checks do not prove Google
has indexed the pages; that needs separate post-deployment search evidence.

Next.js metadata behavior reference:
https://nextjs.org/docs/15/app/api-reference/functions/generate-metadata#merging
