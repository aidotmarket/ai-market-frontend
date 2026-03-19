import { api } from './client';
import type {
  DataRequestListItem,
  DataRequestDetail,
  CreateDataRequestPayload,
  DataRequestResponse,
} from '@/types';

export async function getDataRequests(): Promise<DataRequestListItem[]> {
  const res = await api.get<{ items: DataRequestListItem[] } | DataRequestListItem[]>('/data-requests');
  return Array.isArray(res.data) ? res.data : res.data.items;
}

export async function getDataRequest(slugOrId: string): Promise<DataRequestDetail> {
  const res = await api.get<DataRequestDetail>(`/data-requests/${encodeURIComponent(slugOrId)}`);
  return res.data;
}

export async function createDataRequest(payload: CreateDataRequestPayload): Promise<DataRequestDetail> {
  const res = await api.post<DataRequestDetail>('/data-requests', payload);
  return res.data;
}

export async function updateDataRequest(
  requestId: string,
  payload: Partial<CreateDataRequestPayload>
): Promise<DataRequestDetail> {
  const res = await api.patch<DataRequestDetail>(`/data-requests/${encodeURIComponent(requestId)}`, payload);
  return res.data;
}

export async function publishDataRequest(requestId: string): Promise<DataRequestDetail> {
  const res = await api.post<DataRequestDetail>(`/data-requests/${encodeURIComponent(requestId)}/publish`);
  return res.data;
}

export async function deleteDataRequest(requestId: string): Promise<void> {
  await api.delete(`/data-requests/${encodeURIComponent(requestId)}`);
}

export async function submitDataRequestResponse(
  requestId: string,
  payload: { proposal: string; proposed_price?: number; timeline?: string }
): Promise<DataRequestResponse> {
  const res = await api.post<DataRequestResponse>(
    `/data-requests/${encodeURIComponent(requestId)}/responses`,
    payload
  );
  return res.data;
}

export async function getDataRequestResponses(requestId: string): Promise<DataRequestResponse[]> {
  const res = await api.get<DataRequestResponse[]>(
    `/data-requests/${encodeURIComponent(requestId)}/responses`
  );
  return res.data;
}

export async function getMyDataRequests(): Promise<DataRequestListItem[]> {
  const res = await api.get<{ items: DataRequestListItem[] } | DataRequestListItem[]>('/data-requests', {
    params: { mine: true },
  });
  return Array.isArray(res.data) ? res.data : res.data.items;
}
