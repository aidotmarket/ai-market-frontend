const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export interface PaginatedListings {
  items: import('@/types').ListingListItem[];
  total: number;
  page: number;
  per_page: number;
  jsonld?: Record<string, unknown>;
}

export type FeaturedItemSource = 'just_listed' | 'recently_sold' | 'trending' | 'cold_start' | 'curated';

export interface FeaturedPriceDisplay {
  currency?: string | null;
  amount?: number | null;
  label: string;
  on_request?: boolean;
}

export interface FeaturedItem {
  listing_id: string;
  seller_id?: string;
  slug: string;
  title: string;
  summary?: string | null;
  canonical_url: string;
  locale?: string;
  source: FeaturedItemSource;
  slot: number;
  price: FeaturedPriceDisplay;
  quality_score?: number | null;
  placement_id?: string | null;
}

export interface FeaturedFeedResponse {
  generated_at?: string;
  locale?: string;
  currency?: string;
  items: FeaturedItem[];
  item_list: Record<string, unknown>;
}

export async function fetchPublicListings(params?: {
  page?: number;
  per_page?: number;
  category?: string;
  sort?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  if (params?.category) searchParams.set('category', params.category);
  if (params?.sort) searchParams.set('sort', params.sort);

  const qs = searchParams.toString();
  const res = await fetch(`${API_URL}/api/v1/public/listings${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchFeaturedFeed(params?: {
  locale?: string;
  currency?: string;
  limit?: number;
}): Promise<FeaturedFeedResponse | null> {
  const searchParams = new URLSearchParams();
  if (params?.locale) searchParams.set('locale', params.locale);
  if (params?.currency) searchParams.set('currency', params.currency);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();
  const res = await fetch(`${API_URL}/api/v1/public/featured-listings${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchPublicListing(slug: string) {
  const res = await fetch(`${API_URL}/api/v1/public/listings/${encodeURIComponent(slug)}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchListingVersions(listingId: string) {
  const res = await fetch(`${API_URL}/api/v1/listings/${encodeURIComponent(listingId)}/versions`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchListingAccessWindowDays(listingId: string): Promise<number | null> {
  const res = await fetch(`${API_URL}/api/v1/listings/${encodeURIComponent(listingId)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const listing = await res.json();
  return typeof listing.access_window_days === 'number' ? listing.access_window_days : null;
}

export async function resolveListingUUID(uuid: string) {
  const res = await fetch(`${API_URL}/api/v1/public/listings/resolve/${encodeURIComponent(uuid)}`);
  if (!res.ok) return null;
  return res.json();
}

// ============================================================================
// Data Requests — public browse
// ============================================================================

export async function fetchDataRequests(params?: {
  page?: number;
  per_page?: number;
  category?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  if (params?.category) searchParams.set('category', params.category);

  const qs = searchParams.toString();
  const res = await fetch(`${API_URL}/api/v1/data-requests${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchDataRequest(slugOrId: string) {
  const res = await fetch(
    `${API_URL}/api/v1/data-requests/${encodeURIComponent(slugOrId)}`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) return null;
  return res.json();
}
