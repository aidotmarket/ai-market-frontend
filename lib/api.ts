import type { ListingPublicListResponse } from '@/types';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export interface ShareMetadataResponse {
  og: {
    'og:title'?: string;
    'og:description'?: string;
    'og:url'?: string;
    'og:type'?: 'website' | string;
    'og:site_name'?: string;
    'og:image'?: string;
    'og:locale'?: string;
    'twitter:card'?: 'summary_large_image' | string;
    'twitter:title'?: string;
    'twitter:description'?: string;
    'twitter:image'?: string;
  };
  jsonld: Record<string, unknown>;
  card_url: string;
  canonical: string;
  locale?: string;
  alternates?: unknown[];
}

export type ShareMetadataFetchResult =
  | { status: 'published'; data: ShareMetadataResponse }
  | { status: 'gone' }
  | { status: 'error' };

export type PaginatedListings = ListingPublicListResponse;

export type FeaturedItemSource = 'just_listed' | 'recently_sold' | 'trending' | 'cold_start' | 'curated';

export interface FeaturedPriceDisplay {
  currency: string | null;
  amount: number | null;
  label: string;
  on_request: boolean;
}

export interface FeaturedItem {
  listing_id: string;
  seller_id: string;
  slug: string;
  title: string;
  summary: string | null;
  canonical_url: string;
  locale: string;
  source: FeaturedItemSource;
  slot: number;
  price: FeaturedPriceDisplay;
  placement_id: string | null;
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
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchShareMetadata(code: string): Promise<ShareMetadataFetchResult> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/share/${encodeURIComponent(code)}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      return { status: 'published', data: await res.json() };
    }
    if (res.status === 410 || res.status === 404) {
      return { status: 'gone' };
    }
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export async function fetchListingVersions(listingId: string) {
  const res = await fetch(`${API_URL}/api/v1/listings/${encodeURIComponent(listingId)}/versions`, {
    next: { revalidate: 10 },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchListingAccessWindowDays(listingId: string): Promise<number | null> {
  const res = await fetch(`${API_URL}/api/v1/listings/${encodeURIComponent(listingId)}`, {
    next: { revalidate: 10 },
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

// Phase 1 metadata-only summary. Seller calls reuse the authenticated client.
export interface SummaryField<T = string | number | string[] | Record<string, string>[]> {
  value: T;
  provenance: 'aim_metadata' | 'seller_entered' | 'allai_generated' | 'absent';
  authority: 'seller_entered' | 'seller_local_report' | 'publication_bound';
  source_reference: string;
  source_revision: string;
  guard_result_reference?: string | null;
  artifact_id?: string | null;
}
export interface ListingSummary {
  profile: 'aim-listing-enrichment-profile-v2';
  row_meaning?: SummaryField<string> | null;
  intended_uses?: SummaryField<string[]> | null;
  key_fields?: SummaryField<{name: string; type: string}[]> | null;
  field_descriptions?: SummaryField<{name: string; description?: string; unit?: string}[]> | null;
  row_count?: SummaryField<number> | null;
  column_count?: SummaryField<number> | null;
  size_bytes?: SummaryField<number> | null;
  format?: SummaryField<string> | null;
  spatial_coverage?: SummaryField<string> | null;
  temporal_coverage?: SummaryField<string> | null;
  data_languages?: SummaryField<string[]> | null;
  freshness?: SummaryField<string> | null;
  license?: SummaryField<string> | null;
  delivery?: SummaryField<string> | null;
  privacy_status?: SummaryField<string> | null;
  sample_availability?: SummaryField<string> | null;
}
export interface SummaryApprovalRequest {
  summary_id: string;
  source_revision: string;
  summary_hash: string;
  render_hash: string;
  request_id: string;
  sample_decision: 'none';
}
export interface SummaryPreview extends Omit<SummaryApprovalRequest, 'request_id'> {
  state: 'pending' | 'approved' | 'invalidated';
  status: 'pending' | 'approved' | 'invalidated';
  locale: 'en' | 'es' | 'zh-Hans';
  at_a_glance: ListingSummary;
  approval_text: string;
  approval_version: string;
  generator_version: string;
}
export interface SummaryDecision { decision_id: string; decision: 'approved' | 'withdrawn' }
const summaryPath = (id: string) => `/listings/${encodeURIComponent(id)}/at-a-glance`;
export async function fetchSummaryPreview(id: string, signal?: AbortSignal): Promise<SummaryPreview> {
  const {api} = await import('@/api/client');
  return (await api.get<SummaryPreview>(`${summaryPath(id)}/preview`, {signal})).data;
}
export async function regenerateSummary(id: string, locale: SummaryPreview['locale'], signal?: AbortSignal): Promise<SummaryPreview> {
  const {api} = await import('@/api/client');
  return (await api.post<SummaryPreview>(`${summaryPath(id)}/regenerate`, {locale}, {signal})).data;
}
export async function approveSummary(id: string, request: SummaryApprovalRequest, signal?: AbortSignal): Promise<SummaryDecision> {
  const {api} = await import('@/api/client');
  return (await api.post<SummaryDecision>(`${summaryPath(id)}/approve`, request, {signal})).data;
}
export async function withdrawSummary(id: string, request: SummaryApprovalRequest, signal?: AbortSignal): Promise<SummaryDecision> {
  const {api} = await import('@/api/client');
  return (await api.post<SummaryDecision>(`${summaryPath(id)}/withdraw`, request, {signal})).data;
}

export async function fetchBuyerSummary(slug: string, signal: AbortSignal): Promise<ListingSummary | null> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/public/listings/${encodeURIComponent(slug)}`, {
    cache: 'no-store', credentials: 'omit', signal,
  });
  if (!response.ok) throw new Error('Summary could not be refreshed');
  const listing: {at_a_glance?: ListingSummary} = await response.json();
  return listing.at_a_glance ?? null;
}

// Preview calls use only identifiers. Never route a package body, row, filter,
// arbitrary exception, or detector output through this API client.
export async function fetchPreviewManifest(slug: string, signal: AbortSignal): Promise<import('./listing-preview/types').Manifest | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/public/listings/${encodeURIComponent(slug)}/preview-manifest`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal,
    });
    if (response.status !== 200 || signal.aborted) return null;
    const {metadataResponse} = await import('./listing-preview/transport');
    const value = await metadataResponse(response, signal) as import('./listing-preview/types').Manifest;
    return value?.profile === 'aim-listing-preview-v1' && value.package_profile === 'aim-preview-package-v2' && value.preview_type === 'table' && value.content_type === 'tabular' ? value : null;
  } catch {return null;}
}
/** Optional current-head metadata. Missing rollout or invalid data is identity-only. */
export async function fetchSignedSummaryPayload(slug: string, signal: AbortSignal): Promise<unknown | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/public/listings/${encodeURIComponent(slug)}/at-a-glance/signed-payload`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal,
    });
    if (response.status !== 200 || signal.aborted) return null;
    const {metadataResponse} = await import('./listing-preview/transport');
    return await metadataResponse(response, signal);
  } catch {return null;}
}
// Non-content trust only, in memory. This never supplies a missing key response.
const observedPreviewKeys = new Map<string, string>();
export async function fetchPreviewKeys(signal: AbortSignal): Promise<import('./listing-preview/types').TrustedKeys | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/public/transparency/keys`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal,
    });
    if (response.status !== 200 || signal.aborted) return null;
    const {metadataResponse} = await import('./listing-preview/transport');
    const primitives = await import('./listing-preview/primitives');
    const closed: typeof primitives.closed = primitives.closed;
    const requirePreview: typeof primitives.requirePreview = primitives.requirePreview;
    const unb64 = primitives.unb64;
    const raw = await metadataResponse(response, signal); closed(raw, 'profile keys');
    requirePreview(raw.profile === 'aim-preview-platform-keys-v1' && Array.isArray(raw.keys) && raw.keys.length > 0);
    const keys: Record<string, string> = Object.create(null), material = new Set<string>();
    for (const key of raw.keys) {
      closed(key, 'key_id algorithm public_key');
      requirePreview(typeof key.key_id === 'string' && /^[A-Za-z0-9._:-]{1,255}$/.test(key.key_id) && typeof key.public_key === 'string' && key.algorithm === 'ed25519');
      unb64(key.public_key, 32); requirePreview(!Object.hasOwn(keys, key.key_id) && !material.has(key.public_key));
      requirePreview(!observedPreviewKeys.has(key.key_id) || observedPreviewKeys.get(key.key_id) === key.public_key);
      keys[key.key_id] = key.public_key; material.add(key.public_key);
    }
    for (const [id, key] of Object.entries(keys)) observedPreviewKeys.set(id, key);
    return keys;
  } catch {return null;}
}

export async function fetchPreviewConsistency(fromSize: number, toSize: number, signal: AbortSignal): Promise<string[] | null> {
  try {
    if (!Number.isSafeInteger(fromSize) || !Number.isSafeInteger(toSize) || fromSize < 1 || toSize < fromSize) return null;
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/public/transparency/consistency?from_size=${fromSize}&to_size=${toSize}`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal,
    });
    if (response.status !== 200 || signal.aborted) return null;
    const {metadataResponse} = await import('./listing-preview/transport');
    const raw = await metadataResponse(response, signal);
    const primitives = await import('./listing-preview/primitives');
    const closed: typeof primitives.closed = primitives.closed;
    const check: typeof primitives.requirePreview = primitives.requirePreview;
    closed(raw, 'from_size to_size consistency_path');
    check(raw.from_size === fromSize && raw.to_size === toSize && Array.isArray(raw.consistency_path) && raw.consistency_path.length <= 63);
    for (const item of raw.consistency_path) {check(typeof item === 'string'); primitives.unb64(item, 32);}
    return raw.consistency_path as string[];
  } catch {return null;}
}
