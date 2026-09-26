'use client';

import { api } from './client';
import type {LicenseSelection} from './listingLicenses';
import type { FulfillmentType, ListingListItem, ListingDetail, ListingVersion, SearchResponse } from '@/types';

type FulfillmentTypeParam = FulfillmentType | FulfillmentType[];

export interface ListListingsParams {
  skip?: number;
  limit?: number;
  category?: string;
  search?: string;
  listing_type?: string;
  fulfillment_type?: FulfillmentTypeParam;
  min_price?: number;
  max_price?: number;
  min_privacy_score?: number;
}

export async function listListings(params: ListListingsParams = {}): Promise<ListingListItem[]> {
  const requestParams = params.fulfillment_type?.length === 0
    ? { ...params, fulfillment_type: undefined }
    : params;
  const res = await api.get<ListingListItem[]>('/listings/', {
    params: requestParams,
    paramsSerializer: { indexes: null },
  });
  return res.data;
}

export async function getListing(id: string): Promise<ListingDetail> {
  const res = await api.get<ListingDetail>(`/listings/${id}`);
  return res.data;
}

export interface CreateDraftListingInput {
  title: string;
  description: string;
  price: number;
  model_provider: 'anthropic';
  listing_type: 'raw';
  data_format?: 'csv';
  schema_info: { row_count: number; columns: Array<{ name: string; type: string }> };
}

export async function createDraftListing(body: CreateDraftListingInput): Promise<{ id: string; status: 'draft' }> {
  return (await api.post<{ id: string; status: 'draft' }>('/listings/', body)).data;
}

export async function getListingVersions(id: string): Promise<ListingVersion[]> {
  const res = await api.get<ListingVersion[]>(`/listings/${id}/versions`);
  return res.data;
}

export async function searchListings(
  q: string,
  params: {
    category?: string;
    min_price?: number;
    max_price?: number;
    min_privacy_score?: number;
    compliance_status?: string;
    fulfillment_type?: FulfillmentTypeParam;
    limit?: number;
    offset?: number;
  } = {}
): Promise<SearchResponse> {
  const requestParams = params.fulfillment_type?.length === 0
    ? { ...params, fulfillment_type: undefined }
    : params;
  const res = await api.get<SearchResponse>('/search/listings', {
    params: { q, ...requestParams },
    paramsSerializer: { indexes: null },
  });
  return res.data;
}

export async function getMarketplaceCategoryFacets(): Promise<Record<string, number>> {
  // The search endpoint requires a non-empty query. Its category facets describe
  // the full publicly visible inventory, independent of the result matches.
  const response = await searchListings('*', { limit: 1, offset: 0 });
  const categories = response.facets?.categories;

  if (!categories || typeof categories !== 'object') {
    throw new Error('Category facets are unavailable');
  }

  return categories;
}

export const getListings = () => api.get('/listings/');
export const getMyListings = () => api.get('/listings/mine');

export interface PendingSellerTermsListing {
  id: string;
  slug: string;
  title: string;
  status: string;
  license_status: 'pending_seller_terms';
}

export const getPendingSellerTermsListings = () =>
  api.get<{ count: number; listings: PendingSellerTermsListing[] }>('/sellers/me/listings', {
    params: { license_status: 'pending_seller_terms' },
  });
export const updateListing = (id: string, data: any) => api.patch(`/listings/${id}`, data);
export const getListingBySlug = (slug: string) => api.get(`/listings/${slug}`);

export const getListingPreview = (id: string) => api.get(`/listings/${id}/preview`);
export const publishListing = (id: string, licenseSelection?: LicenseSelection) => licenseSelection
  ? api.post(`/listings/${id}/publish`, {license_selection: licenseSelection})
  : api.post(`/listings/${id}/publish`);
export const unpublishListing = (id: string) => api.post(`/listings/${id}/unpublish`);
export const deleteListing = (id: string) => api.delete(`/listings/${id}`);
