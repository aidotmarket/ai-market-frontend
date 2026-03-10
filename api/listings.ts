'use client';

import { api } from './client';
import type { ListingListItem, ListingDetail, SearchResponse } from '@/types';

export interface ListListingsParams {
  skip?: number;
  limit?: number;
  category?: string;
  search?: string;
  min_price?: number;
  max_price?: number;
  min_privacy_score?: number;
}

export async function listListings(params: ListListingsParams = {}): Promise<ListingListItem[]> {
  const res = await api.get<ListingListItem[]>('/listings/', { params });
  return res.data;
}

export async function getListing(id: string): Promise<ListingDetail> {
  const res = await api.get<ListingDetail>(`/listings/${id}`);
  return res.data;
}

export async function searchListings(
  q: string,
  params: {
    category?: string;
    min_price?: number;
    max_price?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<SearchResponse> {
  const res = await api.get<SearchResponse>('/search/listings', {
    params: { q, ...params },
  });
  return res.data;
}

export const getListings = () => api.get('/listings');
export const createListing = (data: any) => api.post('/listings', data);
export const updateListing = (id: string, data: any) => api.patch(`/listings/${id}`, data);
export const getListingBySlug = (slug: string) => api.get(`/listings/${slug}`);

// Seller wizard endpoints
export const createDraft = (data: any) => api.post('/listings/draft', data);
export const enhanceListing = (id: string) => api.post(`/listings/${id}/enhance`);
export const getListingPreview = (id: string) => api.get(`/listings/${id}/preview`);
export const publishListing = (id: string) => api.post(`/listings/${id}/publish`, { confirmation: true });
export const unpublishListing = (id: string) => api.post(`/listings/${id}/unpublish`);
export const deleteListing = (id: string) => api.delete(`/listings/${id}`);
