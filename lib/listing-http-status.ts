export type ListingHttpStatus = 204 | 404 | 410 | 451 | 503;

export const LISTING_DATA_HEADER = 'x-aim-listing-data';
export const LISTING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function listingHttpStatus(status: number): ListingHttpStatus {
  switch (status) {
    case 204:
    case 404:
    case 410:
    case 451:
      return status;
    default:
      return 503;
  }
}

export class ListingUnavailable extends Error {
  constructor(readonly status: Exclude<ListingHttpStatus, 204>) {
    super('Listing unavailable');
  }
}

export async function listingIsWithdrawn(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.detail === 'Listing has been withdrawn';
}

export function listingUnavailableResponse(status: 410 | 451 | 503, withdrawn = false) {
  const message = status === 410 ? (withdrawn ? 'This listing was withdrawn.' : 'This listing was removed.') :
    status === 451 ? 'This listing is unavailable for legal reasons.' : 'This listing is temporarily unavailable.';
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Listing unavailable</title><h1>${message}</h1><a href="/">Back to ai.market</a></html>`, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      ...(status === 503 ? {'Retry-After': '60'} : {}),
    },
  });
}
