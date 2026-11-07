import { api } from './client';
import { useAuthStore } from '@/store/auth';
import { authSessionOwner, assertAuthSessionOwner } from '@/lib/auth-session-owner';
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

export async function confirmDataRequestPublication(
  requestId: string,
  publicContentHash: string,
  policyVersion: string
): Promise<DataRequestDetail> {
  const res = await api.put<DataRequestDetail>(
    `/data-requests/${encodeURIComponent(requestId)}/publication-consent`,
    { public_content_hash: publicContentHash, policy_version: policyVersion }
  );
  return res.data;
}

export async function withdrawDataRequestPublication(requestId: string): Promise<DataRequestDetail> {
  const res = await api.delete<DataRequestDetail>(
    `/data-requests/${encodeURIComponent(requestId)}/publication-consent`
  );
  return res.data;
}

export async function deleteDataRequest(requestId: string): Promise<void> {
  await api.delete(`/data-requests/${encodeURIComponent(requestId)}`);
}

export async function submitDataRequestResponse(
  requestId: string,
  payload: { proposal: string; proposed_price?: number; proposed_timeline?: string }
): Promise<DataRequestResponse> {
  const res = await api.post<DataRequestResponse>(
    `/data-requests/${encodeURIComponent(requestId)}/responses`,
    payload
  );
  return res.data;
}

export async function getDataRequestResponses(requestId: string): Promise<DataRequestResponse[]> {
  const res = await api.get<DataRequestResponse[] | { items: DataRequestResponse[] }>(
    `/data-requests/${encodeURIComponent(requestId)}/responses`
  );
  return Array.isArray(res.data) ? res.data : res.data.items;
}

export async function getMyDataRequests(): Promise<DataRequestListItem[]> {
  const res = await api.get<{ items: DataRequestListItem[] } | DataRequestListItem[]>('/data-requests', {
    params: { mine: true },
  });
  return Array.isArray(res.data) ? res.data : res.data.items;
}

export interface MyDataRequestsPage {
  items: DataRequestListItem[];
  total: number;
  page: number;
  per_page: number;
}

export async function getMyDataRequestsPage(page = 1): Promise<MyDataRequestsPage> {
  const res = await api.get<MyDataRequestsPage>('/data-requests', {
    params: { mine: true, page, per_page: 20 },
  });
  return res.data;
}

// Proposed C4 contract; deliberately incompatible with the legacy message shape.
// See private WIRE-CONTRACT.md. No legacy send fallback is permitted.
export type ThreadSide = 'buyer' | 'seller';
export type ThreadAvailability = 'enabled' | 'off' | 'unavailable' | 'unknown';
export interface RequestThreadSelector {
  contract: 'request-thread-v1'; request_id: string; side: ThreadSide;
  availability: ThreadAvailability;
  threads: { response_id: string; can_send: boolean }[];
}
export interface SafeRequestMessage { request_id: string; response_id: string; id: string; role: ThreadSide | 'system'; content: string }
export interface RequestThreadHistory {
  contract: 'request-thread-v1'; request_id: string; response_id: string;
  can_send: boolean; items: SafeRequestMessage[]; next_cursor: string | null;
}
export interface RequestMessageCommand { response_id: string; client_message_nonce: string; content: string }
export type RequestCommandState = 'sent' | 'processing' | 'processing_failed' | 'held' | 'clarification_requested' | 'refused' | 'unusable' | 'unknown';
export interface RequestCommandResult {
  contract: 'request-thread-v1'; request_id: string; response_id: string;
  client_message_nonce: string; command_digest: string; event_id: string | null;
  state: RequestCommandState; message: SafeRequestMessage | null;
}
const contract = 'request-thread-v1';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Thread unavailable');
  return value as Record<string, unknown>;
}
function textField(value: unknown, max = 128): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new Error('Thread unavailable');
  return value;
}
function envelope(value: unknown, request: string, response?: string) {
  const v = record(value);
  if (v.contract !== contract || v.request_id !== request || (response !== undefined && v.response_id !== response)) throw new Error('Thread unavailable');
  return v;
}
function scopedMessage(value: unknown, request: string, response: string): Record<string, unknown> {
  const v = record(value);
  if (v.request_id !== request || v.response_id !== response) throw new Error('Thread unavailable');
  return v;
}
function safeMessage(value: unknown, request: string, response: string): SafeRequestMessage {
  const v = scopedMessage(value, request, response);
  if (typeof v.role !== 'string' || !['buyer', 'seller', 'system'].includes(v.role)) throw new Error('Thread unavailable');
  return { request_id: request, response_id: response, id: textField(v.id), role: v.role as SafeRequestMessage['role'], content: textField(v.content, 5000) };
}
export async function getRequestThreadSelector(request: string, response?: string): Promise<RequestThreadSelector> {
  const { data } = await api.get<unknown>(`/data-requests/${encodeURIComponent(request)}/threads`, { params: { response_id: response } });
  const v = envelope(data, request);
  if (typeof v.side !== 'string' || !['buyer', 'seller'].includes(v.side) || typeof v.availability !== 'string' || !['enabled', 'off', 'unavailable', 'unknown'].includes(v.availability) || !Array.isArray(v.threads) || v.threads.length > 1000) throw new Error('Thread unavailable');
  const threads = v.threads.map((item) => {
    const t = record(item);
    if (typeof t.can_send !== 'boolean') throw new Error('Thread unavailable');
    return { response_id: textField(t.response_id), can_send: t.can_send };
  });
  if (new Set(threads.map(t => t.response_id)).size !== threads.length || (v.side === 'seller' && threads.length > 1) || (response && (threads.length !== 1 || threads[0].response_id !== response))) throw new Error('Thread unavailable');
  return { contract, request_id: request, side: v.side as ThreadSide, availability: v.availability as ThreadAvailability, threads };
}
export async function getRequestThreadMessages(request: string, response: string, cursor?: string): Promise<RequestThreadHistory> {
  textField(response);
  const { data } = await api.get<unknown>(`/data-requests/${encodeURIComponent(request)}/messages`, { params: { response_id: response, contract, cursor } });
  const v = envelope(data, request, response);
  if (typeof v.can_send !== 'boolean' || !Array.isArray(v.items) || v.items.length > 100 || (v.next_cursor !== null && typeof v.next_cursor !== 'string')) throw new Error('Thread unavailable');
  return { contract, request_id: request, response_id: response, can_send: v.can_send, items: v.items.map(item => {
    const m = scopedMessage(item, request, response);
    if (m.state !== 'sent') throw new Error('Thread unavailable');
    return safeMessage(m, request, response);
  }), next_cursor: v.next_cursor === null ? null : textField(v.next_cursor, 512) };
}
export function parseRequestCommandResult(data: unknown, request: string, command: RequestMessageCommand): RequestCommandResult {
  const v = envelope(data, request, command.response_id);
  if (v.client_message_nonce !== command.client_message_nonce || typeof v.state !== 'string' || !['sent', 'processing', 'processing_failed', 'held', 'clarification_requested', 'refused', 'unusable', 'unknown'].includes(v.state) || typeof v.command_digest !== 'string' || !/^[a-f0-9]{64}$/.test(v.command_digest)) throw new Error('Unknown message result');
  const terminal = ['sent', 'held', 'clarification_requested', 'refused', 'unusable'].includes(v.state);
  const event_id = terminal ? textField(v.event_id) : null;
  if (v.state !== 'sent' && v.message != null) throw new Error('Unknown message result');
  return { contract, request_id: request, response_id: command.response_id, client_message_nonce: command.client_message_nonce, command_digest: v.command_digest, event_id, state: v.state as RequestCommandState, message: v.state === 'sent' ? safeMessage(v.message, request, command.response_id) : null };
}
export async function sendRequestThreadMessage(request: string, command: RequestMessageCommand, assertAdmission?: () => void): Promise<RequestCommandResult> {
  // Snapshot the allowlist before any await; callers cannot retarget a pending command.
  const body = { response_id: textField(command.response_id), client_message_nonce: textField(command.client_message_nonce), content: textField(command.content, 5000) };
  const owner = authSessionOwner();
  const principal = useAuthStore.getState().user?.id;
  const assertCurrent = () => {
    assertAuthSessionOwner(owner);
    const state = useAuthStore.getState();
    if (!principal || state.user?.id !== principal || !state.token || !state.isAuthenticated) throw new Error('Authentication operation superseded');
    assertAdmission?.();
  };
  assertCurrent();
  const { postSessionMutation } = await import('./session-mutation');
  assertCurrent();
  return parseRequestCommandResult(await postSessionMutation<unknown>(`/data-requests/${encodeURIComponent(request)}/message-commands`, body, assertCurrent), request, body);
}
export async function reconcileRequestThreadMessage(request: string, command: RequestMessageCommand): Promise<RequestCommandResult> {
  const { data } = await api.get<unknown>(`/data-requests/${encodeURIComponent(request)}/message-commands/${encodeURIComponent(command.client_message_nonce)}`, { params: { response_id: command.response_id } });
  return parseRequestCommandResult(data, request, command);
}
