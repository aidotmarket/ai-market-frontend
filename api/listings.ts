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
