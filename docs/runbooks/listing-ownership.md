# Listing ownership display

Authenticated listing viewers use `GET /api/v1/listings/{listing_id}/ownership`
through the authenticated API client. The backend route requires authentication
and returns `{"is_owner": boolean}` with `Cache-Control: no-store`. The frontend
relies on that response header. Only literal `true` shows “This is your listing” and
hides purchase and licence controls. A matching existing `sellerId` still shows
the owner panel immediately without a request. Anonymous viewers make no
ownership request and retain the existing Buy link.

Auth hydration, identity loading and ownership lookup share a single three-second
deadline starting at mount, including the initial anonymous, unhydrated store state.
Hydration resolving anonymous restores the signed-out flow immediately. While
pending, purchase and licence controls are hidden (no existing purchase skeleton).
False, malformed responses,
HTTP errors (including 404 before backend deployment), network errors and
deadline expiry restore the normal purchase flow. Late results cannot change
the timeout fallback or update an unmounted view. Changing user or listing
starts a fresh check; late initial identity after expiry is ignored. Ordinary
rerenders and Strict Mode effect replay reuse the current request. No inventory membership check is used by this feature.

The scope is replacement of active purchase controls. Pending seller terms and
unpurchasable page states mount no BuyButton and expose no purchase control.

The route is being added on backend branch
`build/listing-ownership-check-s1790`. Until deployed, 404 falls back to Buy.
This frontend display check does not replace backend checkout authorization.

For diagnosis, check the authenticated route status and boolean payload for the
viewed listing. If Buy appears for an owner, check route deployment, response
shape and whether identity loading plus lookup took three seconds. Do not use
`/listings/mine` inventory membership as proof of nonownership.

Run validation in the frontend checkout:

```sh
rtk proxy npx tsc --noEmit --incremental false
rtk proxy env NODE_OPTIONS=--no-experimental-webstorage npx vitest run
rtk npm run lint
rtk git diff --check
```

The automated coverage checks owner and buyer rendering, anonymous and matching
seller paths, errors and malformed payloads, identity loading, shared deadline
expiry, ignored late responses, Strict Mode request reuse and unmount cleanup.
