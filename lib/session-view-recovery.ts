import type { RecoveryContext, RecoveryKind, RecoveryPort, RecoveryResult, PreservedState } from '@/api/support-recovery';
import { reserveRecoveryRefresh } from '@/api/client';
import { authSessionOwner, isAuthSessionOwner } from './auth-session-owner';
import { useAuthStore } from '@/store/auth';

export interface LocalRecoveryState {
  saved_drafts: unknown; unsent_text: unknown; conversation_selection: unknown; unknown_mutations: unknown;
  generation: number | string;
}
export interface RecoveryDisplay {
  // Only the controller's exact installed read can cross the display boundary.
  readonly read: object; readonly read_id: string; readonly content_digest: string;
}
export interface RecoveryBinding {
  ref: string; conversation: string; current(): boolean; snapshot(): LocalRecoveryState; port: RecoveryPort;
}
export interface RecoveryAdapter {
  view: RecoveryKind; walletOffset?: number;
  current(): boolean; snapshot(): LocalRecoveryState;
  install(data: unknown): object;
  prepareRefresh?(): void;
  acceptRefresh?(token: string): Promise<void>;
  finish?(): void;
}
type Stage = 'waiting' | 'starting' | 'refreshing' | 'reloading' | 'rendering' | 'verified' | 'stopped';
export interface RecoveryProgress { stage: Stage; message: string; display: RecoveryDisplay | null }
const stopped = 'Recovery stopped. Your drafts and pending work are retained; this issue still needs support.';
type TerminalPhase = 'failed' | 'refused' | 'unknown';
class RecoveryStateError extends Error {
  constructor(readonly phase: TerminalPhase) { super('Recovery could not continue'); }
}
function terminalPhase(error: unknown): TerminalPhase {
  if (error instanceof RecoveryStateError) return error.phase;
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 429) return 'failed';
  if ([401, 403, 404, 409, 410].includes(status ?? 0)) return 'refused';
  return 'unknown';
}
const serialize = (value: unknown) => JSON.stringify(value);
async function hashes(local: LocalRecoveryState): Promise<PreservedState> {
  const keys = ['saved_drafts', 'unsent_text', 'conversation_selection', 'unknown_mutations'] as const;
  const result = {} as PreservedState;
  for (const key of keys) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialize(local[key])));
    result[key] = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  return result;
}

// Visit-local, one context and one attempt. Status can reconcile immutable facts,
// but never reconstruct execution permission after a lost response.
export class SessionViewRecovery {
  readonly contextId = crypto.randomUUID();
  readonly clientEpoch = crypto.randomUUID();
  private owner = authSessionOwner();
  private principal = useAuthStore.getState().user?.id;
  private token = useAuthStore.getState().token;
  private local: { ticket: LocalRecoveryState; view: LocalRecoveryState };
  private fingerprint: string;
  private preserved: PreservedState | null = null;
  private context: RecoveryContext | null = null;
  private operation: string | null = null;
  private attempted = false;
  private retired = false;
  private busy = false;
  private renderSent = false;
  private readFingerprint: string | null = null;
  private lease: ReturnType<typeof reserveRecoveryRefresh> | null = null;
  private listeners = new Set<() => void>();
  private progress: RecoveryProgress = { stage: 'waiting', message: 'Checking recovery for this view. Your support conversation remains available.', display: null };
  constructor(private binding: RecoveryBinding, private adapter: RecoveryAdapter, private failure: RecoveryContext['failure'] = 'normal_read_failed') {
    // Keep actual objects/commands in their owning controllers and here in memory.
    this.local = { ticket: binding.snapshot(), view: adapter.snapshot() };
    this.fingerprint = serialize(this.local);
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.progress;
  private emit(patch: Partial<RecoveryProgress>) { this.progress = { ...this.progress, ...patch }; this.listeners.forEach(fn => fn()); }
  private authorized() {
    return !this.retired && isAuthSessionOwner(this.owner) && this.binding.current() && this.adapter.current()
      && !!this.principal && useAuthStore.getState().user?.id === this.principal && !!useAuthStore.getState().token;
  }
  private assert = () => {
    if (!this.authorized() || useAuthStore.getState().token !== this.token
      || serialize({ ticket: this.binding.snapshot(), view: this.adapter.snapshot() }) !== this.fingerprint)
      throw new Error('Recovery owner, selection or local work changed');
  };
  private scopedPort() {
    const p = this.binding.port as RecoveryPort & { withAdmission?: (fn: () => void) => RecoveryPort };
    return p.withAdmission?.(this.assert) ?? p;
  }
  private checkResult(r: RecoveryResult, state: RecoveryResult['state']) {
    this.assert();
    if (r.operation_id !== this.operation || r.view !== this.adapter.view || r.state !== state || r.refresh_count !== 1 || r.reload_count !== 1)
      throw new RecoveryStateError(r.state === 'failed' ? 'failed' : ['refused', 'refused_before_dispatch'].includes(r.state) ? 'refused' : 'unknown');
  }
  observe = async () => {
    if (this.busy || this.retired || ['verified', 'stopped', 'rendering'].includes(this.progress.stage)) return;
    this.busy = true;
    try {
      this.assert();
      const p = this.scopedPort();
      if (!this.context) {
        const current = await p.recoveryCurrent(this.binding.ref); this.assert();
        if (current.ticket_context.conversation_id !== this.binding.conversation) throw new Error('Selected ticket changed');
        const combined: LocalRecoveryState = {
          saved_drafts: [this.local.ticket.saved_drafts, this.local.view.saved_drafts],
          unsent_text: [this.local.ticket.unsent_text, this.local.view.unsent_text],
          conversation_selection: [this.local.ticket.conversation_selection, this.local.view.conversation_selection],
          unknown_mutations: [this.local.ticket.unknown_mutations, this.local.view.unknown_mutations], generation: 0,
        };
        this.preserved = await hashes(combined); this.assert();
        this.context = { context_id: this.contextId, client_epoch: this.clientEpoch,
          expected_revision: current.ticket_context.expected_revision, symptom_message_id: current.ticket_context.symptom_message_id,
          view: this.adapter.view, failure: this.failure, preserved: this.preserved,
          ...(this.adapter.view === 'wallet' ? { wallet_offset: this.adapter.walletOffset ?? 0 } : {}) };
        const retained = await p.retainRecoveryContext(this.binding.ref, this.context); this.assert();
        if (retained.context_id !== this.contextId || retained.revision !== this.context.expected_revision || retained.state !== 'context_retained') throw new Error('Context not retained');
      }
      const current = await p.recoveryCurrent(this.binding.ref); this.assert();
      if (current.context_id !== this.contextId || current.client_epoch !== this.clientEpoch
        || current.ticket_context.conversation_id !== this.binding.conversation
        || current.ticket_context.expected_revision !== this.context.expected_revision
        || current.ticket_context.symptom_message_id !== this.context.symptom_message_id) throw new Error('Ticket context changed');
      if (!current.action) { this.emit({ message: 'Waiting for support to accept recovery of this view. You can continue in your original conversation.' }); return; }
      if (this.attempted) return;
      this.operation = current.action.operation_id;
      this.checkResult(current.action, 'admitted_waiting_client');
      this.lease = reserveRecoveryRefresh(this.assert);
      this.attempted = true;
      this.emit({ stage: 'starting', message: 'Preparing one session refresh. Your drafts are retained.' });
      const start = await p.recoveryStep(this.binding.ref, this.operation, this.step('start'));
      this.checkResult(start, 'attempt_started');
      if (start.execute_once !== true) throw new Error('No one-use permission');
      this.emit({ stage: 'refreshing', message: 'Refreshing your session once.' });
      // This callback permits only this refresh's token update; all local fences
      // still hold before persistence. No token enters support evidence.
      const oldToken = this.token;
      this.adapter.prepareRefresh?.();
      const token = await this.lease.refresh();
      if (!this.authorized() || this.token !== oldToken || useAuthStore.getState().token !== token) throw new Error('Refresh owner changed');
      this.token = token;
      await this.adapter.acceptRefresh?.(token);
      this.assert();
      this.emit({ stage: 'reloading', message: 'Loading the view that failed.' });
      const read = await p.recoveryStep(this.binding.ref, this.operation, this.step('reload'));
      this.checkResult(read, 'read_observed');
      if (!read.read_id || !read.content_digest || read.data == null) throw new Error('Missing exact read receipt');
      let installed: object;
      try { installed = this.adapter.install(read.data); } catch { throw new RecoveryStateError('failed'); }
      this.assert();
      this.readFingerprint = serialize(installed);
      this.emit({ stage: 'rendering', message: 'Checking that this view is visible.', display: Object.freeze({ read: installed, read_id: read.read_id, content_digest: read.content_digest }) });
    } catch (error) { await this.stop(terminalPhase(error)); }
    finally { this.busy = false; }
  };
  private step(phase: 'start' | 'reload' | 'render' | TerminalPhase) {
    if (!this.preserved) throw new Error('No preserved context');
    return { client_epoch: this.clientEpoch, phase, preserved: this.preserved };
  }
  visible = async (display: RecoveryDisplay) => {
    if (this.renderSent || this.progress.stage !== 'rendering' || display !== this.progress.display || !this.operation) return;
    this.renderSent = true;
    try {
      this.assert();
      if (serialize(display.read) !== this.readFingerprint) throw new Error('Installed read changed');
      const r = await this.scopedPort().recoveryStep(this.binding.ref, this.operation,
        { ...this.step('render'), read_id: display.read_id, content_digest: display.content_digest });
      this.checkResult(r, 'verified_view_loaded');
      if (!r.evidence_ref) throw new Error('Missing render evidence');
      this.emit({ stage: 'verified', message: 'This view loaded with your drafts retained. Support will confirm the reported outcome separately.' });
      this.lease?.release(); this.lease = null;
      this.adapter.finish?.();
    } catch (error) { await this.stop(terminalPhase(error)); }
  };
  stop = async (phase: TerminalPhase = 'unknown') => {
    if (this.progress.stage === 'stopped' || this.progress.stage === 'verified') return;
    this.emit({ stage: 'stopped', message: stopped, display: null });
    // If authorization or preserved state drifted, leave immutable facts for C5.
    try { this.assert(); if (this.operation) await this.scopedPort().recoveryStep(this.binding.ref, this.operation, this.step(phase)); } catch { /* no retry */ }
    finally { this.lease?.release(); this.lease = null; this.adapter.finish?.(); }
  };
  retire = () => { void this.stop(); this.retired = true; };
}

let selected: RecoveryBinding | null = null;
const listeners = new Set<() => void>();
export const selectedRecoveryTicket = () => selected;
export const subscribeRecoveryTicket = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function selectRecoveryTicket(binding: RecoveryBinding) { selected = binding; listeners.forEach(fn => fn()); }
export function retireRecoveryTicket(binding: RecoveryBinding) { if (selected === binding) { selected = null; listeners.forEach(fn => fn()); } }
