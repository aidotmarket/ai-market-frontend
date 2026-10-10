// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import axios from 'axios';
import SettingsPage from './page';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { checkCompanySignIn } from '@/lib/company-sign-in';
import { getConnectorGrants, getConnectorStatus } from '@/api/connector-oauth';

const authApi = vi.hoisted(() => ({
  getMe: vi.fn(), companySetup: vi.fn(), companyVerify: vi.fn(), companyRecover: vi.fn(),
  disable2FA: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  setup2FA: vi.fn(),
  submitReauth: vi.fn(),
  verifyReauthMagicLink: vi.fn(),
  updateProfile: vi.fn(),
  verify2FASetup: vi.fn(),
}));

const capabilitiesApi = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
}));
const companySignIn = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/lib/company-sign-in', async original => ({ ...await original<typeof import('@/lib/company-sign-in')>(), startCompanySignIn: companySignIn.start }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));

vi.mock('@/api/auth', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/auth')>(), ...authApi }));
vi.mock('@/api/company-authenticator', async original => ({ ...await original<typeof import('@/api/company-authenticator')>(), setupCompanyAuthenticator: authApi.companySetup, verifyCompanyAuthenticator: authApi.companyVerify, recoverCompanyAuthenticator: authApi.companyRecover }));
vi.mock('@/api/capabilities', () => capabilitiesApi);
vi.mock('@/api/connector-oauth', () => ({ getConnectorStatus: vi.fn(), getConnectorGrants: vi.fn(), revokeConnectorGrant: vi.fn() }));
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cG5n') },
}));
const user: User = {
  id: 'user-1',
  email: 'seller@example.com',
  first_name: 'Seller',
  last_name: null,
  company_name: 'Seller Co',
  role: 'seller',
  status: 'active',
  created_at: '2026-06-17T00:00:00Z',
  email_verified_at: '2026-06-17T00:00:00Z',
  totp_enabled: false,
  auth_methods: ['password'],
  primary_auth: 'password',
};

describe('SettingsPage capability refresh', () => {
  const realRefreshAuth = useAuthStore.getState().refreshAuth;
  const refreshAuth = vi.fn();

  const completeReauth = async (code = '654321') => {
    const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: code },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    });
  };

  const expiredReauth = Object.assign(new AxiosError('expired'), {
    response: { status: 400, data: { detail: 'Re-authentication required' } },
  });

  beforeEach(() => {
    window.history.replaceState(null, '', '/dashboard/settings');
    vi.mocked(getConnectorStatus).mockResolvedValue(false);
    vi.mocked(getConnectorGrants).mockResolvedValue([]);
    refreshAuth.mockResolvedValue(undefined);
    authApi.updateProfile.mockResolvedValue(undefined);
    authApi.submitReauth.mockResolvedValue({ token: 'fresh-settings-token' });
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'provisioning' },
    });
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
      pendingTwoFactor: null,
      refreshAuth,
    });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
    vi.clearAllMocks();
  });

  it('shows Connected apps for a buyer while keeping seller profile fields hidden', async () => {
    useAuthStore.setState({ user: { ...user, role: 'buyer', email: 'buyer@example.com' } });
    capabilitiesApi.getCapabilities.mockResolvedValue({ seller: { effective_status: 'not_requested' } });
    vi.mocked(getConnectorStatus).mockResolvedValue(true);

    render(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: 'Connected apps' })).toBeTruthy();
    await screen.findByText('To connect ai.market, choose it in Claude or ChatGPT.');
    await waitFor(() => expect(capabilitiesApi.getCapabilities).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByLabelText('First name')).toBeTruthy();
    expect(screen.queryByLabelText('Company name')).toBeNull();
    expect(getConnectorGrants).toHaveBeenCalledOnce();
  });

  it.each(['google', 'github'] as const)('hides new native setup for current %s sign-in with a legacy password', async provider => {
    useAuthStore.setState({user:{...user, auth_methods:['password',provider], primary_auth:'password',
      two_factor_setup_eligible:false,two_factor_setup_reason:'two_factor_managed_by_provider',two_factor_provider:provider,
      seller_two_factor_satisfied:true,reauth_method:'magic_link'}});
    render(<SettingsPage/>);
    expect(screen.getByText(`Sign-in security is managed by your ${provider==='google'?'Google':'GitHub'} account.`)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Enable two-factor authentication'})).toBeNull();
    expect(authApi.setup2FA).not.toHaveBeenCalled();expect(authApi.submitReauth).not.toHaveBeenCalled();
  });

  it('keeps enabled native recovery protected during provider sign-in', async()=>{
    useAuthStore.setState({user:{...user,totp_enabled:true,two_factor_setup_eligible:false,
      two_factor_setup_reason:'two_factor_already_enabled',two_factor_provider:'google',reauth_method:'totp'}});
    render(<SettingsPage/>);
    fireEvent.click(screen.getByRole('button',{name:'Disable 2FA'}));
    expect(screen.getByText('Confirm 2FA disable')).toBeTruthy();
    expect(authApi.disable2FA).not.toHaveBeenCalled();
    expect(screen.queryByText('Sign-in security is managed by your Google account.')).toBeNull();
  });

  it('uses the returned magic-link method without automatically sending email',async()=>{
    useAuthStore.setState({user:{...user,reauth_method:'magic_link'}});
    authApi.submitReauth.mockResolvedValue({token:null,method:'magic_link'});
    render(<SettingsPage/>);fireEvent.click(screen.getByRole('button',{name:'Enable two-factor authentication'}));
    const dialog=await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Password')).toBeNull();expect(authApi.submitReauth).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button',{name:'Send link'}));
    await screen.findByLabelText('Email link');expect(authApi.submitReauth).toHaveBeenCalledWith('', 'magic_link');
  });

  it('handles a provider 409 on an older server snapshot without leaving enrollment controls',async()=>{
    authApi.setup2FA.mockRejectedValueOnce(Object.assign(new AxiosError('policy'),{response:{status:409,data:{detail:'two_factor_managed_by_provider'}}}));
    render(<SettingsPage/>);fireEvent.click(screen.getByRole('button',{name:'Enable two-factor authentication'}));await completeReauth();
    await screen.findByText('Sign-in security is managed by your identity provider account.');
    expect(screen.queryByRole('button',{name:'Enable two-factor authentication'})).toBeNull();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();
  });

  it('refuses verification and hides a pending native enrollment when current policy changes',async()=>{
    authApi.setup2FA.mockResolvedValueOnce({secret:'fixture-secret',qr_uri:'otpauth://totp/fixture',expires_in:300});
    render(<SettingsPage/>);fireEvent.click(screen.getByRole('button',{name:'Enable two-factor authentication'}));await completeReauth();
    await screen.findByText('Set up your authenticator app');
    act(()=>useAuthStore.setState({user:{...user,two_factor_setup_eligible:false,two_factor_setup_reason:'two_factor_managed_by_provider',two_factor_provider:'github',reauth_method:'magic_link'}}));
    expect(screen.queryByText('Set up your authenticator app')).toBeNull();expect(screen.queryByText('fixture-secret')).toBeNull();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();expect(screen.getByText('Sign-in security is managed by your GitHub account.')).toBeTruthy();
  });

  it('dispatches capabilities:changed after a successful profile save', async () => {
    const onCapabilitiesChanged = vi.fn();
    window.addEventListener('capabilities:changed', onCapabilitiesChanged);

    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(authApi.updateProfile).toHaveBeenCalledOnce();
      expect(refreshAuth).toHaveBeenCalledOnce();
      expect(onCapabilitiesChanged).toHaveBeenCalledOnce();
    });

    window.removeEventListener('capabilities:changed', onCapabilitiesChanged);
  });

  it('does not dispatch capabilities:changed when the profile save fails', async () => {
    authApi.updateProfile.mockRejectedValueOnce(new Error('save failed'));
    const onCapabilitiesChanged = vi.fn();
    window.addEventListener('capabilities:changed', onCapabilitiesChanged);

    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(authApi.updateProfile).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(false);
    });
    expect(refreshAuth).not.toHaveBeenCalled();
    expect(onCapabilitiesChanged).not.toHaveBeenCalled();

    window.removeEventListener('capabilities:changed', onCapabilitiesChanged);
  });

  it('does not advertise card setup in general Settings', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(capabilitiesApi.getCapabilities).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole('heading', { name: 'Payment method for verification charges' })
    ).toBeNull();
    expect(screen.queryByRole('link', { name: 'Manage payment method' })).toBeNull();
  });

  it('reauthenticates before setup and uses the same token for verification', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    expect(authApi.setup2FA).not.toHaveBeenCalled();
    expect(screen.queryByText('setup-secret')).toBeNull();
    await completeReauth();
    expect(authApi.setup2FA).toHaveBeenCalledWith('fresh-settings-token');
    expect(await screen.findByText('setup-secret')).toBeTruthy();
    expect((await screen.findByRole('img', { name: 'QR code for two-factor authentication setup' })).getAttribute('src'))
      .toMatch(/^data:image\/png;base64,/);

    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await waitFor(() => expect(authApi.verify2FASetup).toHaveBeenCalledWith('123456', 'fresh-settings-token'));
    expect(await screen.findByRole('heading', { name: 'Backup codes' })).toBeTruthy();
  });
  it.each([
    `/confirm/11111111-1111-4111-8111-111111111111?t=${'a'.repeat(42)}A`,
    'https://evil.test/confirm', '//evil.test', '/confirm/invalid?t=token',
    `/confirm/11111111-1111-4111-8111-111111111111?t=${'a'.repeat(42)}A&next=https://evil.test`,
  ])('only resumes an exact safe confirmation after verified enrollment and Done: %s', async redirect => {
    window.history.replaceState(null, '', `/dashboard/settings?redirect=${encodeURIComponent(redirect)}#security`);
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await completeReauth();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await screen.findByRole('heading', { name: 'Backup codes' });
    expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(refreshAuth).toHaveBeenCalledOnce());
    if (redirect.endsWith(`?t=${'a'.repeat(42)}A`)) expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirect);
    else expect(navigation.push).not.toHaveBeenCalled();
  });

  it('shows the SSO managed message without offering setup', () => {
    useAuthStore.setState({ user: { ...user, auth_methods: ['magic_link'], primary_auth: 'magic_link', sso_enforced: true } });
    render(<SettingsPage />);
    expect(screen.getByText("Two-factor authentication for your account is managed by your organization's single sign-on.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable two-factor authentication' })).toBeNull();
    expect(authApi.submitReauth).not.toHaveBeenCalled();
  });

  it('shows the SSO managed message returned by setup', async () => {
    authApi.setup2FA.mockRejectedValueOnce(Object.assign(new AxiosError('SSO'), {
      response: { status: 409, data: { detail: 'two_factor_managed_by_sso' } },
    }));
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await completeReauth();
    expect(await screen.findByText("Two-factor authentication for your account is managed by your organization's single sign-on.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable two-factor authentication' })).toBeNull();
  });

  it('keeps backup codes copyable until Done, then handles a real 401 refresh', async () => {
    const refreshRequest = vi.spyOn(axios, 'post').mockRejectedValueOnce(Object.assign(new AxiosError('Unauthorized'), {
      response: { status: 401, data: { detail: 'Unauthorized' } },
    }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    useAuthStore.setState({ refreshAuth: realRefreshAuth });
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await completeReauth();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    expect(await screen.findByText('backup-one')).toBeTruthy();
    expect(refreshRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('backup-one'));
    expect(screen.getByText('backup-one')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(refreshRequest).toHaveBeenCalledOnce());
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    refreshRequest.mockRestore();
  });

  it('cancels before setup without enabling 2FA', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(authApi.setup2FA).not.toHaveBeenCalled();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();
    expect(screen.getByText('2FA Disabled')).toBeTruthy();
  });

  it('reauthenticates once after expiry and retries verification without restarting setup', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockRejectedValueOnce(expiredReauth).mockResolvedValueOnce({ backup_codes: ['backup-one'] });
    authApi.submitReauth.mockResolvedValueOnce({ token: 'first-token' }).mockResolvedValueOnce({ token: 'fresh-token' });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await completeReauth();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await completeReauth();
    expect(authApi.setup2FA).toHaveBeenCalledOnce();
    expect(authApi.verify2FASetup).toHaveBeenNthCalledWith(1, '123456', 'first-token');
    expect(authApi.verify2FASetup).toHaveBeenNthCalledWith(2, '123456', 'fresh-token');
    expect(await screen.findByRole('heading', { name: 'Backup codes' })).toBeTruthy();
  });

  it('stops after a second expired token and leaves the setup visible', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockRejectedValue(expiredReauth);
    authApi.submitReauth.mockResolvedValueOnce({ token: 'first-token' }).mockResolvedValueOnce({ token: 'fresh-token' });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await completeReauth();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await completeReauth();
    expect(authApi.verify2FASetup).toHaveBeenCalledTimes(2);
    expect(authApi.setup2FA).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Re-authenticate' })).toBeNull();
    expect(await screen.findByText('setup-secret')).toBeTruthy();
    expect(await screen.findByText('Re-authentication required')).toBeTruthy();
  });

  it('enables 2FA for a passwordless account using the emailed link', async () => {
    useAuthStore.setState({ user: { ...user, auth_methods: ['oidc'], primary_auth: 'oidc' } });
    authApi.submitReauth.mockResolvedValue({ token: null, method: 'magic_link' });
    authApi.verifyReauthMagicLink.mockResolvedValue({ token: 'magic-reauth-token', method: 'magic_link' });
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    expect(within(dialog).queryByLabelText('Password')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send link' }));
    await waitFor(() => expect(authApi.submitReauth).toHaveBeenCalledWith('', 'magic_link'));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Email link' }), { target: { value: 'https://www.ai.market/auth/verify?token=email-token&purpose=reauth' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(authApi.verifyReauthMagicLink).toHaveBeenCalledWith('email-token'));
    expect(await screen.findByText('setup-secret')).toBeTruthy();
    expect(authApi.setup2FA).toHaveBeenCalledWith('magic-reauth-token');
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await waitFor(() => expect(authApi.verify2FASetup).toHaveBeenCalledWith('123456', 'magic-reauth-token'));
    expect(await screen.findByRole('heading', { name: 'Backup codes' })).toBeTruthy();
  });

  it.each([
    ['disable', 'Disable 2FA', 'Confirm disable'],
    ['regenerate', 'Regenerate backup codes', 'Generate new codes'],
  ] as const)(
    'focuses the stable Settings heading after successful %s removes the modal opener',
    async (action, actionLabel, confirmLabel) => {
      useAuthStore.setState({ user: { ...user, totp_enabled: true } });
      authApi.disable2FA.mockResolvedValue({ message: '2FA disabled' });
      authApi.regenerateBackupCodes.mockResolvedValue({
        backup_codes: ['backup-one', 'backup-two'],
      });
      render(<SettingsPage />);

      fireEvent.click(screen.getByRole('button', { name: actionLabel }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Current TOTP code' }), {
        target: { value: '123456' },
      });
      const opener = screen.getByRole('button', { name: confirmLabel });
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
      const reauthCode = screen.getByRole('textbox', { name: 'Verification code' });
      fireEvent.change(reauthCode, { target: { value: '654321' } });
      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await waitFor(() =>
        expect((continueButton as HTMLButtonElement).disabled).toBe(false)
      );

      await act(async () => {
        fireEvent.click(continueButton);
      });

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const fallback = screen.getByRole('heading', { name: 'Settings', level: 1 });
      await waitFor(() => expect(document.activeElement).toBe(fallback));
      expect(dialog.isConnected).toBe(false);
      expect(opener.isConnected).toBe(false);
      expect(fallback.isConnected).toBe(true);
      expect(fallback).not.toBe(document.body);
      expect(fallback.closest('[role="dialog"]')).toBeNull();
      expect(fallback.hidden).toBe(false);
      expect(fallback.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
      expect(fallback.getAttribute('tabindex')).toBe('-1');
      expect(authApi[action === 'disable' ? 'disable2FA' : 'regenerateBackupCodes'])
        .toHaveBeenCalledWith('fresh-settings-token', '123456');
    }
  );
});


describe('Company settings enrollment', () => {
  beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ user, token: 'session', refreshAuth: vi.fn().mockResolvedValue(undefined) }); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });
it('shows only the new server-eligible passwordless company enrollment and preserves legacy APIs', async () => {
  useAuthStore.setState({ user: { ...user, auth_methods: ['oidc'], sso_enforced: true, two_factor_setup_eligible: true,
    seller_binding_factor_readiness: { code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED', path: '/dashboard/settings' } } });
  authApi.companySetup.mockResolvedValue({ secret: 'COMPANYSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 });
  render(<SettingsPage />);
  expect(screen.queryByRole('button', { name: 'Enable two-factor authentication' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Set up company authenticator' }));
  await screen.findByText('COMPANYSECRET');
  expect(authApi.setup2FA).not.toHaveBeenCalled(); expect(authApi.submitReauth).not.toHaveBeenCalled();
});
it('does not offer company setup when readiness is present but the enrollment flag is off', async () => {
  useAuthStore.setState({ user: { ...user, auth_methods: ['oidc'], sso_enforced: true, two_factor_setup_eligible: false,
    two_factor_setup_reason: 'two_factor_managed_by_sso', seller_binding_factor_readiness: { code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED', path: '/dashboard/settings' } } });
  render(<SettingsPage />);
  expect(screen.queryByRole('button', { name: 'Set up company authenticator' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enable two-factor authentication' })).toBeNull();
  expect(authApi.companySetup).not.toHaveBeenCalled();
});

it('preserves password-bearing enforced-company flag-off setup request shapes', async () => {
  useAuthStore.setState({ user: { ...user, sso_enforced: true, two_factor_setup_eligible: true,
    seller_binding_factor_readiness: { code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED', path: '/dashboard/settings' } } });
  authApi.setup2FA.mockResolvedValue({ secret: 'LEGACY', qr_uri: 'otpauth://fixture', expires_in: 600 });
  authApi.submitReauth.mockResolvedValue({ token: 'legacy-proof' });
  render(<SettingsPage />);
  expect(screen.queryByRole('button', { name: 'Set up company authenticator' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(authApi.setup2FA).toHaveBeenCalledExactlyOnceWith('legacy-proof'));
  expect(authApi.companySetup).not.toHaveBeenCalled();
});
it('switches password-bearing users to strict company setup only on backend CSRF refusal', async () => {
  useAuthStore.setState({ user: { ...user, sso_enforced: true, two_factor_setup_eligible: true } });
  authApi.setup2FA.mockRejectedValueOnce(Object.assign(new AxiosError('csrf'), { response: { status: 403, data: { detail: 'CSRF_REQUIRED' } } }));
  authApi.submitReauth.mockResolvedValue({ token: 'legacy-proof' });
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Set up company authenticator' });
  expect(authApi.companySetup).not.toHaveBeenCalled();
});

it('recovers an enrolled company authenticator and re-enrolls with the retained company session', async () => {
  const company = { ...user, sso_enforced: true, auth_methods: ['oidc'], totp_enabled: true, two_factor_setup_eligible: false };
  useAuthStore.setState({ user: company, refreshAuth: vi.fn().mockImplementation(async () => {
    useAuthStore.setState({ token: 'refreshed-after-disable', user: { ...company, totp_enabled: false, two_factor_setup_eligible: true,
      seller_binding_factor_readiness: { code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED', path: '/dashboard/settings' } } });
  }) });
  authApi.companyRecover.mockResolvedValue({ message: '2FA disabled' });
  authApi.companySetup.mockResolvedValue({ secret: 'NEWSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 });
  authApi.companyVerify.mockResolvedValue({ backup_codes: ['new-backup'] });
  render(<SettingsPage />);
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'old-backup' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Set up company authenticator' }));
  await screen.findByText('NEWSECRET');
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
  await screen.findByText('new-backup');
  expect(authApi.companyRecover).toHaveBeenCalledExactlyOnceWith('old-backup');
  expect(authApi.companyVerify).toHaveBeenCalledExactlyOnceWith('654321');
  expect(authApi.disable2FA).not.toHaveBeenCalled(); expect(authApi.submitReauth).not.toHaveBeenCalled();
});

it.each([
  { methods: ['password', 'oidc'], route: 'popup' }, { methods: ['oidc'], route: 'popup' },
  { methods: ['password', 'oidc'], route: 'external check' }, { methods: ['oidc'], route: 'external check' },
])('stale $route company Settings session $methods refreshes eligibility before reaching QR setup and readiness continuation', async ({ methods, route }) => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  const path = `/confirm/11111111-1111-4111-8111-111111111111?t=${'a'.repeat(42)}A`;
  window.history.replaceState(null, '', `/dashboard/settings?redirect=${encodeURIComponent(path)}#security`);
  const company: User = { ...user, auth_methods: methods, sso_enforced: true, two_factor_setup_eligible: false,
    two_factor_setup_reason: 'two_factor_managed_by_sso',
    seller_binding_factor_readiness: { code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED', path: '/dashboard/settings' } };
  useAuthStore.setState({ user: company });
  const refresh = vi.fn().mockImplementation(async () => { useAuthStore.setState({ token: 'fresh-company' }); });
  useAuthStore.setState({ refreshAuth: refresh });
  authApi.getMe.mockResolvedValue({ ...company, two_factor_setup_eligible: true });
  authApi.companySetup.mockImplementation(async () => {
    expect(authApi.getMe).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().user?.two_factor_setup_eligible).toBe(true);
    return { secret: 'FRESHSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 };
  });
  authApi.companyVerify.mockResolvedValue({ backup_codes: ['new-backup'] });
  render(<SettingsPage />);
  expect(screen.getByLabelText('Company sign-in ID')).toBeTruthy();
  expect(authApi.companySetup).not.toHaveBeenCalled();
  if (route === 'popup') {
    companySignIn.start.mockImplementation(() => checkCompanySignIn());
    fireEvent.change(screen.getByLabelText('Company sign-in ID'), { target: { value: 'company-id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in through your company' }));
  } else fireEvent.click(screen.getByRole('button', { name: 'Check company sign-in' }));
  await screen.findByText('FRESHSECRET');
  if (route === 'popup') expect(companySignIn.start).toHaveBeenCalledExactlyOnceWith('company-id', '/dashboard/settings');
  expect(refresh).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
  await screen.findByText('new-backup');
  expect(navigation.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'I saved my backup codes' }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(path));
  expect(authApi.setup2FA).not.toHaveBeenCalled(); expect(authApi.submitReauth).not.toHaveBeenCalled();
});
it('flag-on company sign-in cannot enroll while refreshed server eligibility stays false', async () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  const company = { ...user, auth_methods: ['oidc'], sso_enforced: true, two_factor_setup_eligible: false };
  useAuthStore.setState({ user: company }); authApi.getMe.mockResolvedValue(company);
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Check company sign-in' }));
  await screen.findByText('Sign in again through your company, then restart setup.');
  expect(authApi.companySetup).not.toHaveBeenCalled();
});

});
