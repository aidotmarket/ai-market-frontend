import { api } from './client';
import type { BuyerOrder, BuyerOrderDetail, OrderEvent, OrderDownloadResponse } from '@/types';

export async function getMyOrders(): Promise<BuyerOrder[]> {
  const res = await api.get<BuyerOrder[]>('/orders/mine');
  return res.data;
}

export async function getOrder(orderId: string): Promise<BuyerOrderDetail> {
  const res = await api.get<BuyerOrderDetail>(`/orders/${encodeURIComponent(orderId)}`);
  return res.data;
}

export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const res = await api.get<OrderEvent[]>(`/orders/${encodeURIComponent(orderId)}/events`);
  return res.data;
}

export async function requestDownload(orderId: string): Promise<OrderDownloadResponse> {
  const res = await api.post<OrderDownloadResponse>(`/orders/${encodeURIComponent(orderId)}/download`);
  return res.data;
}

export async function refreshOrderAccess(orderId: string): Promise<void> {
  await api.post(`/orders/${encodeURIComponent(orderId)}/refresh`);
}
