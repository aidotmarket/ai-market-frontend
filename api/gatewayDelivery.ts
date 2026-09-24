import { api } from './client';
import type { GatewayDelivery, GatewayPermission, GatewayProblem } from '@/types/gatewayDelivery';

const path = (orderId: string) => `/orders/${encodeURIComponent(orderId)}/gateway-delivery`;

export async function getGatewayDelivery(orderId: string): Promise<{ delivery: GatewayDelivery; retryAfter: number | null }> {
  const response = await api.get<GatewayDelivery>(path(orderId));
  const header = response.headers['retry-after'];
  const seconds = Number(header);
  return { delivery: response.data, retryAfter: header != null && Number.isFinite(seconds) && seconds > 0 ? seconds : null };
}

export async function reissueGatewayPermission(orderId: string, fileId: string, mode: 'restart' | 'resume'): Promise<GatewayPermission> {
  const response = await api.post<GatewayPermission>(`${path(orderId)}/files/${encodeURIComponent(fileId)}/permissions`, { mode });
  return response.data;
}

export async function reportGatewayProblem(orderId: string, body: { category: 'missing_data' | 'corrupted'; file_ids: string[]; note?: string }): Promise<GatewayProblem> {
  const response = await api.post<GatewayProblem>(`${path(orderId)}/problems`, body);
  return response.data;
}

export function gatewayErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: { error?: { code?: unknown } } } })?.response?.data;
  return typeof data?.error?.code === 'string' ? data.error.code : null;
}
