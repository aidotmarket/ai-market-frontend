import { useAuthStore } from '@/store/auth';
import { authSessionOwner, isAuthSessionOwner, subscribeAuthSessionOwner } from './auth-session-owner';
import { customerConversation, issueDraft, canonicalIssue, issueDigest, type OrderViewFailure, type IssueDraft, type ReportProposal, type ReportSurface, type SupportPort, type CustomerConversation, type ReportConfirmation } from '@/api/support';
import { selectRecoveryTicket, selectedRecoveryTicket, retireRecoveryTicket, type RecoveryBinding } from './session-view-recovery';
import type { RecoveryPort } from '@/api/support-recovery';

interface ReplyState {
  conversation: CustomerConversation | null; body: string; busy: boolean;
  unknown: boolean; retryReady: boolean; validated: boolean; error: string | null; readFailed: boolean; renderFailed: boolean;
}
const emptyReply = (): ReplyState => ({ conversation: null, body: '', busy: false,
  unknown: false, retryReady: false, validated: false, error: null, readFailed: false, renderFailed: false });
interface ReplyCommand { publicRef: string; conversationId: string; nonce: string; body: string }
export interface ReportState {
  reply: ReplyState;
  proposal: ReportProposal | null; draft: IssueDraft; busy: boolean; saved: boolean;
  reviewed: boolean; reconcile: boolean; guidanceRetry: boolean; error: string | null; surface: ReportSurface; retired: boolean;
}
interface GuidanceTurn { proposalId: string; conversationId: string; revision: number; nonce: string; body: string }
const initial = (): ReportState => ({ reply: emptyReply(), proposal: null, draft: { category: 'other', description: '' },
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
  private ownConfirmation: Omit<ReportConfirmation, 'original'> | null = null;
  getConfirmation = () => this.ownConfirmation ?? this.state.proposal?.confirmation ?? null;
  static conversation(receipt: Omit<ReportConfirmation, 'original'>, port: SupportPort) {
    const session = new OrderIssueSession('', port);
    session.ownConfirmation = receipt;
    return session;
  }
  observeFailure = (failure: OrderViewFailure) => { this.observedFailure = failure; this.set({}); };
  suspendRecovery = () => {
    if (this.recoveryBinding) retireRecoveryTicket(this.recoveryBinding);
    this.recoveryBinding = null;
    this.localGeneration++;
    this.proposalEpoch++;
    if (this.state.busy) this.set({ busy: false, reconcile: true, reviewed: false,
      error: 'The result is unknown. Recover this same proposal before continuing.' });
  };
  suspendConversation = () => {
    if (!this.current()) return;
    this.replyEpoch++;
    if (!this.replyFlight) return;
    this.replyFlight = null;
    this.setReply({ busy: false, validated: false, retryReady: false,
      ...(this.replyCommand ? { unknown: true, error: 'Reply result is unknown. Read the original conversation before retrying the same reply.' } : { error: null }) });
  };
  fresh = () => { this.resume = false; };
  private listeners = new Set<() => void>();
  private owner = authSessionOwner();
  private principal = useAuthStore.getState().user?.id;
  private openNonce = crypto.randomUUID();
  private resume = true;
  private pendingTurn: GuidanceTurn | null = null;
  private localDraft = false;
  private localSurface = false;
  private replyCommand: ReplyCommand | null = null;
  private replyFlight: object | null = null;
  private replyEpoch = 0;
  private copyDraft: IssueDraft | null = null;
  private unsubscribe: () => void;
  private unsubscribeOwner: () => void;
  private recoveryBinding: RecoveryBinding | null = null;
  private localGeneration = 0;
  private proposalEpoch = 0;
  recoverySnapshot = () => ({
    saved_drafts: { draft: this.state.draft, proposal: this.state.proposal, copyDraft: this.copyDraft, surface: this.state.surface },
    unsent_text: { reply: this.state.reply.body, pendingTurn: this.pendingTurn },
    conversation_selection: { order: this.orderId, proposal: this.state.proposal?.proposal_id, confirmation: this.getConfirmation() },
    unknown_mutations: { pendingTurn: this.pendingTurn, replyCommand: this.replyCommand, replyUnknown: this.state.reply.unknown, reconcile: this.state.reconcile, busy: this.state.busy, replyBusy: this.state.reply.busy },
    generation: this.localGeneration,
  });
  installRecoveredConversation = (data: unknown): CustomerConversation => {
    const confirmation = this.getConfirmation();
    if (!this.current() || !confirmation || this.replyFlight) throw new Error('Conversation changed');
    const value = customerConversation(data);
    this.validateConversation(value, confirmation);
    const versions = new Map(this.state.reply.conversation?.messages.map(m => [m.id + ':' + m.version, m]) ?? []);
    value.messages.forEach(m => versions.set(m.id + ':' + m.version, m));
    const conversation = { ...value, messages: [...versions.values()] };
    // Reading never reconciles an uncertain message or discards its command.
    this.setReply({ conversation, error: null, readFailed: false, renderFailed: false, validated: !this.state.reply.unknown && !this.replyCommand });
    return conversation;
  };
  constructor(public orderId: string, readonly port: SupportPort, private recoveryId: string | null = null, public observedFailure?: OrderViewFailure) {
    this.port = port.withAdmission?.(() => { if (!this.current()) throw new Error('Order report visit retired'); }) ?? port;
    this.unsubscribeOwner = subscribeAuthSessionOwner(() => this.retire());
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
    if (this.recoveryBinding) retireRecoveryTicket(this.recoveryBinding);
    this.recoveryBinding = null;
    this.ownConfirmation = null;
    this.resetReply();
    this.localDraft = false; this.localSurface = false;
    this.copyDraft = null;
    this.pendingTurn = null;
    this.principal = undefined; this.openNonce = ''; this.orderId = ''; this.recoveryId = null;
    this.state = { ...initial(), retired: true };
    this.unsubscribe?.(); this.unsubscribeOwner?.();
    this.listeners.forEach(callback => callback());
  };
  private accept(proposal: ReportProposal, completedTurn?: GuidanceTurn) {
    if (this.recoveryId && proposal.proposal_id !== this.recoveryId) throw new Error('SUPPORT_WIRE_INVALID');
    if (this.state.proposal && (proposal.proposal_id !== this.state.proposal.proposal_id ||
      proposal.conversation_id !== this.state.proposal.conversation_id || proposal.revision < this.state.proposal.revision)) throw new Error('SUPPORT_WIRE_INVALID');
    if (proposal.confirmation && proposal.confirmation.conversation_id !== proposal.conversation_id)
      throw new Error('SUPPORT_WIRE_INVALID');
    const previousConfirmation = this.getConfirmation();
    if (previousConfirmation && (!proposal.confirmation || proposal.confirmation.public_ref !== previousConfirmation.public_ref ||
      proposal.confirmation.conversation_id !== previousConfirmation.conversation_id)) throw new Error('SUPPORT_WIRE_INVALID');
    // A direct valid guidance response completes this call even without a nonce echo.
    // Recovery alone only acknowledges a turn via the server's completed nonce list.
    if (proposal.confirmation || (this.pendingTurn &&
      this.pendingTurn.proposalId === proposal.proposal_id && this.pendingTurn.conversationId === proposal.conversation_id &&
      (this.pendingTurn === completedTurn || proposal.completed_guidance_nonces.includes(this.pendingTurn.nonce)))) this.pendingTurn = null;
    const copied = this.copyDraft;
    this.copyDraft = null;
    this.localDraft = copied !== null;
    this.localSurface = false;
    this.set({ proposal, draft: copied ?? proposal.draft, surface: proposal.surface, saved: copied === null, reviewed: false, reconcile: false, guidanceRetry: this.pendingTurn !== null, error: null });
    if (!copied && !proposal.confirmation && !proposal.draft.description && proposal.draft.category === 'other' && this.observedFailure) {
      this.localDraft = true;
      this.set({ draft: { category: 'other', description: 'My order details could not be displayed.', failed_operation: this.observedFailure }, saved: false });
    }
    if (proposal.confirmation && this.recoveryBinding && !this.recoveryBinding.current()) {
      retireRecoveryTicket(this.recoveryBinding); this.recoveryBinding = null;
    }
    if (proposal.confirmation && !this.recoveryBinding && this.port.recoveryCurrent && this.port.retainRecoveryContext && this.port.recoveryStep && this.port.recoveryStatus) {
      const confirmation = proposal.confirmation;
      this.recoveryBinding = { ref: confirmation.public_ref, conversation: confirmation.conversation_id,
        ...(confirmation.original.failed_operation ? { operation: { view: 'order_detail' as const,
          failure: confirmation.original.failed_operation === 'order_detail:render_failed' ? 'render_failed' as const : 'normal_read_failed' as const, target: this.orderId } } : {}),
        current: () => this.current() && this.getConfirmation() === confirmation && selectedRecoveryTicket() === this.recoveryBinding,
        snapshot: this.recoverySnapshot, port: this.port as RecoveryPort };
      selectRecoveryTicket(this.recoveryBinding);
    }
  }
  private async run(operation: (port: SupportPort) => Promise<ReportProposal>, completedTurn?: GuidanceTurn): Promise<void> {
    if (!this.current() || this.state.busy) return;
    this.localGeneration++;
    const epoch = this.proposalEpoch;
    const current = () => this.current() && epoch === this.proposalEpoch;
    const port = this.port.withAdmission?.(() => { if (!current()) throw new Error('Report selection changed'); }) ?? this.port;
    this.set({ busy: true, error: null });
    try { const result = await operation(port); if (current()) this.accept(result, completedTurn); }
    catch (error) {
      if (current()) this.set({ error: failure(error), reviewed: false,
        reconcile: ![403, 404, 429].includes(status(error) ?? 0) });
    } finally { if (current()) this.set({ busy: false }); }
  }
  open = () => this.run(port => this.recoveryId
    ? port.recover(this.orderId, this.recoveryId)
    : port.open(this.orderId, this.openNonce, this.state.surface, this.resume));
  recover = async () => {
    const epoch = this.proposalEpoch;
    const local = this.localDraft ? this.state.draft : null;
    const surface = this.localSurface ? this.state.surface : null;
    await this.run(port => this.state.proposal
      ? port.recover(this.orderId, this.state.proposal.proposal_id)
      : this.recoveryId ? port.recover(this.orderId, this.recoveryId)
      : port.open(this.orderId, this.openNonce, this.state.surface, this.resume));
    if (this.current() && epoch === this.proposalEpoch && this.state.proposal && !this.state.proposal.confirmation) {
      if (local) this.localDraft = true;
      if (surface) this.localSurface = true;
      this.set({ ...(local ? { draft: local } : {}), ...(surface ? { surface } : {}),
        saved: canonicalIssue(local ?? this.state.draft) === canonicalIssue(this.state.proposal.draft) &&
          (surface ?? this.state.surface) === this.state.proposal.surface, reviewed: false });
    }
  };
  edit = (draft: IssueDraft) => {
    if (!this.current() || this.state.busy || this.getConfirmation() || this.state.reconcile) return;
    this.localGeneration++; this.localDraft = true;
    this.set({ draft: issueDraft(draft.category === 'other' ? draft : { ...draft, failed_operation: undefined }), saved: false, reviewed: false });
  };
  plain = () => {
    if (!this.current() || this.getConfirmation() || this.state.busy || this.state.reconcile) return;
    this.pendingTurn = null;
    this.localSurface = true;
    this.set({ guidanceRetry: false, surface: 'web', saved: false, reviewed: false });
  };
  save = async () => {
    const { proposal, draft, surface, reconcile } = this.state;
    if (!proposal || proposal.confirmation || reconcile || !draft.description.trim()) return;
    await this.run(port => port.save(this.orderId, proposal.proposal_id, proposal.revision, issueDraft(draft), surface));
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
    this.pendingTurn ??= { proposalId: proposal.proposal_id, conversationId: proposal.conversation_id, revision: proposal.revision, nonce: crypto.randomUUID(), body };
    await this.sendTurn();
  };
  private sendTurn = async () => {
    const command = this.pendingTurn;
    const epoch = this.proposalEpoch;
    const proposal = this.state.proposal;
    if (!command || !proposal || proposal.confirmation || command.proposalId !== proposal.proposal_id ||
      command.conversationId !== proposal.conversation_id) return;
    await this.run(port => port.guide(this.orderId, command.proposalId, command.revision, command.nonce, command.body), command);
    if (this.current() && epoch === this.proposalEpoch && this.pendingTurn === command) this.set({ guidanceRetry: true });
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
    await this.run(async port => {
      if (new TextEncoder().encode(canonical).length > 16384) throw new Error('SUPPORT_WIRE_INVALID');
      const digest = await issueDigest(draft);
      if (!this.current()) throw new Error('Authentication operation superseded');
      return port.confirm(this.orderId, proposal.proposal_id, proposal.revision, digest);
    });
  };
  copyExpired = async () => {
    const epoch = this.proposalEpoch;
    const previous = this.state;
    if (!this.current() || previous.busy || previous.reconcile || !previous.proposal || previous.proposal.confirmation ||
      Date.parse(previous.proposal.expires_at) > Date.now()) return;
    this.pendingTurn = null;
    this.resetReply();
    this.copyDraft = previous.draft;
    this.recoveryId = null;
    this.openNonce = crypto.randomUUID(); this.resume = false;
    this.set({ proposal: null, saved: false, reviewed: false, guidanceRetry: false });
    await this.run(port => port.open(this.orderId, this.openNonce, previous.surface, false));
    if (this.current() && epoch === this.proposalEpoch && this.state.proposal && !this.state.proposal.confirmation)
      this.set({ draft: previous.draft, saved: false, reviewed: false });
  };
  newReport = async () => {
    if (!this.current() || this.state.busy || !this.getConfirmation()) return;
    this.pendingTurn = null;
    this.resetReply(); this.localDraft = false; this.localSurface = false;
    this.recoveryId = null;
    this.openNonce = crypto.randomUUID(); this.resume = false;
    this.set(initial()); await this.open();
  };
  private resetReply() {
    this.localGeneration++;
    if (this.recoveryBinding) retireRecoveryTicket(this.recoveryBinding);
    this.recoveryBinding = null;
    this.replyEpoch += 1;
    this.replyFlight = null;
    this.replyCommand = null;
  }
  private setReply(patch: Partial<ReplyState>) { this.set({ reply: { ...this.state.reply, ...patch } }); }
  private replyCurrent(epoch: number, confirmation: Omit<ReportConfirmation, 'original'>, flight: object): boolean {
    const now = this.getConfirmation();
    return this.current() && epoch === this.replyEpoch && this.replyFlight === flight &&
      now?.public_ref === confirmation.public_ref && now?.conversation_id === confirmation.conversation_id;
  }
  private validateConversation(value: CustomerConversation, confirmation: Omit<ReportConfirmation, 'original'>) {
    if (value.public_ref !== confirmation.public_ref || value.conversation_id !== confirmation.conversation_id)
      throw new Error('SUPPORT_WIRE_INVALID');
  }
  editReply = (body: string) => {
    if (!this.current() || !this.getConfirmation() || this.state.reply.busy || this.replyCommand) return;
    this.localGeneration++; this.setReply({ body });
  };
  conversationRenderFailed = () => { if (this.state.reply.conversation) this.setReply({ renderFailed: true }); };
  // Mounting a view never reconciles an uncertain command or replays it.
  ensureConversation = () => {
    if (!this.state.reply.validated && !this.state.reply.unknown && !this.state.reply.error)
      return this.loadConversation();
  };
  loadConversation = async (cursor?: string) => {
    const confirmation = this.getConfirmation();
    if (!this.current() || !confirmation || this.replyFlight) return;
    this.localGeneration++;
    const epoch = this.replyEpoch, flight = {};
    const previous = this.state.reply.conversation;
    this.replyFlight = flight;
    this.setReply({ busy: true, error: null, validated: false, retryReady: false });
    try {
      const value = await this.port.conversation(confirmation.public_ref, cursor);
      if (!this.replyCurrent(epoch, confirmation, flight)) return;
      this.validateConversation(value, confirmation);
      if (cursor && previous) {
        const versions = new Map(previous.messages.map(m => [m.id + ':' + m.version, m]));
        value.messages.forEach(m => versions.set(m.id + ':' + m.version, m));
        this.setReply({ conversation: { ...value, messages: [...versions.values()] } });
      } else this.setReply({ conversation: value });
      // A read establishes current access/projection, not proof of a lost reply's outcome.
      this.setReply({ validated: true, retryReady: this.replyCommand !== null, readFailed: false, renderFailed: false });
    } catch {
      if (this.replyCurrent(epoch, confirmation, flight)) this.setReply({ readFailed: true, error: 'Conversation could not be loaded. Your ticket is retained.' });
    } finally {
      if (this.replyCurrent(epoch, confirmation, flight)) { this.replyFlight = null; this.setReply({ busy: false }); }
    }
  };
  recordReceipt = async (confirmation: Omit<ReportConfirmation, 'original'>, message: string, version: string) => {
    const epoch = this.replyEpoch;
    const assertCurrent = () => {
      const now = this.getConfirmation();
      const displayed = this.state.reply.conversation?.messages ?? [confirmation.acknowledgement];
      if (!displayed.some(m => m.id === message && m.version === version && m.direction === 'outbound') || !this.current() || epoch !== this.replyEpoch || now?.public_ref !== confirmation.public_ref ||
        now?.conversation_id !== confirmation.conversation_id) throw new Error('Original receipt superseded');
    };
    assertCurrent();
    const port = this.port.withAdmission?.(assertCurrent) ?? this.port;
    await port.receipt(confirmation.public_ref, message, version);
  };
  sendReply = async () => {
    const confirmation = this.getConfirmation(), reply = this.state.reply;
    if (!this.current() || !confirmation || this.replyFlight || !reply.validated ||
      (reply.unknown && !reply.retryReady) || !reply.body.trim() || reply.body.length > 4000) return;
    this.localGeneration++;
    this.replyCommand ??= { publicRef: confirmation.public_ref, conversationId: confirmation.conversation_id,
      body: reply.body, nonce: crypto.randomUUID() };
    const command = this.replyCommand;
    if (command.publicRef !== confirmation.public_ref || command.conversationId !== confirmation.conversation_id || command.body !== reply.body) return;
    const epoch = this.replyEpoch, flight = {};
    this.replyFlight = flight;
    this.setReply({ busy: true, error: null, retryReady: false });
    try {
      const port = this.port.withAdmission?.(() => {
        if (!this.replyCurrent(epoch, confirmation, flight)) throw new Error('Original reply superseded');
      }) ?? this.port;
      const value = await port.reply(command.publicRef, command.nonce, command.body);
      if (!this.replyCurrent(epoch, confirmation, flight)) return;
      this.validateConversation(value, confirmation);
      this.replyCommand = null;
      this.setReply({ conversation: value, body: '', unknown: false, validated: true });
    } catch {
      if (this.replyCurrent(epoch, confirmation, flight)) this.setReply({ unknown: true, validated: false,
        error: 'Reply result is unknown. Read the original conversation before retrying the same reply.' });
    } finally {
      if (this.replyCurrent(epoch, confirmation, flight)) { this.replyFlight = null; this.setReply({ busy: false }); }
    }
  };

}
