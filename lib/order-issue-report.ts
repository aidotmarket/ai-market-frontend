import { useAuthStore } from '@/store/auth';
import { authSessionOwner, isAuthSessionOwner } from './auth-session-owner';
import { issueDraft, canonicalIssue, issueDigest, type IssueDraft, type ReportProposal, type ReportSurface, type SupportPort } from '@/api/support';

export interface ReportState {
  proposal: ReportProposal | null; draft: IssueDraft; busy: boolean; saved: boolean;
  reviewed: boolean; reconcile: boolean; guidanceRetry: boolean; error: string | null; surface: ReportSurface; retired: boolean;
}
const initial = (): ReportState => ({ proposal: null, draft: { category: 'other', description: '' },
  busy: false, saved: false, reviewed: false, reconcile: false, guidanceRetry: false, error: null, surface: 'allai', retired: false });
function status(error: unknown) { return (error as { response?: { status?: number } })?.response?.status; }
function failure(error: unknown): string {
  switch (status(error)) {
    case 409: return 'The saved version changed. Recover the proposal, then review it again.';
    case 429: return 'Please try again later. Your saved draft is retained.';
    case 403: return 'This report is unavailable for the current account.';
    case 404: case 503: return 'Order reporting is unavailable. Your draft is retained; existing support remains available.';
    default: return 'The result is unknown. Recover this same proposal before continuing.';
  }
}
// Visit memory only; the server owns durable recovery and principal/order authorization.
export class OrderIssueSession {
  readonly visitId = crypto.randomUUID();
  private state = initial();
  private listeners = new Set<() => void>();
  private owner = authSessionOwner();
  private principal = useAuthStore.getState().user?.id;
  private openNonce = crypto.randomUUID();
  private resume = true;
  private pendingTurn: { revision: number; nonce: string; body: string } | null = null;
  private copyDraft: IssueDraft | null = null;
  private unsubscribe: () => void;
  constructor(public orderId: string, readonly port: SupportPort, private recoveryId: string | null = null) {
    this.unsubscribe = useAuthStore.subscribe(() => { if (!this.current()) this.retire(); });
  }
  current = (): boolean => !this.state.retired && isAuthSessionOwner(this.owner) &&
    Boolean(this.principal && useAuthStore.getState().token && useAuthStore.getState().user?.id === this.principal);
  getSnapshot = (): ReportState => this.state;
  subscribe = (callback: () => void): (() => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private set(patch: Partial<ReportState>) {
    if (!this.current()) { this.retire(); return; }
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(callback => callback());
  }
  retire = () => {
    this.copyDraft = null;
    this.pendingTurn = null;
    this.principal = undefined; this.openNonce = ''; this.orderId = ''; this.recoveryId = null;
    this.state = { ...initial(), retired: true };
    this.unsubscribe?.();
    this.listeners.forEach(callback => callback());
  };
  private accept(proposal: ReportProposal) {
    if (this.state.proposal && (proposal.proposal_id !== this.state.proposal.proposal_id ||
      proposal.conversation_id !== this.state.proposal.conversation_id || proposal.revision < this.state.proposal.revision)) throw new Error('SUPPORT_WIRE_INVALID');
    if (this.pendingTurn && proposal.completed_guidance_nonces.includes(this.pendingTurn.nonce)) this.pendingTurn = null;
    const copied = this.copyDraft;
    this.copyDraft = null;
    this.set({ proposal, draft: copied ?? proposal.draft, surface: proposal.surface, saved: copied === null, reviewed: false, reconcile: false, guidanceRetry: this.pendingTurn !== null, error: null });
  }
  private async run(operation: () => Promise<ReportProposal>): Promise<void> {
    if (!this.current() || this.state.busy) return;
    this.set({ busy: true, error: null });
    try { const result = await operation(); if (this.current()) this.accept(result); }
    catch (error) {
      if (this.current()) this.set({ error: failure(error), reviewed: false,
        reconcile: ![403, 404, 429].includes(status(error) ?? 0) });
    } finally { if (this.current()) this.set({ busy: false }); }
  }
  open = () => this.run(() => this.recoveryId
    ? this.port.recover(this.orderId, this.recoveryId)
    : this.port.open(this.orderId, this.openNonce, this.state.surface, this.resume));
  recover = async () => {
    const local = !this.state.saved ? this.state.draft : null;
    await this.run(() => this.state.proposal
      ? this.port.recover(this.orderId, this.state.proposal.proposal_id)
      : this.recoveryId ? this.port.recover(this.orderId, this.recoveryId)
      : this.port.open(this.orderId, this.openNonce, this.state.surface, this.resume));
    if (this.current() && local && this.state.proposal && !this.state.proposal.confirmation)
      this.set({ draft: local, saved: canonicalIssue(local) === canonicalIssue(this.state.proposal.draft), reviewed: false });
  };
  edit = (draft: IssueDraft) => {
    if (!this.current() || this.state.busy || this.state.proposal?.confirmation || this.state.reconcile) return;
    this.set({ draft: issueDraft(draft), saved: false, reviewed: false });
  };
  plain = () => {
    if (this.state.proposal?.confirmation || this.state.busy || this.state.reconcile) return;
    this.pendingTurn = null;
    this.set({ guidanceRetry: false, surface: 'web', saved: false, reviewed: false });
  };
  save = async () => {
    const { proposal, draft, surface, reconcile } = this.state;
    if (!proposal || proposal.confirmation || reconcile || !draft.description.trim()) return;
    await this.run(() => this.port.save(this.orderId, proposal.proposal_id, proposal.revision, issueDraft(draft), surface));
  };
  guide = async (body: string) => {
    const { proposal, reconcile, saved } = this.state;
    if (this.state.surface !== 'allai' || !proposal || proposal.confirmation || reconcile || !saved || !body.trim() || body.length > 4000 ||
      proposal.guidance_turns >= 20 || proposal.guidance_bytes >= 65536 || proposal.guidance_state !== 'available') return;
    if (new TextEncoder().encode(body).length + proposal.guidance_bytes > 65536) {
      this.set({ error: 'Guidance capacity reached. Continue with the editable plain form.' }); return;
    }
    if (this.pendingTurn && this.pendingTurn.body !== body) {
      this.set({ error: 'Recover or explicitly retry the prior guidance turn, or continue with the plain form.' }); return;
    }
    this.pendingTurn ??= { revision: proposal.revision, nonce: crypto.randomUUID(), body };
    await this.sendTurn();
  };
  private sendTurn = async () => {
    const command = this.pendingTurn;
    const proposal = this.state.proposal;
    if (!command || !proposal) return;
    await this.run(async () => {
      const result = await this.port.guide(this.orderId, proposal.proposal_id, command.revision, command.nonce, command.body);
      this.pendingTurn = null;
      return result;
    });
    if (this.current() && this.pendingTurn) this.set({ guidanceRetry: true });
  };
  retryGuidance = async () => {
    if (!this.current() || this.state.busy || this.state.reconcile) return;
    await this.sendTurn();
  };
  review = (reviewed: boolean) => {
    if (this.state.saved && !this.state.busy && !this.state.reconcile) this.set({ reviewed });
  };
  confirm = async () => {
    const { proposal, draft, saved, reviewed, reconcile } = this.state;
    if (!this.current() || this.state.busy || !proposal || proposal.confirmation || !saved || !reviewed || reconcile ||
      proposal.enrollment !== 'enabled' || Date.parse(proposal.expires_at) <= Date.now() || !draft.description.trim()) return;
    const canonical = canonicalIssue(draft);
    if (new TextEncoder().encode(JSON.stringify({ draft: issueDraft(draft), context: proposal.context })).length > 16384) {
      this.set({ error: 'The report is too large to file. Shorten the description or error text, then save and review again.', reviewed: false }); return;
    }
    await this.run(async () => {
      if (new TextEncoder().encode(canonical).length > 16384) throw new Error('SUPPORT_WIRE_INVALID');
      const digest = await issueDigest(draft);
      if (!this.current()) throw new Error('Authentication operation superseded');
      return this.port.confirm(this.orderId, proposal.proposal_id, proposal.revision, digest);
    });
  };
  copyExpired = async () => {
    const previous = this.state;
    if (!this.current() || previous.busy || previous.reconcile || !previous.proposal || previous.proposal.confirmation ||
      Date.parse(previous.proposal.expires_at) > Date.now()) return;
    this.copyDraft = previous.draft;
    this.recoveryId = null;
    this.openNonce = crypto.randomUUID(); this.resume = false;
    this.set({ proposal: null, saved: false, reviewed: false });
    await this.run(() => this.port.open(this.orderId, this.openNonce, previous.surface, false));
    if (this.current() && this.state.proposal && !this.state.proposal.confirmation)
      this.set({ draft: previous.draft, saved: false, reviewed: false });
  };
  newReport = async () => {
    if (!this.current() || this.state.busy || !this.state.proposal?.confirmation) return;
    this.recoveryId = null;
    this.openNonce = crypto.randomUUID(); this.resume = false;
    this.set(initial()); await this.open();
  };
}
