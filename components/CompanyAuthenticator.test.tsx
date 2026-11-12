// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import * as authApi from '@/api/auth';
import type { User } from '@/types';
const mocks = vi.hoisted(() => ({ setup: vi.fn(), verify: vi.fn(), recover: vi.fn(), push: vi.fn(), refresh: vi.fn(), signIn: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/api/company-authenticator', async original => ({ ...await original<typeof import('@/api/company-authenticator')>(), setupCompanyAuthenticator: mocks.setup, verifyCompanyAuthenticator: mocks.verify, recoverCompanyAuthenticator: mocks.recover }));
vi.mock('@/lib/company-sign-in', async original => ({ ...await original<typeof import('@/lib/company-sign-in')>(), startCompanySignIn: mocks.signIn }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,cG5n' } }));
import CompanyAuthenticator, { companyEnrollmentOffered } from './CompanyAuthenticator';
const user = { id: 'owner', sso_enforced: true, auth_methods: ['oidc'], totp_enabled: false,
  two_factor_setup_eligible: true,  } as User;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'false'); window.history.replaceState(null, '', '/dashboard/settings');
  useAuthStore.setState({ user, token: 'session', refreshAuth: mocks.refresh });
  mocks.setup.mockResolvedValue({ secret: 'SECRET', qr_uri: 'otpauth://totp/fixture?secret=SECRET', expires_in: 600 });
  mocks.recover.mockResolvedValue({ access_token: 'replacement', token_type: 'bearer', message: 'disabled' });
  vi.spyOn(authApi, 'getMe').mockResolvedValue(user);
  mocks.verify.mockResolvedValue({ backup_codes: ['backup-one', 'backup-two'] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const start = async () => { render(<CompanyAuthenticator />); fireEvent.click(screen.getByRole('button', { name: 'Set up company authenticator' })); await screen.findByText('SECRET'); };
const verify = () => { fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' })); };
it.each(['oidc', 'saml'])('offers fresh server-approved %s enrollment', method => {
  expect(companyEnrollmentOffered({ ...user, auth_methods: [method] })).toBe(true);
});
it.each([
  { two_factor_setup_eligible: false, two_factor_setup_reason: 'two_factor_managed_by_sso' },
  { two_factor_setup_eligible: undefined },
  { sso_enforced: false, auth_methods: ['google'] }, { two_factor_provider: 'github' },
  { auth_methods: ['password', 'oidc'] }, { totp_enabled: true },
] as Partial<User>[])('does not infer eligibility or enable the legacy flag-off flow from %j', patch => {
  expect(companyEnrollmentOffered({ ...user, ...patch })).toBe(false);
});
it('shows QR/secret, verifies once, shows one-time backup codes and returns only after saving', async () => {
  const path = '/confirm/11111111-1111-4111-8111-111111111111?t=' + 'a'.repeat(42) + 'A';
  window.history.replaceState(null, '', `/dashboard/settings?redirect=${encodeURIComponent(path)}`);
  await start(); expect(screen.queryByLabelText('Company sign-in ID')).toBeNull();
  verify(); await screen.findByText('backup-one');
  expect(mocks.verify).toHaveBeenCalledExactlyOnceWith('123456'); expect(screen.queryByText('SECRET')).toBeNull();
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'I saved my backup codes' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(path));
});
it('keeps setup after an invalid code and clears it after stale company proof', async () => {
  mocks.verify.mockRejectedValueOnce({ response: { data: { detail: 'Invalid verification code' } } });
  await start(); verify(); await screen.findByRole('alert'); expect(screen.getByText('SECRET')).toBeTruthy();
  mocks.verify.mockRejectedValueOnce({ response: { data: { detail: 'RECENT_LOGIN_REQUIRED' } } });
  verify(); await screen.findByText('Please refresh the page and try again.');
  expect(screen.queryByText('SECRET')).toBeNull();
});
it('expires setup locally without submitting a code', async () => {
  mocks.setup.mockResolvedValue({ secret: 'SECRET', qr_uri: 'otpauth://fixture', expires_in: -1 });
  await start(); verify(); await screen.findByRole('alert'); expect(mocks.verify).not.toHaveBeenCalled();
});
it('recovers in one click, installs replacement credentials and offers re-enrollment', async () => {
  render(<CompanyAuthenticator recovery />);
  expect(screen.queryByLabelText('Backup code')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText(/Authenticator disabled/);
  expect(mocks.recover).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(useAuthStore.getState().token).toBe('replacement');
  expect(screen.getByRole('link', { name: 'Set up a new authenticator' }).getAttribute('href')).toBe('/dashboard/settings#security');
  expect(mocks.verify).not.toHaveBeenCalled();
});
it('keeps failed recovery visible without a challenge', async () => {
  mocks.recover.mockRejectedValue({ response: { data: { detail: 'Invalid verification code' } } });
  render(<CompanyAuthenticator recovery />);
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByRole('alert'); expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Set up a new authenticator' })).toBeNull();
});

it.each(['true', 'false'])('starts company enrollment without sign-in when the return flag is %s', async enabled => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', enabled);
  await start();
  expect(mocks.setup).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Company sign-in ID')).toBeNull();
});
it('shows a failed recovery and allows retry without requesting proof', async () => {
  mocks.recover.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'RECENT_LOGIN_REQUIRED' } } }).mockResolvedValueOnce({ access_token: 'replacement', token_type: 'bearer' });
  render(<CompanyAuthenticator recovery />);
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText('Please refresh the page and try again.');
  expect(screen.queryByLabelText('Backup code')).toBeNull();
  expect(screen.queryByLabelText('Company sign-in ID')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText(/Authenticator disabled/);
  expect(mocks.recover).toHaveBeenNthCalledWith(1);
  expect(mocks.recover).toHaveBeenNthCalledWith(2);
  expect(mocks.signIn).not.toHaveBeenCalled();
});

it('keeps a successful setup after preflight rotates the access token', async () => {
  mocks.setup.mockImplementation(async () => {
    useAuthStore.setState({ token: 'fresh-session' });
    return { secret: 'REFRESHED', qr_uri: 'otpauth://fixture', expires_in: 600 };
  });
  render(<CompanyAuthenticator />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up company authenticator' }));
  await screen.findByText('REFRESHED');
  expect(mocks.push).not.toHaveBeenCalled();
});
