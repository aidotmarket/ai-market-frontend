// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCloudflareInstaller } from './CloudflareInstaller';
import GatewayVerificationFlow from './GatewayVerificationFlow';
import * as api from '@/api/dataVerificationGateway';
import { listSellerWorkspaceConnections } from '@/api/sellerWorkspace';
vi.mock('@/api/dataVerificationGateway', async original => ({ ...await original<typeof api>(), startCloudflareInstall: vi.fn(), getCloudflareInstall: vi.fn(), controlCloudflareInstall: vi.fn(), getCloudflareVerifierStatus: vi.fn(), probeGatewayVerification: vi.fn() }));
vi.mock('@/api/sellerWorkspace', () => ({ listSellerWorkspaceConnections: vi.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const key = 'cloudflare-install:seller:listing:connection';
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
const verifier: api.CloudflareVerifierStatus = { installer_enabled: true, eligible: true, connection_id: 'connection', state: 'none', runner_id: null, jurisdiction: 'default', release_id: null, scanner_version: null, binary_sha256: null, worker_identity: null, image_digest: null, poll_interval_minutes: null, registered_at: null, last_seen_at: null, setup_expires_at: null };
const initial: api.CloudflareInstallStatus = { intent_id: id, phase: 'start', error: null, cleanup: 'not_started', claimed_at: null, updated_at: null, cancel_requested: null, access_removal_confirmed_by_seller: false, runtime: { state: 'pending' } };
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

it.each([
  ['start', null, 'Approve the installation on Cloudflare. Installing does not start a data check.'],
  ['callback_claimed', null, 'Installing your verifier in Cloudflare…'],
  ['callback_refused', 'consent_cancelled', 'Cloudflare connection cancelled. Nothing was installed.'],
  ['cancelled', null, 'Cloudflare connection cancelled. Nothing was installed.'],
  ['closed', 'cleanup_unconfirmed', 'Access cleanup unconfirmed — disconnect the app in Cloudflare. No data check can start yet.'],
  ['closed', 'oauth_refused', 'Installation failed. Some verifier resources may remain in Cloudflare and incur charges. Open cleanup details.'],
  ['closed', 'oauth_complete', 'Installation status is unavailable. No data check can start yet.'],
  ['closed', 'memory_lost', 'Installation session closed. Connect Cloudflare again.'],
  ['expired', 'expired', 'Cloudflare authorization expired. Connect Cloudflare again.'],
  ['start', 'binder_refused', 'Browser binding missing or changed. Cancel, then connect Cloudflare again.'],
  ['callback_refused', 'binding_changed', 'Installation details changed. Cancel and connect Cloudflare again.'],
  ['callback_refused', 'install_mint_refused', 'Installation status is unavailable. No data check can start yet.'],
  ['callback_refused', 'callback_invalid', 'Installation status is unavailable. No data check can start yet.'],
] as const)('renders actual backend state %s / %s safely', async (phase, error, copy) => {
  await mount(true, { ...initial, phase, error });
  expect(screen.getByRole('status').textContent).toBe(copy);
  expect(screen.queryByText(/^Ready/)).toBeNull();
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
  await mount();
  let resolve!: (status: api.CloudflareInstallStatus) => void;
  vi.mocked(api.getCloudflareInstall).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  vi.mocked(api.controlCloudflareInstall).mockResolvedValue({ ...initial, phase: 'cancelled' });
  await click('Cancel installation');
  expect(api.controlCloudflareInstall).toHaveBeenCalledWith(id, 'cancel');
  await act(async () => { resolve(initial); });
  expect(screen.getByRole('status').textContent).toBe('Cloudflare connection cancelled. Nothing was installed.');
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(api.getCloudflareInstall).toHaveBeenCalledTimes(2);
});
it.each(['cleanup_unconfirmed', 'oauth_refused'])('requires explicit access-removal attestation for %s', async error => {
  const status = { ...initial, phase: 'closed' as const, error, cleanup: error === 'cleanup_unconfirmed' ? 'unconfirmed' as const : 'not_started' as const };
  await mount(true, status);
  expect(!!screen.queryByText('Existing setup')).toBe(error === 'oauth_refused');
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Record access removal' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(api.controlCloudflareInstall).mockResolvedValue({ ...status, access_removal_confirmed_by_seller: true });
  await click('Record access removal');
  expect(api.controlCloudflareInstall).toHaveBeenCalledWith(id, 'cleanup-attestation');
  expect(screen.getByText('Access removal recorded as your statement, not provider proof.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  expect(screen.getByText('Existing setup')).toBeTruthy();
  expect(localStorage.getItem(key)).toBe(id);
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
it('ignores query, raw messages and extra secret fields; hides phase times by default', async () => {
  window.history.replaceState({}, '', '/?code=code-canary&state=state-canary#token-canary');
  await mount(true, { ...initial, claimed_at: 123, error: 'raw-canary', message: 'message-canary', token: 'token-canary', residual_resources: ['residue-canary'] } as api.CloudflareInstallStatus);
  expect(document.body.textContent).not.toMatch(/canary|11111111/);
  expect(localStorage.getItem(key)).toBe(id);
  const details = screen.getByText('Verification details').parentElement as HTMLDetailsElement;
  expect(details.open).toBe(false);
  expect(details.textContent).toContain('Authorization received (UTC epoch seconds): 123');
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
