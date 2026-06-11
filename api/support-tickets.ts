import { api } from './client';

export type SupportTicketStatus =
  | 'new'
  | 'triaged'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_internal'
  | 'resolved'
  | 'closed';

export type SupportIssueClass = 'dev' | 'ops' | 'customer';
export type SupportPriority = 'low' | 'medium' | 'high' | 'critical';
export type SupportChannel = 'agent_api' | 'allai' | 'email' | 'web';
export type SupportMessageDirection = 'inbound' | 'outbound' | 'internal';

export interface SupportTicket {
  id: string;
  public_ref: string;
  subject: string;
  issue_class: SupportIssueClass | string;
  status: SupportTicketStatus | string;
  priority: SupportPriority | string;
  risk_score: number | null;
  human_required: boolean;
  collapsed: boolean;
  requester_party_id: string | null;
  org_party_id: string | null;
  assignee_actor_type?: string | null;
  assignee_actor_id?: string | null;
  channel: SupportChannel | string;
  links: Record<string, unknown>;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  actor_type: string;
  actor_id: string;
  party_id: string | null;
  direction: SupportMessageDirection | string;
  body: string;
  body_format: string;
  language: string | null;
  translated_body: string | null;
  channel: SupportChannel | string;
  external_message_id: string | null;
  attachments: Array<Record<string, unknown>>;
  created_at: string;
}

export interface SupportTicketFilters {
  status?: string;
  issue_class?: string;
  priority?: string;
  assignee?: string;
  channel?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface SupportTicketPatch {
  status?: SupportTicketStatus;
  priority?: SupportPriority;
  risk_score?: number | null;
  human_required?: boolean;
  assignee_actor_type?: string | null;
  assignee_actor_id?: string | null;
}

export interface SupportEmailMetric {
  pending_count: number;
  oldest_pending_age_seconds: number | null;
}

export interface SupportEmailDurabilityMetrics {
  dlq: SupportEmailMetric;
  quarantine: SupportEmailMetric;
}

export interface SupportEmailDlqRow {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  reason: string;
  detail: Record<string, unknown>;
  retry_count: number;
  status: string;
  created_at: string;
  updated_at?: string;
  first_failed_at?: string;
  last_retry_at?: string | null;
}

export interface SupportEmailQuarantineRow {
  id: string;
  gmail_message_id: string;
  candidate_public_ref: string | null;
  candidate_ticket_id: string | null;
  resolved_sender_party_id: string | null;
  sender_email: string | null;
  reason: string;
  headers_meta: Record<string, unknown>;
  status: string;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

const compactParams = (params: SupportTicketFilters) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );

export async function listSupportTickets(filters: SupportTicketFilters = {}): Promise<SupportTicket[]> {
  const { priority, assignee, channel, ...serverFilters } = filters;
  const res = await api.get<SupportTicket[]>('/support/tickets', {
    params: compactParams(serverFilters),
  });

  return res.data.filter((ticket) => {
    if (priority && ticket.priority !== priority) return false;
    if (channel && ticket.channel !== channel) return false;
    if (assignee === 'unassigned' && ticket.assignee_actor_id) return false;
    if (assignee && assignee !== 'unassigned' && ticket.assignee_actor_id !== assignee) return false;
    return true;
  });
}

export async function getSupportTicket(publicRef: string): Promise<SupportTicket> {
  const res = await api.get<SupportTicket>(`/support/tickets/${encodeURIComponent(publicRef)}`);
  return res.data;
}

export async function getSupportTicketMessages(publicRef: string): Promise<SupportMessage[]> {
  const res = await api.get<SupportMessage[]>(`/support/tickets/${encodeURIComponent(publicRef)}/messages`);
  return res.data;
}

export async function updateSupportTicket(publicRef: string, patch: SupportTicketPatch): Promise<SupportTicket> {
  const res = await api.patch<SupportTicket>(`/support/tickets/${encodeURIComponent(publicRef)}`, patch);
  return res.data;
}

export async function createSupportTicketMessage(
  publicRef: string,
  payload: {
    body: string;
    direction: SupportMessageDirection;
    channel?: SupportChannel;
    body_format?: string;
  }
): Promise<SupportMessage> {
  const res = await api.post<SupportMessage>(`/support/tickets/${encodeURIComponent(publicRef)}/messages`, {
    body_format: 'text',
    channel: 'web',
    ...payload,
  });
  return res.data;
}

export async function getSupportEmailDurabilityMetrics(): Promise<SupportEmailDurabilityMetrics> {
  const res = await api.get<SupportEmailDurabilityMetrics>('/support/email-durability/metrics');
  return res.data;
}

export async function listSupportEmailDlq(): Promise<SupportEmailDlqRow[]> {
  const res = await api.get<SupportEmailDlqRow[]>('/support/email-dlq', { params: { status: 'pending', limit: 10 } });
  return res.data;
}

export async function listSupportEmailQuarantine(): Promise<SupportEmailQuarantineRow[]> {
  const res = await api.get<SupportEmailQuarantineRow[]>('/support/email-quarantine', {
    params: { status: 'pending', limit: 10 },
  });
  return res.data;
}
