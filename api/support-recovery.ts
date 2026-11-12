// Closed customer contract from immutable backend a3b07c2.
export const recoveryViews = ['support_conversation', 'order_detail', 'request_thread', 'wallet'] as const;
export type RecoveryKind = typeof recoveryViews[number];
export type PreservedState = Record<'saved_drafts' | 'unsent_text' | 'conversation_selection' | 'unknown_mutations', string>;
export interface RecoveryContext {
  context_id: string; client_epoch: string; expected_revision: number; symptom_message_id: string;
  view: RecoveryKind; failure: 'normal_read_failed' | 'render_failed'; preserved: PreservedState; wallet_offset?: number;
}
export interface RecoveryStep {
  client_epoch: string; phase: 'start' | 'reload' | 'render' | 'failed' | 'refused' | 'unknown';
  preserved: PreservedState; read_id?: string; content_digest?: string;
}
const states = ['refused_before_dispatch', 'admitted_waiting_client', 'attempt_started', 'read_observed', 'view_loaded_original_unverified', 'unknown', 'failed', 'refused', 'verified_view_loaded'] as const;
export interface RecoveryResult {
  operation_id: string; state: typeof states[number]; reason?: string | null; view?: RecoveryKind | null;
  execute_once: boolean; refresh_count: 1; reload_count: 1;
  read_id?: string | null; content_digest?: string | null; data?: unknown; evidence_ref?: string | null;
}
export interface RecoveryCurrent {
  ticket_context: { expected_revision: number; symptom_message_id: string; conversation_id: string };
  action: RecoveryResult | null; context_id?: string | null; client_epoch?: string | null;
}
export interface RecoveryPort {
  retainRecoveryContext(ref: string, context: RecoveryContext): Promise<{ context_id: string; state: 'context_retained'; revision: number }>;
  recoveryCurrent(ref: string): Promise<RecoveryCurrent>;
  recoveryStatus(ref: string, operation: string): Promise<RecoveryResult>;
  recoveryStep(ref: string, operation: string, step: RecoveryStep): Promise<RecoveryResult>;
}
function invalid(): never { throw new Error('SUPPORT_RECOVERY_WIRE_INVALID'); }
export function recoveryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
}
export function recoveryUUID(value: unknown): string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : invalid();
}
export function recoveryResult(value: unknown): RecoveryResult {
  const r = recoveryRecord(value);
  recoveryUUID(r.operation_id);
  if (!states.includes(r.state as RecoveryResult['state']) || typeof r.execute_once !== 'boolean' || r.refresh_count !== 1 || r.reload_count !== 1
    || (r.view != null && !recoveryViews.includes(r.view as RecoveryKind))
    || (r.reason != null && (typeof r.reason !== 'string' || r.reason.length > 256))) return invalid();
  if (r.read_id != null) recoveryUUID(r.read_id);
  if (r.evidence_ref != null) recoveryUUID(r.evidence_ref);
  if (r.content_digest != null && (typeof r.content_digest !== 'string' || !/^[0-9a-f]{64}$/.test(r.content_digest))) return invalid();
  return r as unknown as RecoveryResult;
}
export function recoveryCurrent(value: unknown): RecoveryCurrent {
  const r = recoveryRecord(value), t = recoveryRecord(r.ticket_context);
  recoveryUUID(t.symptom_message_id); recoveryUUID(t.conversation_id);
  if (!Number.isSafeInteger(t.expected_revision) || (t.expected_revision as number) < 1) return invalid();
  if (r.context_id != null) recoveryUUID(r.context_id);
  if (r.client_epoch != null) recoveryUUID(r.client_epoch);
  if (r.action !== null) recoveryResult(r.action);
  return r as unknown as RecoveryCurrent;
}
