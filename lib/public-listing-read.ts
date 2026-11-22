import { LISTING_UUID } from './listing-http-status';

const SYNTHETIC_HARNESS_USER_AGENT_TOKEN = 'ai-market-e2e-harness';

export function syntheticListingFetchOptions(userAgent?: string | null) {
  // Match the backend's should_count_view; never forward the full incoming UA.
  if (!userAgent?.toLowerCase().includes(SYNTHETIC_HARNESS_USER_AGENT_TOKEN)) return undefined;
  return {
    headers: { 'User-Agent': SYNTHETIC_HARNESS_USER_AGENT_TOKEN },
    cache: 'no-store' as const,
  };
}

export function requestPublicListing(apiBase: string | undefined, ref: string, userAgent?: string | null, signal?: AbortSignal) {
  const path = LISTING_UUID.test(ref) ? 'resolve/' : '';
  return fetch(`${apiBase}/api/v1/public/listings/${path}${encodeURIComponent(ref)}`, {
    cache: 'no-store',
    ...syntheticListingFetchOptions(userAgent),
    ...(signal ? {signal} : {}),
  });
}
