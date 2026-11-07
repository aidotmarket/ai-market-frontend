import { vi } from 'vitest';
import type { ReportProposal, ReportConfirmation, SupportPort, CustomerConversation, IssueDraft, ReportSurface } from '@/api/support';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import type { User } from '@/types';

export function principal(role: 'buyer' | 'seller' = 'buyer', id = role + '-fixture') {
  advanceAuthSessionOwner();
  useAuthStore.setState({ user: { id, role } as User, token: 'fixture-only-token', isAuthenticated: true });
}
export const context = {
  order_number: 'ORDER-42', status: 'paid', amount_cents: 500, currency: 'EUR', created_at: '2026-11-07',
  paid_at: null, delivered_at: null, delivery_type: 'download', max_downloads: null, downloads_used: 0,
  access_expires_at: null, revoked: false, escrow_hold_until: null, listing_title: '<script>plain title</script>',
};
export function proposal(patch: Partial<ReportProposal> = {}): ReportProposal {
  return { proposal_id: 'proposal-one', conversation_id: 'original-private-conversation', revision: 1,
    expires_at: '2099-11-08T00:00:00Z', draft: { category: 'other', description: 'Exact customer original' },
    context: { ...context }, surface: 'allai', guidance: [], guidance_turns: 0, guidance_bytes: 0,
    completed_guidance_nonces: [], guidance_state: 'available', enrollment: 'enabled', confirmation: null, ...patch };
}
export function confirmed(patch: Partial<ReportConfirmation> = {}): ReportConfirmation {
  return { public_ref: 'SUP-42', conversation_id: 'original-private-conversation', received_at: '2026-11-07T00:00:00Z',
    status: 'in_progress', next_action: 'Athena is reviewing the report.', email_state: 'confirmation_needed',
    original: { category: 'other', description: 'Exact customer original' },
    acknowledgement: { id: 'server-ack-id', version: 'immutable-v1', direction: 'outbound', body: 'Your report is saved. Reference SUP-42.' }, ...patch };
}
export function conversation(patch: Partial<CustomerConversation> = {}): CustomerConversation {
  const c = confirmed();
  return { public_ref: c.public_ref, conversation_id: c.conversation_id, status: c.status, next_action: c.next_action,
    email_state: c.email_state, messages: [c.acknowledgement], next_cursor: null, ...patch };
}
export function fakePort(): SupportPort {
  let savedDraft: IssueDraft = { category: 'other', description: 'Exact customer original' };
  let savedSurface: ReportSurface = 'allai';
  return { open: vi.fn(async () => proposal()), recover: vi.fn(async () => proposal()),
    save: vi.fn(async (_o, _p, revision, draft, surface) => { savedDraft = { ...draft }; savedSurface = surface; return proposal({ revision: revision + 1, draft: savedDraft, surface }); }),
    guide: vi.fn(async () => proposal({ revision: 2, guidance: [{ id: 'safe-prompt', body: 'What did you expect to happen?' }], guidance_turns: 1 })),
    confirm: vi.fn(async (_o, _p, revision) => proposal({ revision: revision + 1, surface: savedSurface, draft: savedDraft, confirmation: confirmed({ original: savedDraft }) })),
    conversation: vi.fn(async () => conversation()), reply: vi.fn(async () => conversation()), receipt: vi.fn(async () => {}) };
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
export const rejection = (status: number) => ({ response: { status } });
