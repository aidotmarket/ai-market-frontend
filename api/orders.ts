import { api } from './client';
import type { BuyerOrder, BuyerOrderDetail, OrderEvent, OrderAccessResponse } from '@/types';

export interface MyOrdersPaging {
  limit?: number;
  offset?: number;
}

export async function getMyOrders(paging?: MyOrdersPaging): Promise<BuyerOrder[]> {
  const params = paging === undefined ? undefined : {
    limit: Number.isFinite(paging.limit) ? Math.min(100, Math.max(1, Math.trunc(paging.limit!))) : 50,
    offset: Number.isFinite(paging.offset) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(paging.offset!))) : 0,
  };
  const res = await (params === undefined
    ? api.get<(BuyerOrder & {amount_cents?: number})[]>('/orders/mine')
    : api.get<(BuyerOrder & {amount_cents?: number})[]>('/orders/mine', { params }));
  return res.data.map(order => ({...order,
    amount: typeof order.amount_cents === 'number' ? order.amount_cents / 100 : order.amount,
  }));
}

export async function getOrder(orderId: string): Promise<BuyerOrderDetail> {
  const res = await api.get<BuyerOrderDetail & {amount_cents?: number; listing_snapshot?: {title?: string}}>(`/orders/${encodeURIComponent(orderId)}`);
  const data = res.data;
  return {...data,
    amount: typeof data.amount_cents === 'number' ? data.amount_cents / 100 : data.amount,
    listing_title: data.listing_snapshot?.title ?? data.listing_title ?? 'Purchased data',
  };
}

export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const res = await api.get<OrderEvent[]>(`/orders/${encodeURIComponent(orderId)}/events`);
  return res.data;
}

export async function getOrderAccess(orderId: string): Promise<OrderAccessResponse> {
  const res = await api.get<OrderAccessResponse>(`/orders/${encodeURIComponent(orderId)}/access`);
  return res.data;
}
