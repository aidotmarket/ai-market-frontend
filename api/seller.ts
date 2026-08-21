import { api } from './client';
import type { SellerOrder, SellerStats } from '@/types';

export interface SellerOrderListParams {
  status_filter?: 'pending_delivery' | 'delivered' | 'completed';
  limit: number;
  offset: number;
}

export const getSellerStats = () => api.get<SellerStats>('/seller/stats');
export const getSellerFinancials = () => api.get('/seller/financials');
export const getSellerOrders = (params: SellerOrderListParams) =>
  api.get<SellerOrder[]>('/seller/orders', { params });
