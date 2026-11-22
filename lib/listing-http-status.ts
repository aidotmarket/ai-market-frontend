export type ListingHttpStatus = 204 | 404 | 410 | 451 | 503;

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
