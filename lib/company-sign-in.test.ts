// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
const mocks = vi.hoisted(() => ({ me: vi.fn(), refresh: vi.fn() }));
vi.mock('@/api/auth', () => ({ getMe: mocks.me }));
import { COMPANY_SIGN_IN_ERROR, companyReturnAllowed, isCompanySignInReturnPopup, startCompanySignIn } from './company-sign-in';
const id = '11111111-1111-4111-8111-111111111111';
const owner = { id: 'owner', sso_enforced: true } as User;
let navigation: HTMLAnchorElement;
let popup: { closed: boolean; close: ReturnType<typeof vi.fn>; location: { href: string } };
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  useAuthStore.setState({ user: owner, refreshAuth: mocks.refresh });
  mocks.refresh.mockResolvedValue(undefined); mocks.me.mockResolvedValue(owner);
  popup = { closed: false, close: vi.fn(), location: { href: 'https://identity.test/login' } };
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { navigation = this; });
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
it.each(['/dashboard/settings', `/confirm/${id}`])('returns from exactly %s and restores the cookie session without storing credentials', async path => {
  const session = vi.spyOn(Storage.prototype, 'setItem');
  const flow = startCompanySignIn('company-id', path);
  const url = new URL(navigation.href);
  expect(navigation.referrerPolicy).toBe('origin');
  expect(navigation.target).toBe(vi.mocked(window.open).mock.calls[0][1]);
  expect(url.pathname).toBe('/api/v1/auth/sso/oidc/authorize');
  expect([...url.searchParams]).toEqual([['org_slug', 'company-id'], ['return_path', path]]);
  expect(url.href).not.toContain('token');
  popup.location.href = window.location.origin + path;
  await vi.advanceTimersByTimeAsync(300); await flow;
  expect(mocks.refresh).toHaveBeenCalledOnce(); expect(popup.close).toHaveBeenCalledOnce();
  expect(session).not.toHaveBeenCalled();
});
it.each(['/dashboard/settings?x=1', '/dashboard/settings#security', `https://evil.test/confirm/${id}`, `/confirm/${id}?t=credential`, '/dashboard', '/confirm/ABCDEFAB-1111-4111-8111-111111111111', '/%64ashboard/settings', `/confirm/${id}\n`])('refuses a tampered target %s before navigation', async path => {
  expect(companyReturnAllowed(path)).toBe(false);
  await expect(startCompanySignIn('company-id', path)).rejects.toThrow(COMPANY_SIGN_IN_ERROR);
  expect(window.open).not.toHaveBeenCalled();
});
it.each(['/dashboard/settings?error=expired', '/dashboard/settings#tampered', '/confirm/' + id])('refuses an unexpected return %s', async path => {
  const flow = startCompanySignIn('company-id', '/dashboard/settings');
  const rejected = expect(flow).rejects.toThrow(COMPANY_SIGN_IN_ERROR);
  popup.location.href = window.location.origin + path;
  await vi.advanceTimersByTimeAsync(300); await rejected;
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it.each(['closed', 'expired'] as const)('reports %s state and allows a new attempt', async reason => {
  const flow = startCompanySignIn('company-id', '/dashboard/settings');
  const rejected = expect(flow).rejects.toThrow(COMPANY_SIGN_IN_ERROR);
  if (reason === 'closed') popup.closed = true;
  await vi.advanceTimersByTimeAsync(reason === 'closed' ? 300 : 600_000); await rejected;
  expect(mocks.refresh).not.toHaveBeenCalled();
  popup.closed = false; popup.location.href = window.location.origin + '/dashboard/settings';
  const retry = startCompanySignIn('company-id', '/dashboard/settings');
  await vi.advanceTimersByTimeAsync(300); await retry;
});
it('does not accept a different account after refresh', async () => {
  mocks.me.mockResolvedValue({ ...owner, id: 'other' });
  const flow = startCompanySignIn('company-id', '/dashboard/settings');
  const rejected = expect(flow).rejects.toThrow(COMPANY_SIGN_IN_ERROR);
  popup.location.href = window.location.origin + '/dashboard/settings';
  await vi.advanceTimersByTimeAsync(300); await rejected;
});
it('leaves flag-off navigation and storage untouched', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'false');
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  await expect(startCompanySignIn('company-id', '/dashboard/settings')).rejects.toThrow();
  expect(window.open).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
});

it('reports popup blocking before starting navigation', async () => {
  vi.mocked(window.open).mockReturnValue(null);
  await expect(startCompanySignIn('company-id', '/dashboard/settings')).rejects.toThrow('Allow popups');
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it('leaves cookie restoration to the original window on popup return only', () => {
  window.history.replaceState(null, '', '/dashboard/settings');
  Object.defineProperty(window, 'opener', { configurable: true, value: { aimCompanySignInPopup: window } });
  expect(isCompanySignInReturnPopup()).toBe(true);
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'false');
  expect(isCompanySignInReturnPopup()).toBe(false);
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  window.history.replaceState(null, '', '/dashboard/settings?tampered=1');
  expect(isCompanySignInReturnPopup()).toBe(false);
  Object.defineProperty(window, 'opener', { configurable: true, value: null });
});
