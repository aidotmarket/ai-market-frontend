import { api } from './client';
import type { SellerOrder, SellerStats } from '@/types';

export interface SellerOrderListParams {
  status_filter?: 'pending_delivery' | 'delivered' | 'completed';
  limit: number;
  offset: number;
}

export const SELLER_ORDERS_PAGE_SIZE = 100;

export const getSellerStats = () => api.get<SellerStats>('/seller/stats');
export const getSellerFinancials = () => api.get('/seller/financials');
export const getSellerOrders = (params: SellerOrderListParams, options?: { signal: AbortSignal }) =>
  api.get<SellerOrder[]>('/seller/orders', { params, ...options });

export async function getSellerOrderStatus(orderId: string, signal: AbortSignal): Promise<SellerOrder['status'] | undefined> {
  for (let offset = 0; !signal.aborted; offset += SELLER_ORDERS_PAGE_SIZE) {
    const { data } = await getSellerOrders({ limit: SELLER_ORDERS_PAGE_SIZE, offset }, { signal });
    const order = data.find(({ id }) => id === orderId);
    if (order) return order.status;
    if (data.length < SELLER_ORDERS_PAGE_SIZE) break;
  }
}
