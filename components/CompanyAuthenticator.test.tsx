// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
const mocks = vi.hoisted(() => ({ setup: vi.fn(), verify: vi.fn(), recover: vi.fn(), push: vi.fn(), refresh: vi.fn(), signIn: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/api/company-authenticator', async original => ({ ...await original<typeof import('@/api/company-authenticator')>(), setupCompanyAuthenticator: mocks.setup, verifyCompanyAuthenticator: mocks.verify, recoverCompanyAuthenticator: mocks.recover }));
vi.mock('@/lib/company-sign-in', async original => ({ ...await original<typeof import('@/lib/company-sign-in')>(), startCompanySignIn: mocks.signIn }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,cG5n' } }));
import CompanyAuthenticator, { companyEnrollmentOffered } from './CompanyAuthenticator';
const user = { id: 'owner', sso_enforced: true, auth_methods: ['oidc'], totp_enabled: false,
  two_factor_setup_eligible: true, seller_binding_factor_readiness: { code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED', path: '/dashboard/settings' } } as User;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'false'); window.history.replaceState(null, '', '/dashboard/settings');
  useAuthStore.setState({ user, token: 'session', refreshAuth: mocks.refresh });
  mocks.setup.mockResolvedValue({ secret: 'SECRET', qr_uri: 'otpauth://totp/fixture?secret=SECRET', expires_in: 600 });
  mocks.verify.mockResolvedValue({ backup_codes: ['backup-one', 'backup-two'] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const start = async () => { render(<CompanyAuthenticator />); fireEvent.click(screen.getByRole('button', { name: 'Set up company authenticator' })); await screen.findByText('SECRET'); };
const verify = () => { fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' })); };
it.each(['oidc', 'saml'])('offers fresh server-approved %s enrollment', method => {
  expect(companyEnrollmentOffered({ ...user, auth_methods: [method] })).toBe(true);
});
it.each([
  { two_factor_setup_eligible: false, two_factor_setup_reason: 'two_factor_managed_by_sso' },
  { two_factor_setup_eligible: undefined }, { seller_binding_factor_readiness: null },
  { sso_enforced: false, auth_methods: ['google'] }, { two_factor_provider: 'github' },
  { auth_methods: ['password', 'oidc'] }, { totp_enabled: true },
] as Partial<User>[])('does not infer eligibility or enable the legacy flag-off flow from %j', patch => {
  expect(companyEnrollmentOffered({ ...user, ...patch })).toBe(false);
});
it('shows QR/secret, verifies once, shows one-time backup codes and returns only after saving', async () => {
  const path = '/confirm/11111111-1111-4111-8111-111111111111?t=' + 'a'.repeat(42) + 'A';
  window.history.replaceState(null, '', `/dashboard/settings?redirect=${encodeURIComponent(path)}`);
  await start(); expect(screen.getByText(/company sign-in is still required/)).toBeTruthy();
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
  verify(); await screen.findByText('Sign in again through your company, then restart setup.');
  expect(screen.queryByText('SECRET')).toBeNull();
});
it('expires setup locally without submitting a code', async () => {
  mocks.setup.mockResolvedValue({ secret: 'SECRET', qr_uri: 'otpauth://fixture', expires_in: -1 });
  await start(); verify(); await screen.findByRole('alert'); expect(mocks.verify).not.toHaveBeenCalled();
});
it('recovers with a backup code, refreshes retired credentials and offers re-enrollment', async () => {
  render(<CompanyAuthenticator recovery />);
  expect(screen.getByText(/Sign in through your company/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'backup-one' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText(/Authenticator disabled/);
  expect(mocks.recover).toHaveBeenCalledExactlyOnceWith('backup-one');
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Set up a new authenticator' }).getAttribute('href')).toBe('/dashboard/settings#security');
  expect(mocks.verify).not.toHaveBeenCalled();
});
it('keeps recovery unavailable after an invalid backup code', async () => {
  mocks.recover.mockRejectedValue({ response: { data: { detail: 'Invalid verification code' } } });
  render(<CompanyAuthenticator recovery />);
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'bad-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByRole('alert'); expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Set up a new authenticator' })).toBeNull();
});

it('starts fresh enrollment at settings and resumes setup automatically', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  mocks.signIn.mockResolvedValue(undefined);
  render(<CompanyAuthenticator />);
  expect(screen.getByRole('button', { name: 'Check company sign-in' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Set up company authenticator' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Company sign-in ID'), { target: { value: 'company-id' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in through your company' }));
  await screen.findByText('SECRET');
  expect(mocks.signIn).toHaveBeenCalledWith('company-id', '/dashboard/settings');
  expect(mocks.setup).toHaveBeenCalledOnce();
});
it('resumes stale lost-authenticator recovery after backend freshness refusal without replaying the backup code', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  mocks.signIn.mockResolvedValue(undefined);
  mocks.recover.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'RECENT_LOGIN_REQUIRED' } } });
  render(<CompanyAuthenticator recovery />);
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'backup-one' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByLabelText('Company sign-in ID');
  expect(screen.queryByLabelText('Backup code')).toBeNull();
  fireEvent.change(screen.getByLabelText('Company sign-in ID'), { target: { value: 'company-id' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in through your company' }));
  await screen.findByLabelText('Backup code');
  expect(mocks.signIn).toHaveBeenCalledWith('company-id', '/dashboard/settings');
  expect(mocks.recover).toHaveBeenCalledExactlyOnceWith('backup-one'); expect(mocks.setup).not.toHaveBeenCalled();
});
it('shows a refused sign-in and retries before setup', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  mocks.signIn.mockRejectedValueOnce(new Error('Company sign-in did not finish or expired. Try again.')).mockResolvedValueOnce(undefined);
  render(<CompanyAuthenticator />);
  fireEvent.change(screen.getByLabelText('Company sign-in ID'), { target: { value: 'company-id' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in through your company' }));
  await screen.findByRole('alert'); expect(mocks.setup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry company sign-in' }));
  await screen.findByText('SECRET'); expect(mocks.signIn).toHaveBeenCalledTimes(2);
});

it('recovers a flag-on already-fresh session with exactly one remaining backup code', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  const remaining = new Set(['last-backup']);
  mocks.recover.mockImplementation(async code => { expect(remaining.delete(code)).toBe(true); });
  render(<CompanyAuthenticator recovery />);
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'last-backup' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText(/Authenticator disabled/);
  expect(mocks.recover).toHaveBeenCalledExactlyOnceWith('last-backup');
  expect(remaining.size).toBe(0); expect(mocks.signIn).not.toHaveBeenCalled();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('keeps exactly one next action after a flag-on invalid backup code', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  mocks.recover.mockRejectedValueOnce({ response: { status: 400, data: { detail: 'Invalid verification code' } } }).mockResolvedValueOnce({});
  render(<CompanyAuthenticator recovery />);
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'bad-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText('That code did not work. Try again.');
  expect(screen.queryByLabelText('Company sign-in ID')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check company sign-in' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Disable lost authenticator' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'good-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText(/Authenticator disabled/);
  expect(mocks.signIn).not.toHaveBeenCalled();
});
