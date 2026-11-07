import { api } from './client';
import { patchSessionMutation, postSessionMutation } from './session-mutation';
import { authSessionOwner, assertAuthSessionOwner } from '@/lib/auth-session-owner';
import { useAuthStore } from '@/store/auth';

// Proposed C3 wire contract; backend C3 routes are not implemented here.
export const ISSUE_CATEGORIES = ['payment_charge', 'download_delivery', 'not_as_described', 'access_account', 'refund_request', 'other'] as const;
export type IssueCategory = typeof ISSUE_CATEGORIES[number];
export type ReportSurface = 'allai' | 'web';
export interface IssueDraft { category: IssueCategory; description: string; browser?: string; error?: string }
export interface CustomerMessage { id: string; version: string; direction: 'inbound' | 'outbound'; body: string }
export type EmailState = 'pending' | 'confirmation_needed' | 'accepted' | 'failed' | 'unknown';
export interface ReportConfirmation {
  public_ref: string; conversation_id: string; received_at: string; status: string;
  next_action: string; acknowledgement: CustomerMessage; original: IssueDraft; email_state: EmailState;
}
export interface ReportProposal {
  proposal_id: string; conversation_id: string; revision: number; expires_at: string;
  draft: IssueDraft; context: OrderIssueContext; surface: ReportSurface;
  guidance: { id: string; body: string }[]; guidance_turns: number; guidance_bytes: number;
  completed_guidance_nonces: string[];
  guidance_state: 'available' | 'model_unavailable' | 'capped';
  enrollment: 'enabled' | 'unavailable' | 'unknown'; confirmation: ReportConfirmation | null;
}
export interface CustomerConversation {
  public_ref: string; conversation_id: string; status: string; next_action: string;
  email_state: EmailState; messages: CustomerMessage[]; next_cursor: string | null;
}
const contextTypes = {
  order_number: 'string', status: 'string', amount_cents: 'number', currency: 'string',
  created_at: 'string', paid_at: 'string', delivered_at: 'string', delivery_type: 'string',
  max_downloads: 'number', downloads_used: 'number', access_expires_at: 'string', revoked: 'boolean',
  escrow_hold_until: 'string', listing_title: 'string',
} as const;
export type OrderIssueContext = { -readonly [K in keyof typeof contextTypes]: string | number | boolean | null };
const fail = (): never => { throw new Error('SUPPORT_WIRE_INVALID'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || value.length > max) return fail();
  return value;
}
function count(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) return fail();
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) return fail();
  return value as T;
}
function list<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) return fail();
  return value.map(parse);
}
export function issueDraft(value: unknown): IssueDraft {
  const d = record(value);
  const category = choice(d.category, ISSUE_CATEGORIES);
  const result: IssueDraft = { category, description: text(d.description) };
  if (category === 'download_delivery') {
    if (d.browser !== undefined) result.browser = text(d.browser, 100);
    if (d.error !== undefined) result.error = text(d.error, 1000);
  }
  return result;
}
export function orderIssueContext(value: unknown): OrderIssueContext {
  const source = record(value);
  const result = {} as OrderIssueContext;
  for (const [key, type] of Object.entries(contextTypes)) {
    const v = source[key];
    if (v !== null && (typeof v !== type || (typeof v === 'number' && !Number.isFinite(v)))) return fail();
    result[key as keyof OrderIssueContext] = typeof v === 'string' ? text(v, key === 'listing_title' ? 200 : 100) : v as number | boolean | null;
  }
  return result;
}
function customerMessage(value: unknown): CustomerMessage {
  const m = record(value);
  return { id: text(m.id, 128), version: text(m.version, 128), direction: choice(m.direction, ['inbound', 'outbound']), body: text(m.body, 16000) };
}
function emailState(value: unknown) { return choice(value, ['pending', 'confirmation_needed', 'accepted', 'failed', 'unknown'] as const); }
function confirmation(value: unknown): ReportConfirmation {
  const c = record(value);
  const ack = customerMessage(c.acknowledgement);
  if (ack.direction !== 'outbound') return fail();
  return { public_ref: text(c.public_ref, 128), conversation_id: text(c.conversation_id, 128),
    received_at: text(c.received_at, 100), status: text(c.status, 80), next_action: text(c.next_action),
    acknowledgement: ack, original: issueDraft(c.original), email_state: emailState(c.email_state) };
}
export function reportProposal(value: unknown): ReportProposal {
  const p = record(value);
  const expires = text(p.expires_at, 100);
  if (!Number.isFinite(Date.parse(expires))) return fail();
  const guidance = list(p.guidance, 40, value => { const g = record(value); return { id: text(g.id, 128), body: text(g.body, 16000) }; });
  if (new TextEncoder().encode(JSON.stringify(guidance)).length > 65536) return fail();
  return { proposal_id: text(p.proposal_id, 128), conversation_id: text(p.conversation_id, 128), revision: count(p.revision),
    expires_at: expires, draft: issueDraft(p.draft), context: orderIssueContext(p.context),
    surface: choice(p.surface, ['allai', 'web']), guidance, guidance_turns: count(p.guidance_turns, 20), guidance_bytes: count(p.guidance_bytes, 65536),
    completed_guidance_nonces: list(p.completed_guidance_nonces, 20, value => text(value, 128)),
    guidance_state: choice(p.guidance_state, ['available', 'model_unavailable', 'capped']),
    enrollment: choice(p.enrollment, ['enabled', 'unavailable', 'unknown']),
    confirmation: p.confirmation === null ? null : confirmation(p.confirmation) };
}
export function customerConversation(value: unknown): CustomerConversation {
  const c = record(value);
  return { public_ref: text(c.public_ref, 128), conversation_id: text(c.conversation_id, 128), status: text(c.status, 80), next_action: text(c.next_action),
    email_state: emailState(c.email_state), messages: list(c.messages, 100, customerMessage), next_cursor: c.next_cursor === null ? null : text(c.next_cursor, 512) };
}
// Digest: SHA-256 of UTF-8 JSON in this field order, absent optional fields omitted.
export function canonicalIssue(draft: IssueDraft): string { return JSON.stringify(issueDraft(draft)); }
export async function issueDigest(draft: IssueDraft): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalIssue(draft)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export interface SupportPort {
  withAdmission?: (assertAdmission: () => void) => SupportPort;
  open(order: string, nonce: string, surface: ReportSurface, resume: boolean): Promise<ReportProposal>;
  recover(order: string, proposal: string): Promise<ReportProposal>;
  save(order: string, proposal: string, revision: number, draft: IssueDraft, surface: ReportSurface): Promise<ReportProposal>;
  guide(order: string, proposal: string, revision: number, nonce: string, body: string): Promise<ReportProposal>;
  confirm(order: string, proposal: string, revision: number, digest: string): Promise<ReportProposal>;
  conversation(ref: string, cursor?: string): Promise<CustomerConversation>;
  reply(ref: string, nonce: string, body: string): Promise<CustomerConversation>;
  receipt(ref: string, message: string, version: string): Promise<void>;
}
const segment = encodeURIComponent;
const proposals = (order: string) => '/orders/' + segment(order) + '/issue-reports/proposals';
const proposal = (order: string, id: string) => proposals(order) + '/' + segment(id);
const ticket = (ref: string) => '/support/tickets/' + segment(ref);
async function owned<T>(operation: () => Promise<T>): Promise<T> {
  const owner = authSessionOwner();
  const principal = useAuthStore.getState().user?.id;
  if (!useAuthStore.getState().token || !useAuthStore.getState().user) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  assertAuthSessionOwner(owner);
  const result = await operation();
  assertAuthSessionOwner(owner);
  if (useAuthStore.getState().user?.id !== principal || !useAuthStore.getState().token) throw new Error('Authentication operation superseded');
  return result;
}
function supportPort(assertAdmission?: () => void): SupportPort {
  const post = <T>(path: string, body: object) => assertAdmission
    ? postSessionMutation<T>(path, body, assertAdmission) : postSessionMutation<T>(path, body);
  const patch = <T>(path: string, body: object) => assertAdmission
    ? patchSessionMutation<T>(path, body, assertAdmission) : patchSessionMutation<T>(path, body);
  return {
  withAdmission: additional => supportPort(() => { assertAdmission?.(); additional(); }),
  open: (o, nonce, surface, resume) => owned(async () => reportProposal(await post(proposals(o), { open_nonce: nonce, surface, resume_latest: resume }))),
  recover: (o, p) => owned(async () => reportProposal((await api.get(proposal(o, p))).data)),
  save: (o, p, revision, draft, surface) => owned(async () => reportProposal(await patch(proposal(o, p), { expected_revision: revision, draft: issueDraft(draft), surface }))),
  guide: (o, p, revision, nonce, body) => owned(async () => reportProposal(await post(proposal(o, p) + '/guidance', { expected_revision: revision, turn_nonce: nonce, body: text(body) }))),
  confirm: (o, p, revision, digest) => owned(async () => {
    const body = { proposal_id: p, confirmed_revision: revision, content_digest: text(digest, 64) };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 16384) return fail();
    return reportProposal(await post('/orders/' + segment(o) + '/issue-reports', body));
  }),
  conversation: (ref, cursor) => owned(async () => customerConversation((await api.get(ticket(ref) + '/conversation', { params: cursor ? { cursor } : undefined })).data)),
  reply: (ref, nonce, body) => owned(async () => customerConversation(await post(ticket(ref) + '/customer-messages', { client_message_nonce: nonce, body: text(body) }))),
  receipt: (ref, id, version) => owned(async () => { await post(ticket(ref) + '/customer-receipts', { message_id: id, version }); }),
  };
}
export const support: SupportPort = supportPort();
