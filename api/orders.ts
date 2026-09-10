import { api } from './client';
import type { BuyerOrder, BuyerOrderDetail, OrderEvent, OrderAccessResponse, OrderDownloadResponse, OrderRefreshResponse, S3ScopedDeliveryResponse } from '@/types';

export async function getMyOrders(): Promise<BuyerOrder[]> {
  const res = await api.get<(BuyerOrder & {amount_cents?: number})[]>('/orders/mine');
  return res.data.map(order => ({...order,
    amount: typeof order.amount_cents === 'number' ? order.amount_cents / 100 : order.amount,
  }));
}

export async function getOrder(orderId: string): Promise<BuyerOrderDetail> {
  const res = await api.get<BuyerOrderDetail & {amount_cents?: number; listing_snapshot?: {title?: string}}>(`/orders/${encodeURIComponent(orderId)}`);
  const data = res.data;
  if (!data.workspace_delivery) return data;
  return {...data,
    amount: typeof data.amount_cents === 'number' ? data.amount_cents / 100 : data.amount,
    listing_title: data.listing_snapshot?.title ?? data.listing_title ?? 'Purchased data',
  };
}

export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const res = await api.get<OrderEvent[]>(`/orders/${encodeURIComponent(orderId)}/events`);
  return res.data;
}

export async function requestDownload(orderId: string): Promise<OrderDownloadResponse> {
  const res = await api.post<OrderDownloadResponse>(`/orders/${encodeURIComponent(orderId)}/download`);
  return res.data;
}

export async function getOrderAccess(orderId: string): Promise<OrderAccessResponse> {
  const res = await api.get<OrderAccessResponse>(`/orders/${encodeURIComponent(orderId)}/access`);
  return res.data;
}

export async function refreshOrderAccess(orderId: string): Promise<OrderRefreshResponse> {
  const res = await api.post<OrderRefreshResponse>(`/orders/${encodeURIComponent(orderId)}/refresh`);
  return res.data;
}

export async function refreshScopedDelivery(orderId: string): Promise<S3ScopedDeliveryResponse> {
  const res = await api.post<S3ScopedDeliveryResponse>(`/orders/${encodeURIComponent(orderId)}/delivery/refresh`);
  return res.data;
}
