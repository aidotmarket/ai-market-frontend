import React, { StrictMode, useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types';

// Synthetic markers only. Every API, QR renderer and private child is replaced.
const mocks = vi.hoisted(() => ({
  setup: vi.fn(), verify: vi.fn(), disable: vi.fn(), regenerate: vi.fn(), profile: vi.fn(),
  capabilities: vi.fn(), refresh: vi.fn(), notify: vi.fn(), toast: vi.fn(), push: vi.fn(),
  copy: vi.fn(), reauth: null as null | { onSuccess: (token: string) => Promise<void>; onClose: () => void },
}));
const fixture = (id: string): User => ({ id, email: `${id}@example.invalid`, first_name: `Synthetic ${id}`,
  last_name: 'Fixture', company_name: '', role: 'buyer', created_at: '2026-01-01',
  totp_enabled: false, auth_methods: ['password'], two_factor_setup_eligible: true,
  reauth_method: 'password' } as User);
let state = { user: fixture('A') as User | null, token: 'unusable-A' as string | null,
  isAuthenticated: true, isLoading: false, hydrated: true, refreshAuth: mocks.refresh };
const listeners = new Set<(next: typeof state, previous: typeof state) => void>();
function useAuthStore<T = typeof state>(selector: (s: typeof state) => T = (s) => s as T) {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => selector(state));
}
useAuthStore.getState = () => state;
useAuthStore.subscribe = (fn: (next: typeof state, previous: typeof state) => void) => {
  listeners.add(fn); return () => { listeners.delete(fn); };
};
vi.mock('@/store/auth', () => ({ useAuthStore }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/dashboard/settings' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/api/auth', () => ({ setup2FA: mocks.setup, verify2FASetup: mocks.verify, disable2FA: mocks.disable,
  regenerateBackupCodes: mocks.regenerate, updateProfile: mocks.profile, SSO_MANAGED_2FA_MESSAGE: 'Synthetic managed message' }));
vi.mock('@/api/capabilities', () => ({ getCapabilities: mocks.capabilities }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ default: () => null, notifyCapabilitiesChanged: mocks.notify }));
vi.mock('@/lib/company-sign-in', () => ({ companySignInEnabled: () => false }));
vi.mock('@/components/CompanyAuthenticator', () => ({ default: () => null, companyEnrollmentOffered: () => false }));
vi.mock('@/components/TotpQrCode', () => ({ default: () => <span>Synthetic QR placeholder</span> }));
vi.mock('@/app/dashboard/settings/ReauthModal', () => ({ default: (props: { isOpen: boolean; onSuccess: (token: string) => Promise<void>; onClose: () => void }) => {
  if (!props.isOpen) return null;
  mocks.reauth = props;
  return <button onClick={() => void props.onSuccess('UNUSABLE_REAUTH')}>Complete synthetic reauth</button>;
} }));
vi.mock('@/app/dashboard/settings/ConnectedApps', () => ({ default: () => null }));
vi.mock('@/app/dashboard/settings/SellerAuthority', () => ({ default: () => null }));
vi.mock('@/app/dashboard/settings/SellerOperationContinuation', () => ({ default: () => null }));
vi.mock('@/api/sellerWorkspace', () => ({ getSellerWorkspaceCapabilities: vi.fn().mockResolvedValue({}), isAWSConnectionAvailable: () => false }));
vi.mock('@/api/sellerGateways', () => ({ listSellerGateways: vi.fn().mockResolvedValue([]) }));
import Page from '@/app/dashboard/settings/page';
import Layout from '@/app/dashboard/layout';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const setupMaterial = { secret: 'UNUSABLE_A_SETUP', qr_uri: 'synthetic:offline-only', expires_in: 600 };
const recovery = { backup_codes: ['UNUSABLE_A_RECOVERY'] };
function auth(id: string | null, token = `unusable-${id}`) {
  const previous = state; state = { ...state, user: id ? fixture(id) : null, token: id ? token : null, isAuthenticated: !!id };
  for (const listener of [...listeners]) listener(state, previous);
}
const settle = () => act(async () => { await Promise.resolve(); });
async function mount(strict = false) { const child = <Layout><Page /></Layout>;
  const view = render(strict ? <StrictMode>{child}</StrictMode> : child); await settle(); return view; }
async function click(name: string) { fireEvent.click(screen.getByRole('button', { name })); await settle(); }
async function setup() { await click('Enable two-factor authentication'); await click('Complete synthetic reauth'); }
async function verify() { fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } }); await click('Verify and enable'); }
async function save() { fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Synthetic changed' } }); await click('Save changes'); }
function noGlobalEffects() { expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.reauth = null;
  state = { user: fixture('A'), token: 'unusable-A', isAuthenticated: true, isLoading: false, hydrated: true, refreshAuth: mocks.refresh };
  mocks.capabilities.mockResolvedValue({ seller: { effective_status: 'not_requested' } });
  mocks.setup.mockResolvedValue(setupMaterial); mocks.verify.mockResolvedValue(recovery);
  mocks.regenerate.mockResolvedValue(recovery); mocks.disable.mockResolvedValue({ message: 'Synthetic disabled' });
  mocks.refresh.mockResolvedValue(undefined); mocks.profile.mockResolvedValue({}); mocks.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } });
});
afterEach(() => { cleanup(); });

describe('actual SettingsPage account and visit ownership', () => {
  it('keeps ordinary setup, verification, copy, done and profile usable in StrictMode', async () => {
    await mount(true); await setup(); expect(screen.getByText(setupMaterial.secret)).toBeTruthy();
    await verify(); expect(screen.getByText(recovery.backup_codes[0])).toBeTruthy();
    await click('Copy all'); expect(mocks.copy).toHaveBeenCalledWith('UNUSABLE_A_RECOVERY');
    await click('Done'); await save(); expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(mocks.profile).toHaveBeenCalledWith({ first_name: 'Synthetic changed', last_name: 'Fixture', company_name: undefined });
  });
  it('clears all rendered private material and drafts when B replaces A', async () => {
    await mount(); await setup(); fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Private A draft' } });
    act(() => auth('B')); await settle();
    expect(screen.getByText('B@example.invalid')).toBeTruthy(); expect(screen.queryByText(setupMaterial.secret)).toBeNull();
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Synthetic B');
  });
  it.each(['B', 'A-B-A', 'A-null-A', 'logout'])('retires pending setup before commit across %s', async (transition) => {
    const pending = deferred<typeof setupMaterial>(); mocks.setup.mockReturnValueOnce(pending.promise);
    await mount(); await setup();
    act(() => { auth(transition === 'logout' || transition === 'A-null-A' ? null : 'B'); if (transition.startsWith('A-')) auth('A'); });
    await act(async () => pending.resolve(setupMaterial)); expect(screen.queryByText(setupMaterial.secret)).toBeNull(); noGlobalEffects();
  });
  it('preserves setup and current profile behavior through same-account credential refresh', async () => {
    await mount(); await setup(); act(() => auth('A', 'unusable-rotated')); await settle();
    expect(screen.getByText(setupMaterial.secret)).toBeTruthy(); await verify(); expect(screen.getByText(recovery.backup_codes[0])).toBeTruthy();
  });
  it('keeps drafts and pending setup through token-only rotation', async () => {
    const pending = deferred<typeof setupMaterial>(); mocks.setup.mockReturnValueOnce(pending.promise);
    await mount(); await setup();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Current draft' } });
    act(() => { const previous = state; state = { ...state, token: 'unusable-new-token' };
      for (const listener of [...listeners]) listener(state, previous); });
    await act(async () => pending.resolve(setupMaterial));
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Current draft');
    expect(screen.getByText(setupMaterial.secret)).toBeTruthy();
  });
  it.each(['disable', 'regenerate'] as const)('keeps ordinary %s usable', async (action) => {
    state = { ...state, user: { ...fixture('A'), totp_enabled: true } };
    await mount(); await click(action === 'disable' ? 'Disable 2FA' : 'Regenerate backup codes');
    fireEvent.change(screen.getByLabelText('Current TOTP code'), { target: { value: '123456' } });
    await click(action === 'disable' ? 'Confirm disable' : 'Generate new codes'); await click('Complete synthetic reauth');
    expect(mocks[action]).toHaveBeenCalledWith('UNUSABLE_REAUTH', '123456');
    if (action === 'disable') { expect(mocks.refresh).toHaveBeenCalledTimes(1); expect(mocks.notify).toHaveBeenCalledTimes(1); }
    else expect(screen.getByText(recovery.backup_codes[0])).toBeTruthy();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });
  it.each(['resolve', 'reject'] as const)('drops late verification %s and never unlocks the new setup', async (outcome) => {
    const old = deferred<typeof recovery>(); mocks.verify.mockReturnValueOnce(old.promise);
    await mount(); await setup(); await verify(); act(() => auth('B')); await settle();
    const current = deferred<typeof setupMaterial>(); mocks.setup.mockReturnValueOnce(current.promise); await setup();
    await act(async () => { if (outcome === 'resolve') old.resolve(recovery); else old.reject(new Error('obsolete verification')); });
    expect(screen.queryByText(recovery.backup_codes[0])).toBeNull(); noGlobalEffects();
    expect((screen.getByRole('button', { name: 'Starting...' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => current.resolve({ ...setupMaterial, secret: 'UNUSABLE_B_SETUP' })); expect(screen.getByText('UNUSABLE_B_SETUP')).toBeTruthy();
  });
  it('rejects a retained old reauth completion before it can dispatch a new API call', async () => {
    await mount(); await click('Enable two-factor authentication'); const old = mocks.reauth!;
    act(() => { auth('B'); auth('A'); void old.onSuccess('UNUSABLE_OLD_REAUTH'); old.onClose(); }); await settle();
    expect(mocks.setup).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Complete synthetic reauth' })).toBeNull();
  });
  it.each(['resolve', 'reject'] as const)('has no global effects after profile departure: %s', async (outcome) => {
    const pending = deferred<object>(); mocks.profile.mockReturnValueOnce(pending.promise);
    const view = await mount(); await save(); view.unmount();
    await act(async () => { if (outcome === 'resolve') pending.resolve({}); else pending.reject(new Error('obsolete save')); }); noGlobalEffects();
  });
  it('retires a save at layout departure before promise continuations', async () => {
    const pending = deferred<object>(); mocks.profile.mockReturnValueOnce(pending.promise);
    function Departure({ show }: { show: boolean }) {
      React.useLayoutEffect(() => { if (!show) pending.resolve({}); }, [show]);
      return show ? <Page /> : null;
    }
    const view = render(<Departure show />); await settle(); await save();
    view.rerender(<Departure show={false} />); await settle(); noGlobalEffects();
  });
  it.each(['disable', 'regenerate'] as const)('retires pending %s before chained refresh or publication', async (action) => {
    state = { ...state, user: { ...fixture('A'), totp_enabled: true } };
    const pending = deferred<typeof recovery & { message: string }>(); mocks[action].mockReturnValueOnce(pending.promise);
    await mount(); await click(action === 'disable' ? 'Disable 2FA' : 'Regenerate backup codes');
    fireEvent.change(screen.getByLabelText('Current TOTP code'), { target: { value: '123456' } });
    await click(action === 'disable' ? 'Confirm disable' : 'Generate new codes'); await click('Complete synthetic reauth');
    act(() => auth('B')); await act(async () => pending.resolve({ ...recovery, message: 'obsolete' }));
    expect(screen.queryByText(recovery.backup_codes[0])).toBeNull(); noGlobalEffects();
  });
  it('suppresses clipboard completion feedback after replacement', async () => {
    const pending = deferred<void>(); mocks.copy.mockReturnValueOnce(pending.promise);
    await mount(); await setup(); await verify(); mocks.toast.mockClear(); mocks.notify.mockClear();
    await click('Copy all'); act(() => auth('B')); await act(async () => pending.resolve()); noGlobalEffects();
  });
  it('suppresses done redirects and feedback when its admitted refresh finishes after replacement', async () => {
    await mount(); await setup(); await verify(); const pending = deferred<void>(); mocks.refresh.mockReturnValueOnce(pending.promise);
    await click('Done'); act(() => auth('B')); mocks.toast.mockClear();
    await act(async () => pending.resolve()); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('does not publish an old capability result into B', async () => {
    const pending = deferred<{ seller: { effective_status: string } }>(); mocks.capabilities.mockReturnValueOnce(pending.promise);
    await mount(); act(() => auth('B')); await settle(); await act(async () => pending.resolve({ seller: { effective_status: 'active' } }));
    expect(screen.queryByLabelText('Company name')).toBeNull();
  });
});
