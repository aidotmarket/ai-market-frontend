// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCloudflareInstaller } from './CloudflareInstaller';
import GatewayVerificationFlow from './GatewayVerificationFlow';
import * as api from '@/api/dataVerificationGateway';
import { listSellerWorkspaceConnections } from '@/api/sellerWorkspace';
vi.mock('@/api/dataVerificationGateway', async original => ({ ...await original<typeof api>(), startCloudflareInstall: vi.fn(), getCloudflareInstall: vi.fn(), controlCloudflareInstall: vi.fn(), getCloudflareVerifierStatus: vi.fn(), probeGatewayVerification: vi.fn(), startGatewayVerification: vi.fn() }));
vi.mock('@/api/sellerWorkspace', () => ({ listSellerWorkspaceConnections: vi.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const key = 'cloudflare-install:seller:listing:connection';
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
const verifier: api.CloudflareVerifierStatus = { installer_enabled: true, eligible: true, connection_id: 'connection', state: 'none', runner_id: null, jurisdiction: 'default', release_id: null, scanner_version: null, binary_sha256: null, worker_identity: null, image_digest: null, poll_interval_minutes: null, registered_at: null, last_seen_at: null, setup_expires_at: null };
const initial: api.CloudflareInstallStatus = { intent_id: id, phase: 'start', error: null, cleanup: 'not_started', claimed_at: null, updated_at: null, cancel_requested: null, access_removal_confirmed_by_seller: false, message: 'Server status', runtime: { state: 'authorizing' } };
function Harness({ status = verifier }: { status?: api.CloudflareVerifierStatus }) {
  const install = useCloudflareInstaller('listing', 'seller', 'connection', status, true);
  return <>{install.panel}{!install.active && <p>Existing setup</p>}</>;
}
async function mount(resume = true, status = initial) {
  if (resume) localStorage.setItem(key, id);
  vi.mocked(api.getCloudflareInstall).mockResolvedValue(status);
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<Harness />); });
  return view;
}
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); }
async function visible(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.mocked(api.getCloudflareVerifierStatus).mockResolvedValue(verifier);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); Object.defineProperty(window, 'localStorage', originalStorage); window.history.replaceState({}, '', '/'); });

it.each(['authorizing', 'installing', 'disconnecting', 'waiting_registration', 'ready', 'ready_attested', 'consent_cancelled', 'scope_refused', 'failed_removed', 'failed_residue', 'boot_timed_out', 'cleanup_unconfirmed', 'failed'] as const)('renders the server message for %s', async state => {
  await mount(true, { ...initial, message: `Server says ${state}`, runtime: { state } });
  expect(screen.getByRole('status').textContent).toBe(`Server says ${state}`);
});
it('renders verbatim pre-consent and navigates only after saving the returned intent', async () => {
  const assign = vi.fn(() => expect(localStorage.getItem(key)).toBe(id));
  vi.stubGlobal('window', Object.create(window, { location: { value: { assign } } }));
  const authorize = 'https://dash.cloudflare.com/oauth2/auth?state=secret-state&code_challenge=challenge';
  vi.mocked(api.startCloudflareInstall).mockResolvedValue({ intent_id: id, authorize_url: authorize, expires_at: 123 });
  await mount(false);
  expect(screen.getByText('Existing setup')).toBeTruthy();
  for (const copy of [
    'Install your verifier',
    'The check runs in your Cloudflare account. Your files stay there; ai.market receives only signed summary findings.',
    'You need a Cloudflare account and Workers Paid ($5/month plus usage). Cloudflare charges are separate from the verification fee.',
    'Give us temporary permission to install it. During setup this access can manage Workers and Containers in this Cloudflare account.',
    'We use it only for this installation; we disconnect our access automatically when done and keep no copy afterward.',
    'Installing does not start a data check.',
    'Choose the Cloudflare account for this listing. Approve Workers Admin and Workers Containers Write.',
  ]) expect(screen.getByText(copy)).toBeTruthy();
  await click('Connect Cloudflare');
  expect(api.startCloudflareInstall).toHaveBeenCalledWith('listing', 'connection', localStorage.getItem(`${key}:request`));
  expect(assign).toHaveBeenCalledWith(authorize);
  expect(document.body.textContent).not.toMatch(/secret-state|challenge/);
  expect([localStorage.getItem(key), localStorage.getItem(`${key}:request`)].join()).not.toMatch(/secret-state|challenge/);
  vi.unstubAllGlobals();
});
it('refuses a foreign authorize URL before storing the intent', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', Object.create(window, { location: { value: { assign } } }));
  vi.mocked(api.startCloudflareInstall).mockResolvedValue({ intent_id: id, authorize_url: 'https://foreign.example/oauth2/auth', expires_at: 123 });
  await mount(false); await click('Connect Cloudflare');
  expect(assign).not.toHaveBeenCalled(); expect(localStorage.getItem(key)).toBeNull();
  expect(screen.getByText('Existing setup')).toBeTruthy();
});
it('keeps the idempotency key after a lost start response and suppresses its raw error', async () => {
  vi.mocked(api.startCloudflareInstall).mockRejectedValue(new Error('secret-token'));
  await mount(false); await click('Connect Cloudflare'); await click('Connect Cloudflare');
  expect(api.startCloudflareInstall).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.startCloudflareInstall).mock.calls[0]).toEqual(vi.mocked(api.startCloudflareInstall).mock.calls[1]);
  expect(screen.getByRole('alert').textContent).not.toContain('secret-token');
});
it('polls every three seconds, stops while hidden and resumes on visibility', async () => {
  await mount(); expect(api.getCloudflareInstall).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(2);
  await visible('hidden');
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(2);
  await visible('visible'); expect(api.getCloudflareInstall).toHaveBeenCalledTimes(3);
});
it('makes no initial request in a hidden tab', async () => {
  await visible('hidden'); await mount();
  expect(api.getCloudflareInstall).not.toHaveBeenCalled();
  await visible('visible'); expect(api.getCloudflareInstall).toHaveBeenCalledTimes(1);
});
it.each(['closed', 'cancelled', 'expired', 'callback_refused'] as const)('stops polling at terminal %s', async phase => {
  await mount(true, { ...initial, phase });
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  await visible('hidden'); await visible('visible');
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(1);
});
it('cancels and cannot be overwritten by an older status read', async () => {
  localStorage.setItem(`${key}:request`, id);
  await mount();
  let resolve!: (status: api.CloudflareInstallStatus) => void;
  vi.mocked(api.getCloudflareInstall).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  vi.mocked(api.controlCloudflareInstall).mockResolvedValue({ ...initial, phase: 'cancelled', message: 'Cloudflare connection cancelled. Nothing was installed.' });
  await click('Cancel installation');
  expect(api.controlCloudflareInstall).toHaveBeenCalledWith(id, 'cancel');
  expect(localStorage.getItem(`${key}:request`)).toBeNull();
  await act(async () => { resolve(initial); });
  expect(screen.getByRole('status').textContent).toBe('Cloudflare connection cancelled. Nothing was installed.');
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(2);
});
it.each(['cleanup_unconfirmed', 'failed_residue', 'boot_timed_out', 'failed'] as const)('requires explicit access-removal attestation for %s', async state => {
  const status = { ...initial, phase: 'closed' as const, runtime: { state }, residual_resources: ['owned-resource'] };
  await mount(true, status);
  expect(screen.queryByText('Existing setup')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Record access removal' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(api.controlCloudflareInstall).mockResolvedValue({ ...status, access_removal_confirmed_by_seller: true });
  await click('Record access removal');
  expect(api.controlCloudflareInstall).toHaveBeenCalledWith(id, 'cleanup-attestation');
  expect(screen.getByText('Access removal recorded as your statement, not provider proof.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  expect(screen.queryByText('Existing setup')).toBeNull();
  expect(localStorage.getItem(key)).toBe(id);
  expect(!!screen.queryByRole('button', { name: 'Record access removal' })).toBe(state !== 'cleanup_unconfirmed');
});
it.each([
  { installer_enabled: false }, { installer_enabled: undefined }, { state: 'ready', runner_id: 'runner' },
  { state: 'waiting', runner_id: 'runner' }, { state: 'waiting', setup_expires_at: '2099-01-01' },
  { state: 'removed', setup_expires_at: '2099-01-01' }, { eligible: false }, { connection_id: 'other' },
] as Partial<api.CloudflareVerifierStatus>[])('keeps verifier status without legacy setup for %j', async override => {
  vi.mocked(api.getCloudflareVerifierStatus).mockResolvedValue({ ...verifier, ...override });
  await act(async () => { render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'cloudflare', connectionId: 'connection' }} />); });
  await click('Verify this data');
  expect(screen.queryByRole('button', { name: 'Connect Cloudflare' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Cloudflare verifier' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check verifier status' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Set up the verifier' })).toBeNull();
});
it.each([
  ['closed', 'oauth_complete', true, 'ready'], ['closed', 'memory_lost', true, 'none'],
  ['closed', 'install_mint_refused', false, 'none'], ['closed', 'callback_invalid', false, 'none'],
  ['cancelled', null, false, 'none'], ['expired', 'expired', false, 'none'],
  ['callback_refused', null, false, 'none'], ['cancelled', null, false, 'ready'],
] as const)('dismisses saved %s/%s with capability %s and verifier state %s', async (phase, error, enabled, state) => {
  localStorage.setItem(`${key}:request`, id);
  const view = await mount(true, { ...initial, phase, error }); view.unmount();
  vi.mocked(api.getCloudflareVerifierStatus).mockResolvedValue({ ...verifier, installer_enabled: enabled, state, runner_id: state === 'ready' ? 'new-runner' : null });
  await act(async () => { render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'cloudflare', connectionId: 'connection' }} />); });
  expect(api.getCloudflareInstall).toHaveBeenLastCalledWith(id);
  expect(screen.queryByText(/^Ready/)).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Cloudflare verifier' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check data and get quote' })).toBeNull();
  await click('Dismiss');
  expect(localStorage.getItem(key)).toBeNull(); expect(localStorage.getItem(`${key}:request`)).toBeNull();
  expect(screen.getByRole('heading', { name: 'Cloudflare verifier' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check verifier status' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Set up the verifier' })).toBeNull();
  expect(!!screen.queryByRole('button', { name: 'Connect Cloudflare' })).toBe(enabled === true && state === 'none');
  expect((screen.getByRole('button', { name: 'Check data and get quote' }) as HTMLButtonElement).disabled).toBe(state !== 'ready');
  expect(window.location.search).toBe('');
  expect(api.probeGatewayVerification).not.toHaveBeenCalled();
});
it.each([[404, 1], [503, 3]])('stops after HTTP %s with %s failed reads and offers Dismiss', async (code, count) => {
  localStorage.setItem(key, id); localStorage.setItem(`${key}:request`, id);
  vi.mocked(api.getCloudflareInstall).mockRejectedValue({ response: { status: code } });
  await act(async () => { render(<Harness />); });
  await act(async () => { await vi.advanceTimersByTimeAsync((count - 1) * 3000); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(count);
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  expect(screen.queryByText('Checking installation status…')).toBeNull();
  await visible('hidden'); await visible('visible');
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(count);
  await click('Dismiss');
  expect(screen.getByText('Existing setup')).toBeTruthy();
  expect(localStorage.getItem(key)).toBeNull(); expect(localStorage.getItem(`${key}:request`)).toBeNull();
});
it('resets the consecutive failure budget after a successful read', async () => {
  await mount();
  vi.mocked(api.getCloudflareInstall).mockRejectedValueOnce(new Error()).mockRejectedValueOnce(new Error());
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  vi.mocked(api.getCloudflareInstall).mockRejectedValue(new Error());
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
});
it('ignores query and extra secret fields; hides observation times by default', async () => {
  window.history.replaceState({}, '', '/?code=code-canary&state=state-canary#token-canary');
  await mount(true, { ...initial, claimed_at: 456, runtime: { state: 'authorizing', claimed_observed_at: 123, closed_observed_at: 124, token_consumed_observed_at: 125, first_empty_poll_observed_at: 126, last_poll_observed_at: 127 }, error: 'raw-canary', token: 'token-canary' } as api.CloudflareInstallStatus);
  expect(document.body.textContent).not.toMatch(/canary|11111111/);
  expect(localStorage.getItem(key)).toBe(id);
  const details = screen.getByText('Verification details').parentElement as HTMLDetailsElement;
  expect(details.open).toBe(false);
  for (const [label, value] of [['Authorization received', 123], ['Installation closed', 124], ['Registration', 125], ['First empty poll', 126], ['Last poll', 127]]) expect(details.textContent).toContain(`${label} observed (UTC epoch seconds): ${value}`);
  expect(details.textContent).not.toContain('456');
});
it.each([true, false])('keeps installer disabled with the restore alert for corrupt storage with capability %s', async enabled => {
  localStorage.setItem(key, 'code=secret');
  vi.mocked(api.getCloudflareVerifierStatus).mockResolvedValue({ ...verifier, installer_enabled: enabled });
  await act(async () => { render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'cloudflare', connectionId: 'connection' }} />); });
  await click('Verify this data');
  expect(api.getCloudflareInstall).not.toHaveBeenCalled();
  if (enabled) expect((screen.getByRole('button', { name: 'Connect Cloudflare' }) as HTMLButtonElement).disabled).toBe(true);
  else expect(screen.queryByRole('button', { name: 'Connect Cloudflare' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Cloudflare verifier' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check verifier status' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Set up the verifier' })).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Could not restore installation');
  expect(document.body.textContent).not.toContain('code=secret');
});
it('dismiss clears only the completed intent and request, keeping start available', async () => {
  localStorage.setItem(`${key}:request`, id);
  await mount(true, { ...initial, phase: 'expired', error: 'expired' });
  await click('Dismiss');
  expect(localStorage.getItem(key)).toBeNull(); expect(localStorage.getItem(`${key}:request`)).toBeNull();
  expect(screen.getByRole('button', { name: 'Connect Cloudflare' })).toBeTruthy();
});
it('shows only the verified bound account in optional pre-consent details', async () => {
  vi.mocked(listSellerWorkspaceConnections).mockResolvedValue([
    { id: 'other', provider: 'r2', status: 'verified', provider_account_id: 'wrong-account' },
    { id: 'connection', provider: 'r2', status: 'verified', provider_account_id: 'bound-account' },
  ] as Awaited<ReturnType<typeof listSellerWorkspaceConnections>>);
  await mount(false);
  const details = screen.getByText('Cloudflare account').parentElement as HTMLDetailsElement;
  expect(details.open).toBe(false);
  await act(async () => { details.open = true; fireEvent(details, new Event('toggle')); });
  expect(screen.getByText('Account ID: bound-account')).toBeTruthy();
  expect(document.body.textContent).not.toContain('wrong-account');
});

it.each(['ready', 'ready_attested'] as const)('polls a closed intent through waiting to %s without reload', async state => {
  await mount(true, { ...initial, phase: 'closed', runtime: { state: 'waiting_registration' }, access_removal_confirmed_by_seller: state === 'ready_attested' });
  vi.mocked(api.getCloudflareInstall).mockResolvedValue({ ...initial, phase: 'closed', runtime: { state }, message: `Server ${state}` });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByRole('status').textContent).toBe(`Server ${state}`);
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(2);
});
it.each([undefined, true])('allows resource attestation after earlier access attestation and a later boot timeout (pending %s)', async resource_cleanup_pending => {
  const attested = { ...initial, phase: 'closed' as const, runtime: { state: 'waiting_registration' as const }, access_removal_confirmed_by_seller: true };
  await mount(true, attested);
  const timedOut = { ...attested, resource_cleanup_pending, runtime: { state: 'boot_timed_out' as const }, residual_resources: ['owned-resource'] };
  vi.mocked(api.getCloudflareInstall).mockResolvedValue(timedOut);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByText('owned-resource')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Record access removal' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(api.controlCloudflareInstall).mockResolvedValue(timedOut);
  await click('Record access removal');
  expect(api.controlCloudflareInstall).toHaveBeenCalledExactlyOnceWith(id, 'cleanup-attestation');
});
it.each([true, false])('uses the cleanup flag for mixed or healthy access-only consent (pending %s)', async resource_cleanup_pending => {
  await mount(true, { ...initial, phase: 'closed', runtime: { state: 'cleanup_unconfirmed' }, resource_cleanup_pending, residual_resources: ['listed-resource'] });
  expect(screen.getByRole('checkbox', { name: resource_cleanup_pending ? 'I have removed the listed verifier resources and app access in Cloudflare.' : 'I have removed the app’s access in Cloudflare.' })).toBeTruthy();
  if (!resource_cleanup_pending) expect(document.body.textContent).not.toMatch(/removed the.*resources|remove them/);
});
it('offers resource-only attestation regardless of runtime state after access was attested', async () => {
  await mount(true, { ...initial, phase: 'closed', runtime: { state: 'ready_attested' }, resource_cleanup_pending: true, access_removal_confirmed_by_seller: true });
  expect(screen.getByRole('checkbox', { name: 'I have removed the listed verifier resources in Cloudflare.' })).toBeTruthy();
});
it('keeps saved terminal residue when the latest intent was dismissed', async () => {
  const latest = '22222222-2222-4222-8222-222222222222';
  localStorage.setItem(`${key}:dismissed`, latest);
  const view = await mount(true, { ...initial, phase: 'closed', runtime: { state: 'failed_residue' } });
  await act(async () => { view.rerender(<Harness status={{ ...verifier, latest_intent_id: latest }} />); });
  expect(localStorage.getItem(key)).toBe(id); expect(api.getCloudflareInstall).not.toHaveBeenCalledWith(latest);
});
it('explains the fixed residue refusal on start', async () => {
  vi.mocked(api.startCloudflareInstall).mockRejectedValue({ response: { status: 409, data: { detail: 'install_residue_unresolved' } } });
  await mount(false); await click('Connect Cloudflare');
  expect(screen.getByRole('alert').textContent).toBe('Confirm you removed the verifier resources and app access in Cloudflare before trying again.');
});
it.each([true, false])('discovers a finished intent with installer flag %s and remembers Dismiss across reload', async enabled => {
  vi.mocked(api.getCloudflareVerifierStatus).mockResolvedValue({ ...verifier, installer_enabled: enabled, latest_intent_id: id });
  vi.mocked(api.getCloudflareInstall).mockResolvedValue({ ...initial, phase: 'closed', runtime: { state: 'failed_removed' } });
  const renderFlow = () => render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'cloudflare', connectionId: 'connection' }} />);
  let view!: ReturnType<typeof render>;
  await act(async () => { view = renderFlow(); }); await click('Verify this data');
  expect(api.getCloudflareInstall).toHaveBeenCalledWith(id);
  expect(screen.getByRole('status').textContent).toBe(initial.message);
  expect(!!screen.queryByRole('button', { name: 'Connect Cloudflare' })).toBe(enabled);
  expect(screen.queryByRole('button', { name: 'Cancel installation' })).toBeNull();
  await click('Dismiss'); view.unmount(); vi.mocked(api.getCloudflareInstall).mockClear();
  await act(async () => { renderFlow(); }); await click('Verify this data');
  expect(api.getCloudflareInstall).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  expect(localStorage.getItem(`${key}:dismissed`)).toBe(id);
});
it.each(['ready', 'ready_attested'] as const)('reconciles saved residue with latest %s and starts only the deliberate free probe', async state => {
  localStorage.setItem(key, id);
  const latest = '22222222-2222-4222-8222-222222222222';
  vi.mocked(api.getCloudflareInstall).mockImplementation(async intent_id => ({ ...initial, intent_id, phase: 'closed', access_removal_confirmed_by_seller: true, runtime: { state: intent_id === id ? 'failed_residue' : state }, resource_cleanup_pending: false, residual_resources: ['healthy-resource'] }));
  vi.mocked(api.getCloudflareVerifierStatus).mockResolvedValue({ ...verifier, latest_intent_id: latest, state: 'ready', runner_id: 'runner' });
  vi.mocked(api.probeGatewayVerification).mockResolvedValue({ data: { probe_id: 'probe', state: 'queued' }, retryAfter: 60 });
  await act(async () => { render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'cloudflare', connectionId: 'connection' }} />); });
  expect(api.getCloudflareInstall).toHaveBeenLastCalledWith(latest); expect(localStorage.getItem(key)).toBe(latest);
  expect(api.probeGatewayVerification).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Check data and get quote' })).toBeNull();
  expect(screen.queryByText('Cleanup details')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include column names and row counts in the findings' }));
  await click('Start free check');
  expect(api.probeGatewayVerification).toHaveBeenCalledExactlyOnceWith('listing', { confirm: true, preview_requested: true, idempotency_key: expect.any(String) });
  expect(api.startGatewayVerification).not.toHaveBeenCalled();
});
it.each([{ eligible: false }, { state: 'waiting' as const }])('disables the free CTA under the handler guard %j', async guard => {
  localStorage.setItem(key, id);
  vi.mocked(api.getCloudflareInstall).mockResolvedValue({ ...initial, phase: 'closed', runtime: { state: 'ready' } });
  vi.mocked(api.getCloudflareVerifierStatus).mockResolvedValue({ ...verifier, state: 'ready', ...guard });
  await act(async () => { render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'cloudflare', connectionId: 'connection' }} />); });
  expect((screen.getByRole('button', { name: 'Start free check' }) as HTMLButtonElement).disabled).toBe(true);
  await click('Start free check');
  expect(api.probeGatewayVerification).not.toHaveBeenCalled(); expect(api.startGatewayVerification).not.toHaveBeenCalled();
});

it('starts a fresh intent beside a finished intent and resumes polling it', async () => {
  localStorage.setItem(`${key}:request`, id);
  const nextId = '22222222-2222-4222-8222-222222222222';
  const assign = vi.fn();
  vi.stubGlobal('window', Object.create(window, { location: { value: { assign } } }));
  const view = await mount(true, { ...initial, phase: 'closed', runtime: { state: 'failed_removed' } });
  expect(screen.getByRole('status').textContent).toBe(initial.message);
  vi.mocked(api.startCloudflareInstall).mockResolvedValue({ intent_id: nextId, authorize_url: 'https://dash.cloudflare.com/oauth2/auth', expires_at: 123 });
  vi.mocked(api.getCloudflareInstall).mockResolvedValue({ ...initial, intent_id: nextId, phase: 'closed', runtime: { state: 'ready' } });
  await click('Connect Cloudflare');
  expect(vi.mocked(api.startCloudflareInstall).mock.calls[0][2]).not.toBe(id);
  await act(async () => { view.rerender(<Harness status={{ ...verifier, latest_intent_id: id }} />); });
  expect(localStorage.getItem(key)).toBe(nextId);
  expect(assign).toHaveBeenCalled(); expect(api.getCloudflareInstall).toHaveBeenLastCalledWith(nextId);
});
