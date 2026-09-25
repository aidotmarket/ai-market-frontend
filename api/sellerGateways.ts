import { api } from './client';
import type { AxiosResponse } from 'axios';
import type { DoorCheck, FilesPage, GatewayFile, GatewayMessageType, PairingCode, ReceivedPage, SellerGateway, WithRetry } from '@/types/sellerGateway';

const gatewayPath = (id: string) => `/gateways/${encodeURIComponent(id)}`;
const filePath = (id: string, fileId: string) => `${gatewayPath(id)}/files/${encodeURIComponent(fileId)}`;

function withRetry<T>(response: AxiosResponse<T>): WithRetry<T> {
  const header = response.headers['retry-after'];
  const seconds = Number(header);
  return { data: response.data, retryAfter: header != null && Number.isFinite(seconds) && seconds >= 0 ? seconds : null };
}

export async function createPairingCode(): Promise<PairingCode> {
  return (await api.post<PairingCode>('/gateways/pairing-codes', {})).data;
}
export async function listSellerGateways(): Promise<SellerGateway[]> {
  return (await api.get<{ gateways: SellerGateway[] }>('/gateways')).data.gateways;
}
export async function getSellerGateway(id: string): Promise<SellerGateway> {
  return (await api.get<SellerGateway>(gatewayPath(id))).data;
}
export async function patchSellerGateway(id: string, body: { name?: string; door_url?: string | null }): Promise<SellerGateway> {
  return (await api.patch<SellerGateway>(gatewayPath(id), body)).data;
}
export async function revokeSellerGateway(id: string, confirmOpenOrders = false): Promise<void> {
  await api.delete(gatewayPath(id), { data: confirmOpenOrders ? { confirm_open_orders: true } : {} });
}
export async function startDoorCheck(id: string): Promise<WithRetry<{ door_check: DoorCheck }>> {
  return withRetry(await api.post<{ door_check: DoorCheck }>(`${gatewayPath(id)}/door-check`, {}));
}
export async function acknowledgeGatewayIdentity(id: string): Promise<SellerGateway> {
  return (await api.post<SellerGateway>(`${gatewayPath(id)}/identity-acknowledgement`, { acknowledged: true })).data;
}
export async function listGatewayFiles(id: string, cursor?: string, limit = 100): Promise<FilesPage> {
  return (await api.get<FilesPage>(`${gatewayPath(id)}/files`, { params: { cursor, limit } })).data;
}
export interface GatewayListingSource { type: 'gateway'; gateway_id: string; file_ids: string[] }
export async function getGatewayListingSource(listingId: string): Promise<GatewayListingSource | null> {
  return (await api.get<{ source: GatewayListingSource | null }>(`/listings/${encodeURIComponent(listingId)}/gateway-source`)).data.source;
}
export async function saveGatewayListingSource(listingId: string, source: GatewayListingSource): Promise<GatewayListingSource> {
  return (await api.put<{ source: GatewayListingSource }>(`/listings/${encodeURIComponent(listingId)}/gateway-source`, { source })).data.source;
}
export async function getGatewayFile(id: string, fileId: string): Promise<WithRetry<GatewayFile>> {
  return withRetry(await api.get<GatewayFile>(filePath(id, fileId)));
}
export async function describeGatewayFile(id: string, fileId: string): Promise<WithRetry<GatewayFile>> {
  return withRetry(await api.post<GatewayFile>(`${filePath(id, fileId)}/describe`, { confirm: true }));
}
export async function listReceivedMessages(id: string, cursor?: string, limit = 100, messageType?: GatewayMessageType): Promise<ReceivedPage> {
  return (await api.get<ReceivedPage>(`${gatewayPath(id)}/received`, { params: { cursor, limit, message_type: messageType } })).data;
}

export function gatewayErrorDetails(error: unknown): { open_order_count?: number } | null {
  const details = (error as { response?: { data?: { error?: { details?: unknown } } } })?.response?.data?.error?.details;
  return details && typeof details === 'object' ? details as { open_order_count?: number } : null;
}
