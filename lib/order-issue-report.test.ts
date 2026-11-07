import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { OrderIssueSession } from './order-issue-report';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from './auth-session-owner';
import { fakePort, principal, proposal, confirmed, deferred, rejection } from '@/tests/support-fixtures';
import type { ReportProposal } from '@/api/support';

const visits: OrderIssueSession[] = [];
function visit() { const port = fakePort(); const session = new OrderIssueSession('order-fixture', port); visits.push(session); return { port, session }; }
afterEach(() => visits.splice(0).forEach(s => s.retire()));

describe('private durable order report commands', () => {
  it.each(['buyer', 'seller'] as const)('%s opens before any guidance; edits, saves, reviews and explicitly confirms', async role => {
    principal(role); const { session, port } = visit();
    await session.open();
    expect(port.open).toHaveBeenCalledWith('order-fixture', expect.any(String), 'allai', true);
    await session.confirm(); expect(port.confirm).not.toHaveBeenCalled();
    session.edit({ category: 'download_delivery', description: 'Exact edited issue\nwith newline', browser: 'Firefox', error: 'No download' });
    session.review(true); await session.confirm(); expect(port.confirm).not.toHaveBeenCalled();
    session.plain(); await session.save();
    expect(port.save).toHaveBeenCalledWith('order-fixture', 'proposal-one', 1,
      { category: 'download_delivery', description: 'Exact edited issue\nwith newline', browser: 'Firefox', error: 'No download' }, 'web');
    session.review(true); await session.confirm();
    const digest = createHash('sha256').update('{"category":"download_delivery","description":"Exact edited issue\\nwith newline","browser":"Firefox","error":"No download"}').digest('hex');
    expect(port.confirm).toHaveBeenCalledWith('order-fixture', 'proposal-one', 2, digest);
    expect(session.getSnapshot().proposal?.confirmation?.public_ref).toBe('SUP-42');
    expect(session.getSnapshot().proposal?.confirmation?.original.description).toBe('Exact edited issue\nwith newline');
  });
  it('lost proposal creation recovers the identical open nonce, never a fresh create', async () => {
    principal(); const { session, port } = visit();
    vi.mocked(port.open).mockRejectedValueOnce(new Error('lost response'));
    await session.open(); expect(session.getSnapshot().reconcile).toBe(true);
    await session.recover();
    expect(vi.mocked(port.open).mock.calls[1]).toEqual(vi.mocked(port.open).mock.calls[0]);
  });
  it.each([409, 429, 503])('save refusal %s retains editable exact text and server draft', async code => {
    principal(); const { session, port } = visit(); await session.open();
    session.edit({ category: 'other', description: 'Unsaved exact text' });
    vi.mocked(port.save).mockRejectedValueOnce(rejection(code)); await session.save();
    expect(session.getSnapshot().draft.description).toBe('Unsaved exact text');
    expect(session.getSnapshot().proposal?.draft.description).toBe('Exact customer original');
    expect(session.getSnapshot().saved).toBe(false);
    if (code !== 429) { await session.recover(); expect(session.getSnapshot().draft.description).toBe('Unsaved exact text'); }
    expect(port.confirm).not.toHaveBeenCalled();
  });
  it.each(['model_unavailable', 'capped'] as const)('plain fallback with %s uses the same proposal command', async guidance_state => {
    principal(); const { session, port } = visit();
    vi.mocked(port.open).mockResolvedValue(proposal({ guidance_state, guidance_turns: guidance_state === 'capped' ? 20 : 0 }));
    await session.open(); await session.guide('Private symptom');
    expect(port.guide).not.toHaveBeenCalled();
    session.plain(); await session.save(); session.review(true); await session.confirm();
    expect(port.save).toHaveBeenCalledWith('order-fixture', 'proposal-one', 1, expect.any(Object), 'web');
    expect(port.confirm).toHaveBeenCalledWith('order-fixture', 'proposal-one', 2, expect.any(String));
  });
  it('guidance unknown response reconciles revision without automatic replay', async () => {
    principal(); const { session, port } = visit(); await session.open();
    vi.mocked(port.guide).mockRejectedValueOnce(new Error('lost'));
    vi.mocked(port.recover).mockResolvedValue(proposal({ revision: 2, guidance_turns: 1 }));
    await session.guide('My private question'); expect(session.getSnapshot().reconcile).toBe(true);
    await session.guide('do not replay'); expect(port.guide).toHaveBeenCalledTimes(1);
    await session.recover(); expect(session.getSnapshot().proposal?.revision).toBe(2);
    expect(port.guide).toHaveBeenCalledTimes(1);
    expect(vi.mocked(port.guide).mock.calls[0].slice(0, 3)).toEqual(['order-fixture', 'proposal-one', 1]);
    expect(vi.mocked(port.guide).mock.calls[0][3]).toEqual(expect.any(String));
  });
  it('unknown commit recovers original closed ticket across filing expiry; new proposal remains distinct', async () => {
    principal(); const { session, port } = visit(); await session.open();
    vi.mocked(port.confirm).mockRejectedValueOnce(new Error('commit response lost'));
    session.review(true); await session.confirm(); expect(session.getSnapshot().reconcile).toBe(true);
    await session.confirm(); expect(port.confirm).toHaveBeenCalledTimes(1);
    vi.mocked(port.recover).mockResolvedValue(proposal({ expires_at: '2000-01-01T00:00:00Z', confirmation: confirmed({ status: 'closed' }) }));
    await session.recover(); expect(session.getSnapshot().proposal?.confirmation?.public_ref).toBe('SUP-42');
    vi.mocked(port.open).mockResolvedValue(proposal({ proposal_id: 'proposal-two', conversation_id: 'second-private-conversation' }));
    await session.newReport();
    expect(session.getSnapshot().proposal?.proposal_id).toBe('proposal-two');
    const calls = vi.mocked(port.open).mock.calls;
    expect(calls[1][1]).not.toBe(calls[0][1]); expect(calls[1][3]).toBe(false);
  });
  it('expired draft copies only by explicit action; a failed copy create retains original text through recovery', async () => {
    principal(); const { session, port } = visit();
    vi.mocked(port.open).mockResolvedValueOnce(proposal({ expires_at: '2000-01-01T00:00:00Z' })).mockRejectedValueOnce(new Error('lost'));
    await session.open(); session.review(true); await session.confirm(); expect(port.confirm).not.toHaveBeenCalled();
    expect(port.open).toHaveBeenCalledTimes(1);
    await session.copyExpired();
    expect(session.getSnapshot().draft.description).toBe('Exact customer original');
    vi.mocked(port.open).mockResolvedValue(proposal({ proposal_id: 'new-authorized', draft: { category: 'other', description: '' } }));
    await session.recover();
    expect(session.getSnapshot().draft.description).toBe('Exact customer original');
    expect(session.getSnapshot().saved).toBe(false);
    expect(session.getSnapshot().reviewed).toBe(false);
    expect(port.confirm).not.toHaveBeenCalled();
  });
  it.each(['open', 'guide', 'confirm'] as const)('principal change during %s clears data and fences late responses and retained closures', async operation => {
    principal(); const { session, port } = visit();
    if (operation !== 'open') await session.open();
    const pending = deferred<ReportProposal>(); vi.mocked(port[operation]).mockReturnValueOnce(pending.promise);
    session.review(true);
    const inFlight = operation === 'guide' ? session.guide('private') : session[operation]();
    principal('seller', 'another-principal');
    expect(session.getSnapshot().draft.description).toBe('');
    pending.resolve(proposal({ confirmation: confirmed() })); await inFlight;
    expect(session.getSnapshot().proposal).toBeNull(); expect(session.getSnapshot().retired).toBe(true);
    const before = vi.mocked(port.open).mock.calls.length;
    await session.open(); session.edit({ category: 'other', description: 'stale closure' });
    expect(port.open).toHaveBeenCalledTimes(before); expect(session.getSnapshot().draft.description).toBe('');
  });
  it('owner generation fences even same-principal stale action; token rotation retains draft without sign-in', async () => {
    principal(); const { session, port } = visit(); await session.open();
    useAuthStore.setState({ token: 'rotated-fixture-token' });
    expect(session.getSnapshot().proposal?.proposal_id).toBe('proposal-one');
    advanceAuthSessionOwner(); session.review(true); await session.confirm();
    expect(port.confirm).not.toHaveBeenCalled(); expect(session.getSnapshot().proposal).toBeNull();
  });
  it.each(['unavailable', 'unknown'] as const)('does not file with enrollment %s', async enrollment => {
    principal(); const { session, port } = visit(); vi.mocked(port.open).mockResolvedValue(proposal({ enrollment }));
    await session.open(); session.review(true); await session.confirm();
    expect(port.confirm).not.toHaveBeenCalled(); expect(session.getSnapshot().saved).toBe(true);
  });
});

it('guidance retry after reconciliation retains original revision, nonce and body', async () => {
  principal(); const { session, port } = visit(); await session.open();
  vi.mocked(port.guide).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(proposal({ revision: 2, guidance_turns: 1 }));
  await session.guide('Exact original private turn');
  await session.recover();
  expect(session.getSnapshot().guidanceRetry).toBe(true);
  await session.retryGuidance();
  expect(vi.mocked(port.guide).mock.calls[1]).toEqual(vi.mocked(port.guide).mock.calls[0]);
  expect(session.getSnapshot().guidanceRetry).toBe(false);
});
it('recovering an acknowledged turn never replays it and cumulative UTF-8 guidance cap prevents a new turn', async () => {
  principal(); const { session, port } = visit(); await session.open();
  vi.mocked(port.guide).mockRejectedValueOnce(new Error('unknown'));
  await session.guide('Exact original turn');
  const nonce = vi.mocked(port.guide).mock.calls[0][3];
  vi.mocked(port.recover).mockResolvedValue(proposal({ revision: 2, guidance_turns: 1, completed_guidance_nonces: [nonce], guidance_bytes: 65530 }));
  await session.recover(); await session.retryGuidance();
  expect(port.guide).toHaveBeenCalledTimes(1);
  await session.guide('Three Unicode characters: 日本語');
  expect(port.guide).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().error).toMatch(/Guidance capacity/);
  session.plain(); await session.save();
  expect(port.save).toHaveBeenCalledWith('order-fixture', 'proposal-one', 2, expect.any(Object), 'web');
});
it('interrupted save and a signout after completed recovery retire private state and pending responses', async () => {
  principal(); const { session, port } = visit(); await session.open();
  const pending = deferred<ReportProposal>(); vi.mocked(port.save).mockReturnValueOnce(pending.promise);
  session.edit({ category: 'other', description: 'Private local edit' });
  const action = session.save();
  useAuthStore.setState({ token: null, user: null });
  pending.resolve(proposal({ draft: { category: 'other', description: 'Late saved private response' }, revision: 2 }));
  await action;
  expect(session.getSnapshot().proposal).toBeNull(); expect(session.getSnapshot().draft.description).toBe('');
  principal(); const next = visit(); await next.session.open(); await next.session.recover();
  expect(next.session.getSnapshot().saved).toBe(true);
  principal('seller'); expect(next.session.getSnapshot().proposal).toBeNull();
});
it('a changed digest conflict cannot overwrite the original confirmed report or replay confirmation', async () => {
  principal(); const { session, port } = visit(); await session.open();
  session.edit({ category: 'other', description: 'Changed text attempting conflict' }); await session.save();
  vi.mocked(port.confirm).mockRejectedValueOnce(rejection(409));
  session.review(true); await session.confirm();
  expect(session.getSnapshot().draft.description).toBe('Changed text attempting conflict');
  expect(session.getSnapshot().reconcile).toBe(true);
  vi.mocked(port.recover).mockResolvedValue(proposal({ revision: 2, confirmation: confirmed() }));
  await session.recover();
  session.edit({ category: 'other', description: 'Forbidden replacement' }); await session.confirm();
  expect(session.getSnapshot().proposal?.confirmation?.original.description).toBe('Exact customer original');
  expect(port.confirm).toHaveBeenCalledTimes(1);
});

it('same-principal return restores a server draft without authentication mutation; confirmed deep links recover without filing expiry', async () => {
  principal(); const port = fakePort();
  const first = new OrderIssueSession('order-fixture', port); visits.push(first); await first.open();
  first.edit({ category: 'download_delivery', description: 'Durable saved description', browser: 'Firefox' }); await first.save();
  first.retire();
  vi.mocked(port.open).mockResolvedValue(proposal({ draft: { category: 'download_delivery', description: 'Durable saved description', browser: 'Firefox' }, revision: 2 }));
  const owner = useAuthStore.getState().user?.id, token = useAuthStore.getState().token;
  const login = vi.spyOn(useAuthStore.getState(), 'login');
  const returning = new OrderIssueSession('order-fixture', port); visits.push(returning); await returning.open();
  expect(returning.getSnapshot().draft.description).toBe('Durable saved description');
  expect(useAuthStore.getState().user?.id).toBe(owner); expect(useAuthStore.getState().token).toBe(token); expect(login).not.toHaveBeenCalled();
  login.mockRestore();
  vi.mocked(port.recover).mockResolvedValue(proposal({ expires_at: '2000-01-01T00:00:00Z', confirmation: confirmed({ status: 'closed' }) }));
  const linked = new OrderIssueSession('order-fixture', port, 'proposal-one'); visits.push(linked); await linked.open();
  expect(port.recover).toHaveBeenCalledWith('order-fixture', 'proposal-one');
  expect(linked.getSnapshot().proposal?.confirmation?.public_ref).toBe('SUP-42');
  expect(port.open).toHaveBeenCalledTimes(2); expect(port.confirm).not.toHaveBeenCalled();
});
it('server identity/revision mismatch is quarantined and never replaces the private draft', async () => {
  principal(); const { session, port } = visit(); await session.open();
  vi.mocked(port.recover).mockResolvedValue(proposal({ proposal_id: 'foreign-proposal', conversation_id: 'foreign-conversation', draft: { category: 'other', description: 'Do not show foreign response' } }));
  await session.recover();
  expect(session.getSnapshot().proposal?.proposal_id).toBe('proposal-one');
  expect(session.getSnapshot().draft.description).toBe('Exact customer original');
  expect(session.getSnapshot().reconcile).toBe(true);
});


describe('guidance response validation and proposal boundaries', () => {
  it.each([
    ['proposal', { proposal_id: 'wrong-proposal', revision: 2 }],
    ['conversation', { conversation_id: 'wrong-conversation', revision: 2 }],
    ['revision', { revision: 0 }],
  ] as const)('quarantines wrong %s without forgetting the exact uncertain command', async (_name, patch) => {
    principal(); const { session, port } = visit(); await session.open();
    vi.mocked(port.guide).mockResolvedValueOnce(proposal(patch));
    await session.guide('Exact question\n日本語');
    expect(session.getSnapshot().reconcile).toBe(true);
    expect(session.getSnapshot().proposal).toEqual(proposal());
    await session.retryGuidance(); expect(port.guide).toHaveBeenCalledTimes(1);
    vi.mocked(port.recover).mockResolvedValue(proposal({ revision: 3 }));
    await session.recover();
    expect(port.guide).toHaveBeenCalledTimes(1);
    await session.guide('A different question must not get a fresh nonce');
    expect(port.guide).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().guidanceRetry).toBe(true);
    vi.mocked(port.guide).mockResolvedValueOnce(proposal({ revision: 4 }));
    await session.retryGuidance();
    expect(vi.mocked(port.guide).mock.calls[1]).toEqual(vi.mocked(port.guide).mock.calls[0]);
    expect(session.getSnapshot().guidanceRetry).toBe(false);
  });
  it('accepts a valid direct guidance response without requiring a completed nonce echo', async () => {
    principal(); const { session, port } = visit(); await session.open();
    await session.guide('First successful question');
    expect(session.getSnapshot().proposal?.revision).toBe(2);
    expect(session.getSnapshot().guidanceRetry).toBe(false);
    await session.retryGuidance(); expect(port.guide).toHaveBeenCalledTimes(1);
    vi.mocked(port.guide).mockResolvedValueOnce(proposal({ revision: 3 }));
    await session.guide('Next successful question');
    const calls = vi.mocked(port.guide).mock.calls;
    expect(calls[1][3]).not.toBe(calls[0][3]); expect(calls[1][2]).toBe(2);
  });
  it('explicit plain fallback retires uncertain guidance on the same proposal', async () => {
    principal(); const { session, port } = visit(); await session.open();
    vi.mocked(port.guide).mockRejectedValueOnce(new Error('lost'));
    await session.guide('Original uncertain question'); await session.recover();
    session.plain(); await session.retryGuidance();
    expect(port.guide).toHaveBeenCalledTimes(1);
    await session.save(); session.review(true); await session.confirm();
    expect(session.getSnapshot().proposal?.confirmation?.original.description).toBe('Exact customer original');
  });
  it.each(['confirm', 'recover-confirmed', 'copy', 'copy-open-lost'] as const)('%s retires the old command before any distinct proposal can receive it', async boundary => {
    principal(); const { session, port } = visit(); await session.open();
    vi.mocked(port.guide).mockRejectedValueOnce(new Error('lost guidance response'));
    await session.guide('Old private question');
    const expired = boundary.startsWith('copy');
    vi.mocked(port.recover).mockResolvedValue(proposal({ revision: 2,
      expires_at: expired ? '2000-01-01T00:00:00Z' : '2099-11-08T00:00:00Z',
      confirmation: boundary === 'recover-confirmed' ? confirmed() : null }));
    await session.recover();
    expect(port.guide).toHaveBeenCalledTimes(1);
    if (!expired && boundary !== 'recover-confirmed') { session.review(true); await session.confirm(); }
    const original = session.getSnapshot().proposal;
    const fresh = proposal({ proposal_id: 'proposal-two', conversation_id: 'new-private-conversation' });
    vi.mocked(port.open).mockResolvedValue(fresh);
    if (boundary === 'copy-open-lost') vi.mocked(port.open).mockRejectedValueOnce(new Error('lost new open'));
    if (expired) await session.copyExpired(); else await session.newReport();
    if (boundary === 'copy-open-lost') await session.recover();
    await session.retryGuidance();
    expect(port.guide).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().guidanceRetry).toBe(false);
    expect(session.getSnapshot().proposal?.proposal_id).toBe('proposal-two');
    expect(original?.proposal_id).toBe('proposal-one');
    expect(original?.draft.description).toBe('Exact customer original');
    if (!expired) expect(original?.confirmation?.public_ref).toBe('SUP-42');
    if (expired) {
      vi.mocked(port.save).mockImplementationOnce(async (_o, _p, revision, draft, surface) => ({ ...fresh, revision: revision + 1, draft, surface }));
      await session.save();
    }
    vi.mocked(port.guide).mockResolvedValueOnce({ ...fresh, revision: 3 });
    await session.guide('New proposal question');
    const calls = vi.mocked(port.guide).mock.calls;
    expect(calls[1][1]).toBe('proposal-two');
    expect(calls[1][3]).not.toBe(calls[0][3]);
    expect(calls[1][4]).toBe('New proposal question');
  });
});
