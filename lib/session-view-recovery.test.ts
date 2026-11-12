// @vitest-environment jsdom
import '@/tests/support-network-trap';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { SessionViewRecovery, type LocalRecoveryState, type RecoveryAdapter, type RecoveryBinding } from './session-view-recovery';
import { api, refreshAccessToken, reserveRecoveryRefresh } from '@/api/client';
import { advanceAuthSessionOwner } from './auth-session-owner';
import { useAuthStore } from '@/store/auth';
import { principal, deferred } from '@/tests/support-fixtures';
import type { RecoveryContext, RecoveryPort, RecoveryResult, RecoveryStep } from '@/api/support-recovery';

const op = '00000000-0000-4000-8000-000000000001', read = '00000000-0000-4000-8000-000000000002';
const result = (patch: Partial<RecoveryResult> = {}): RecoveryResult => ({ operation_id: op, state: 'admitted_waiting_client',
  view: 'support_conversation', execute_once: false, refresh_count: 1, reload_count: 1, ...patch });
const local = (): LocalRecoveryState => ({ saved_drafts: { revision: 7, body: 'saved' }, unsent_text: 'unsent',
  conversation_selection: { ticket: 'same', report: 'selected' }, unknown_mutations: { nonce: 'same-nonce', body: 'pending', unknown: true }, generation: 1 });
const success = (config: InternalAxiosRequestConfig, data: unknown) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const attempts: SessionViewRecovery[] = [];
const oldAdapter = axios.defaults.adapter, oldApi = api.defaults.adapter;
beforeEach(() => { principal(); axios.defaults.adapter = vi.fn(async config => success(config, { access_token: 'rotated' })); });
afterEach(async () => { attempts.splice(0).forEach(a => a.retire()); await Promise.resolve(); axios.defaults.adapter = oldAdapter; api.defaults.adapter = oldApi; vi.useRealTimers(); });
function harness(view: RecoveryAdapter['view'] = 'support_conversation') {
  const state = local(), ticketState = local(); let ctx: RecoveryContext | undefined;
  const port: RecoveryPort = {
    recoveryCurrent: vi.fn(async () => ({ ticket_context: { expected_revision: 9, symptom_message_id: read, conversation_id: 'same' },
      action: ctx ? result({ view }) : null, context_id: ctx?.context_id, client_epoch: ctx?.client_epoch })),
    retainRecoveryContext: vi.fn(async c => { throw new Error(c); }),
    recoveryStatus: vi.fn(async () => result({ state: 'attempt_started', view })),
    recoveryStep: vi.fn(async (_ref, _op, s: RecoveryStep) => result({ view, ...({
      start: { state: 'attempt_started', execute_once: true },
      reload: { state: 'read_observed', read_id: read, content_digest: 'a'.repeat(64), data: { text: 'exact authorized normal read' } },
      render: { state: 'verified_view_loaded', evidence_ref: read }, unknown: { state: 'unknown' },
    } as Record<string, Partial<RecoveryResult>>)[s.phase] })),
  };
  port.retainRecoveryContext = vi.fn(async (_ref: string, c: RecoveryContext) => { ctx = c; return { context_id: c.context_id, state: 'context_retained' as const, revision: c.expected_revision }; });
  const binding: RecoveryBinding = { ref: 'SUP-1', conversation: 'same', current: () => true, snapshot: () => ticketState, port };
  const adapter: RecoveryAdapter = { view, current: () => true, snapshot: () => state, install: vi.fn(data => data as object) };
  const a = new SessionViewRecovery(binding, adapter); attempts.push(a);
  return { a, state, ticketState, port, adapter, binding, context: () => ctx };
}
it.each(['support_conversation', 'order_detail', 'request_thread', 'wallet'] as const)('%s needs one known permission, one refresh and reload, and a separate exact render receipt', async view => {
  const h = harness(view); await h.a.observe();
  expect(h.a.getSnapshot().stage).toBe('rendering');
  expect(axios.defaults.adapter).toHaveBeenCalledTimes(1);
  expect(vi.mocked(h.port.recoveryStep).mock.calls.map(c => c[2].phase)).toEqual(['start', 'reload']);
  const display = h.a.getSnapshot().display!;
  await h.a.visible({ ...display }); expect(h.a.getSnapshot().stage).toBe('rendering');
  await h.a.visible(display); await h.a.visible(display); await h.a.observe();
  expect(h.a.getSnapshot().stage).toBe('verified');
  expect(vi.mocked(h.port.recoveryStep).mock.calls.map(c => c[2].phase)).toEqual(['start', 'reload', 'render']);
  expect(h.port.recoveryStep).toHaveBeenLastCalledWith('SUP-1', op, expect.objectContaining({ read_id: read, content_digest: 'a'.repeat(64) }));
  expect(h.state.unknown_mutations).toEqual({ nonce: 'same-nonce', body: 'pending', unknown: true });
});
it.each(['saved_drafts', 'unsent_text', 'conversation_selection', 'unknown_mutations'] as const)('hashes and fences actual %s; never overwrites a newer edit', async field => {
  const h = harness(); const held = deferred<RecoveryResult>();
  vi.mocked(h.port.recoveryStep).mockImplementationOnce(() => held.promise);
  const observe = h.a.observe(); await vi.waitFor(() => expect(h.port.recoveryStep).toHaveBeenCalled());
  expect(h.context()!.preserved[field]).toMatch(/^[a-f0-9]{64}$/);
  expect(h.context()!.preserved[field]).toBe(createHash('sha256').update(JSON.stringify([h.ticketState[field], h.state[field]])).digest('hex'));
  expect(JSON.stringify(h.context())).not.toContain('same-nonce');
  expect(JSON.stringify(h.context())).not.toContain('"pending"');
  h.state[field] = { newer: true }; held.resolve(result({ state: 'attempt_started', execute_once: true })); await observe;
  expect(h.a.getSnapshot().stage).toBe('stopped'); expect(h.adapter.install).not.toHaveBeenCalled();
  expect(axios.defaults.adapter).not.toHaveBeenCalled(); expect(h.state[field]).toEqual({ newer: true });
});
it.each(['start', 'reload', 'render'] as const)('lost %s response never reconstructs permission from GET status or retries that phase', async phase => {
  const h = harness(), step = h.port.recoveryStep;
  h.port.recoveryStep = vi.fn(async (ref: string, id: string, command: RecoveryStep) => { if (command.phase === phase) throw new Error('lost'); return step(ref, id, command); });
  await h.a.observe(); if (phase === 'render') await h.a.visible(h.a.getSnapshot().display!);
  await h.a.observe(); await h.port.recoveryStatus('SUP-1', op); await h.a.observe();
  expect(h.a.getSnapshot().stage).toBe('stopped');
  expect(vi.mocked(h.port.recoveryStep).mock.calls.filter(c => c[2].phase === phase)).toHaveLength(1);
  expect(axios.defaults.adapter).toHaveBeenCalledTimes(phase === 'start' ? 0 : 1);
});
it.each([401, 403, 429])('single-attempt refresh %s preserves auth and never retries, clears, or redirects', async status => {
  const h = harness(); axios.defaults.adapter = vi.fn(async config => { throw new AxiosError('refused', 'ERR_BAD_RESPONSE', config, null, { ...success(config, {}), status }); });
  await h.a.observe(); await h.a.observe();
  expect(axios.defaults.adapter).toHaveBeenCalledTimes(1); expect(useAuthStore.getState().token).toBe('fixture-only-token');
  expect(h.adapter.install).not.toHaveBeenCalled(); expect(h.a.getSnapshot().stage).toBe('stopped');
  expect(vi.mocked(h.port.recoveryStep).mock.calls.at(-1)?.[2].phase).toBe(status === 429 ? 'failed' : 'refused');
});
it('lost refresh response is unknown and never followed by reload', async () => {
  const h = harness(); axios.defaults.adapter = vi.fn(async () => { throw new Error('lost refresh'); });
  await h.a.observe(); await h.a.observe();
  expect(axios.defaults.adapter).toHaveBeenCalledTimes(1);
  expect(vi.mocked(h.port.recoveryStep).mock.calls.map(c => c[2].phase)).toEqual(['start', 'unknown']);
});
it('stops before start when an ordinary existing refresh flight is present', async () => {
  const flight = deferred<ReturnType<typeof success>>(); axios.defaults.adapter = vi.fn(() => flight.promise);
  const normal = refreshAccessToken(); const h = harness(); await h.a.observe();
  expect(h.port.recoveryStep).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ phase: 'start' }));
  flight.resolve(success({} as InternalAxiosRequestConfig, { access_token: 'normal' })); await normal;
  expect(h.a.getSnapshot().stage).toBe('stopped'); expect(axios.defaults.adapter).toHaveBeenCalledTimes(1);
});
it('fences background refresh and 401 POST replay while holding the one-attempt lease', async () => {
  const lease = reserveRecoveryRefresh(() => {});
  api.defaults.adapter = vi.fn(async config => { throw new AxiosError('401', 'ERR_BAD_RESPONSE', config, null, { ...success(config, {}), status: 401 }); });
  await expect(refreshAccessToken()).rejects.toThrow('Scoped');
  await expect(api.post('/payment', { nonce: 'same' })).rejects.toThrow('401');
  expect(api.defaults.adapter).toHaveBeenCalledTimes(1); expect(axios.defaults.adapter).not.toHaveBeenCalled(); lease.release();
});
it('does not join an existing rate-limited/retrying refresh flight', async () => {
  vi.useFakeTimers();
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (adapter.mock.calls.length === 1) throw new AxiosError('429', 'ERR_BAD_RESPONSE', config, null, { ...success(config, {}), status: 429 });
    return success(config, { access_token: 'ordinary retry' });
  });
  axios.defaults.adapter = adapter;
  const normal = refreshAccessToken(); await vi.advanceTimersByTimeAsync(0);
  const h = harness(); await h.a.observe();
  expect(h.a.getSnapshot().stage).toBe('stopped'); expect(h.adapter.install).not.toHaveBeenCalled();
  expect(vi.mocked(h.port.recoveryStep).mock.calls.some(c => c[2].phase === 'start')).toBe(false);
  await vi.advanceTimersByTimeAsync(60000); await normal;
  expect(adapter).toHaveBeenCalledTimes(2); // Both belong to the pre-existing ordinary flight.
});
it('retiring while refresh is in flight keeps exclusion until settlement and never persists the stale token', async () => {
  let active = true;
  const flight = deferred<ReturnType<typeof success>>(); axios.defaults.adapter = vi.fn(() => flight.promise);
  const lease = reserveRecoveryRefresh(() => { if (!active) throw new Error('retired'); });
  const refresh = lease.refresh(); active = false; lease.release();
  await expect(refreshAccessToken()).rejects.toThrow('Scoped');
  flight.resolve(success({} as InternalAxiosRequestConfig, { access_token: 'stale' }));
  await expect(refresh).rejects.toThrow('retired'); expect(useAuthStore.getState().token).toBe('fixture-only-token');
});
it.each(['logout', 'login', 'userABA', 'selectionABA', 'unmount'] as const)('%s cannot revive the old context', async drift => {
  const h = harness(); await h.a.observe(); const display = h.a.getSnapshot().display!;
  if (drift === 'unmount') h.a.retire();
  else if (drift === 'selectionABA') h.state.generation = 3;
  else { advanceAuthSessionOwner(); if (drift === 'logout') useAuthStore.setState({ token: null, user: null }); }
  await h.a.visible(display); expect(h.a.getSnapshot().stage).toBe('stopped');
  expect(vi.mocked(h.port.recoveryStep).mock.calls.some(c => c[2].phase === 'render')).toBe(false);
});
it('mutating exact installed data cannot produce a receipt', async () => {
  const h = harness(); await h.a.observe(); const display = h.a.getSnapshot().display!;
  Object.assign(display.read, { text: 'unrelated cached data' }); await h.a.visible(display);
  expect(h.a.getSnapshot().stage).toBe('stopped'); expect(vi.mocked(h.port.recoveryStep).mock.calls.some(c => c[2].phase === 'render')).toBe(false);
});
it('consumes the server successor once while keeping the original epoch and four hashes', async () => {
  const h = harness(), original = h.port.recoveryCurrent;
  h.port.recoveryCurrent = vi.fn(async ref => {
    const r = await original(ref);
    if (r.context_id) { r.context_id = read; r.ticket_context.expected_revision = 10; }
    return r;
  });
  await h.a.observe();
  expect(h.a.getSnapshot().stage).toBe('rendering');
  await h.a.visible(h.a.getSnapshot().display!);
  expect(h.a.getSnapshot().stage).toBe('verified');
  expect(h.port.retainRecoveryContext).toHaveBeenCalledTimes(1);
  for (const call of vi.mocked(h.port.recoveryStep).mock.calls) {
    expect(call[2].client_epoch).toBe(h.context()!.client_epoch);
    expect(call[2].preserved).toEqual(h.context()!.preserved);
  }
});
it('an intermediate original-unverified terminal retains support and never submits another terminal or refresh', async () => {
  const h = harness(), step = h.port.recoveryStep;
  h.port.recoveryStep = vi.fn(async (ref, id, command) => command.phase === 'render'
    ? result({ state: 'view_loaded_original_unverified' }) : step(ref, id, command));
  await h.a.observe(); await h.a.visible(h.a.getSnapshot().display!); await h.a.observe(); h.a.retire();
  expect(h.a.getSnapshot().stage).toBe('unverified');
  expect(h.a.getSnapshot().message).toContain('original issue still needs support');
  expect(vi.mocked(h.port.recoveryStep).mock.calls.map(c => c[2].phase)).toEqual(['start', 'reload', 'render']);
  expect(axios.defaults.adapter).toHaveBeenCalledTimes(1);
});
it.each(['wrong_conversation', 'wrong_context', 'wrong_revision', 'refused', 'off', 'no_permission', 'waiting'] as const)('%s never refreshes or claims fixed', async mode => {
  const h = harness(), original = h.port.recoveryCurrent;
  h.port.recoveryCurrent = vi.fn(async ref => { const r = await original(ref);
    if (mode === 'wrong_conversation') r.ticket_context.conversation_id = 'other';
    if (mode === 'wrong_context' && r.context_id) r.context_id = read;
    if (mode === 'wrong_revision' && r.context_id) r.ticket_context.expected_revision++;
    if (mode === 'refused' || mode === 'off') r.action = result({ state: 'refused_before_dispatch' });
    if (mode === 'waiting') r.action = null;
    return r;
  });
  if (mode === 'no_permission') vi.mocked(h.port.recoveryStep).mockResolvedValue(result({ state: 'attempt_started', execute_once: false }));
  await h.a.observe(); expect(axios.defaults.adapter).not.toHaveBeenCalled(); expect(h.adapter.install).not.toHaveBeenCalled();
  expect(h.a.getSnapshot().stage).toBe(mode === 'waiting' ? 'waiting' : 'stopped');
});
