const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export interface PaginatedListings {
  items: import('@/types').ListingListItem[];
  total: number;
  page: number;
  per_page: number;
  jsonld?: Record<string, unknown>;
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

export async function fetchPublicListing(slug: string) {
  const res = await fetch(`${API_URL}/api/v1/public/listings/${encodeURIComponent(slug)}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json();
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
