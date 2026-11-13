// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import axios from 'axios';
import SettingsPage from './page';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { getConnectorGrants, getConnectorStatus } from '@/api/connector-oauth';
import { getSellerPublicProfile } from '@/api/sellerProfile';

vi.mock('@/api/sellerProfile', async (original) => ({ ...await original<typeof import('@/api/sellerProfile')>(),
  getSellerPublicProfile: vi.fn(), updateSellerPublicProfile: vi.fn(),
}));

const authApi = vi.hoisted(() => ({
  getMe: vi.fn(), companySetup: vi.fn(), companyVerify: vi.fn(), companyRecover: vi.fn(),
  disable2FA: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  setup2FA: vi.fn(),
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

  it('offers public business name settings to sellers without repurposing Company name', async () => {
    render(<SettingsPage />);
    expect(await screen.findByLabelText('Public business name')).toBeTruthy();
    expect(screen.getByLabelText('Company name')).toBeTruthy();
    await waitFor(() => expect(vi.mocked(getSellerPublicProfile)).toHaveBeenCalled());
  });

  it.each([
    ['active', 'buyer', 'Seller'],
    ['provisioning', 'buyer', 'Seller (setting up)'],
    ['not_requested', 'admin', 'Admin'],
    ['not_requested', 'buyer', 'Buyer'],
    ['active', 'admin', 'Seller'],
  ] as const)('displays account type for seller status %s and legacy role %s', async (status, role, label) => {
    capabilitiesApi.getCapabilities.mockResolvedValue({ seller: { effective_status: status } });
    useAuthStore.setState({ user: { ...user, role } });
    render(<SettingsPage />);
    const account = screen.getByRole('heading', { name: 'Account' }).closest('section')!;
    await waitFor(() => expect(within(account).getByText('Role').nextElementSibling?.textContent).toBe(label));
  });

  it('never shows Buyer while capabilities are loading', async () => {
    capabilitiesApi.getCapabilities.mockReturnValue(new Promise(() => {}));
    useAuthStore.setState({ user: { ...user, role: 'buyer' } });
    render(<SettingsPage />);
    const account = screen.getByRole('heading', { name: 'Account' }).closest('section')!;
    await waitFor(() => expect(capabilitiesApi.getCapabilities).toHaveBeenCalled());
    expect(within(account).getByText('Role').nextElementSibling?.textContent).toBe('Checking…');
  });

  it('offers a retry instead of Buyer when capabilities fail, then shows Seller', async () => {
    capabilitiesApi.getCapabilities
      .mockRejectedValueOnce(new Error('capabilities unavailable'))
      .mockResolvedValueOnce({ seller: { effective_status: 'active' } });
    useAuthStore.setState({ user: { ...user, role: 'buyer' } });
    render(<SettingsPage />);
    const account = screen.getByRole('heading', { name: 'Account' }).closest('section')!;
    const retry = await within(account).findByRole('button', { name: 'Try again' });
    expect(within(account).queryByText('Buyer')).toBeNull();
    fireEvent.click(retry);
    await waitFor(() => expect(within(account).getByText('Role').nextElementSibling?.textContent).toBe('Seller'));
  });

  it('keeps public business name settings absent for buyers', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({ seller: { effective_status: 'not_requested' } });
    useAuthStore.setState({ user: { ...user, role: 'buyer' } });
    render(<SettingsPage />);
    await waitFor(() => expect(capabilitiesApi.getCapabilities).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('Public business name')).toBeNull());
    expect(getSellerPublicProfile).not.toHaveBeenCalled();
  });

  it.each(['buyer', 'seller'] as const)('makes Marketplace wallet findable for a %s without seller activation', async role => {
    useAuthStore.setState({ user: { ...user, role } });
    capabilitiesApi.getCapabilities.mockResolvedValue({ seller: { effective_status: 'inactive' } });
    render(<SettingsPage />);
    expect(screen.getByRole('link', { name: 'Marketplace wallet' }).getAttribute('href')).toBe('/dashboard/settings/wallet');
    await waitFor(() => expect(capabilitiesApi.getCapabilities).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Marketplace wallet' })).toBeTruthy();
  });


  beforeEach(() => {
    vi.mocked(getSellerPublicProfile).mockResolvedValue({ public_display_name: null, show_public_display_name: false });
    window.history.replaceState(null, '', '/dashboard/settings');
    vi.mocked(getConnectorStatus).mockResolvedValue(false);
    vi.mocked(getConnectorGrants).mockResolvedValue([]);
    refreshAuth.mockResolvedValue(undefined);
    authApi.updateProfile.mockResolvedValue(undefined);
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
      seller_two_factor_satisfied:true}});
    render(<SettingsPage/>);
    expect(screen.getByText(`Sign-in security is managed by your ${provider==='google'?'Google':'GitHub'} account.`)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Enable two-factor authentication'})).toBeNull();
    expect(authApi.setup2FA).not.toHaveBeenCalled();
  });

  it('disables an existing native authenticator during provider sign-in without a challenge', async () => {
    useAuthStore.setState({ user: { ...user, totp_enabled: true, two_factor_provider: 'google' } });
    authApi.disable2FA.mockResolvedValue({ message: '2FA disabled', access_token: 'replacement', token_type: 'bearer' });
    authApi.getMe.mockResolvedValue({ ...user, totp_enabled: false });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }));
    await waitFor(() => expect(authApi.disable2FA).toHaveBeenCalledExactlyOnceWith());

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('handles a provider 409 on an older server snapshot without leaving enrollment controls',async()=>{
    authApi.setup2FA.mockRejectedValueOnce(Object.assign(new AxiosError('policy'),{response:{status:409,data:{detail:'two_factor_managed_by_provider'}}}));
    render(<SettingsPage/>);fireEvent.click(screen.getByRole('button',{name:'Enable two-factor authentication'}));
    await screen.findByText('Sign-in security is managed by your identity provider account.');
    expect(screen.queryByRole('button',{name:'Enable two-factor authentication'})).toBeNull();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();
  });

  it('refuses verification and hides a pending native enrollment when current policy changes',async()=>{
    authApi.setup2FA.mockResolvedValueOnce({secret:'fixture-secret',qr_uri:'otpauth://totp/fixture',expires_in:300});
    render(<SettingsPage/>);fireEvent.click(screen.getByRole('button',{name:'Enable two-factor authentication'}));await screen.findByRole('textbox', { name: '6-digit code' });
    await screen.findByText('Set up your authenticator app');
    act(()=>useAuthStore.setState({user:{...user,two_factor_setup_eligible:false,two_factor_setup_reason:'two_factor_managed_by_provider',two_factor_provider:'github'}}));
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

  it('starts setup in one click and verifies only the newly scanned secret', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await screen.findByRole('textbox', { name: '6-digit code' });
    expect(authApi.setup2FA).toHaveBeenCalledWith();
    expect(await screen.findByText('setup-secret')).toBeTruthy();
    expect((await screen.findByRole('img', { name: 'QR code for two-factor authentication setup' })).getAttribute('src'))
      .toMatch(/^data:image\/png;base64,/);

    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await waitFor(() => expect(authApi.verify2FASetup).toHaveBeenCalledWith('123456'));
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
    await screen.findByRole('textbox', { name: '6-digit code' });
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

  });

  it('shows the SSO managed message returned by setup', async () => {
    authApi.setup2FA.mockRejectedValueOnce(Object.assign(new AxiosError('SSO'), {
      response: { status: 409, data: { detail: 'two_factor_managed_by_sso' } },
    }));
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
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
    await screen.findByRole('textbox', { name: '6-digit code' });
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

  it('cancels enrollment without enabling 2FA', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await screen.findByRole('textbox', { name: '6-digit code' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(authApi.setup2FA).toHaveBeenCalledWith();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();
    expect(screen.getByText('2FA Disabled')).toBeTruthy();
  });

  it('keeps enrollment visible after an invalid new-secret code without a reauthentication prompt', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockRejectedValueOnce(Object.assign(new AxiosError('invalid'), {
      response: { status: 400, data: { detail: 'Invalid verification code' } },
    }));
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    fireEvent.change(await screen.findByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    expect(await screen.findByText('Invalid verification code')).toBeTruthy();
    expect(screen.getByText('setup-secret')).toBeTruthy();
    expect(authApi.verify2FASetup).toHaveBeenCalledExactlyOnceWith('123456');

    expect(screen.queryByRole('dialog', { name: 'Re-authenticate' })).toBeNull();
  });

  it('enables 2FA for a passwordless account without an email challenge', async () => {
    useAuthStore.setState({ user: { ...user, auth_methods: ['oidc'], primary_auth: 'oidc' } });
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    expect(screen.queryByRole('dialog', { name: 'Re-authenticate' })).toBeNull();

    expect(authApi.verifyReauthMagicLink).not.toHaveBeenCalled();
    expect(await screen.findByText('setup-secret')).toBeTruthy();
    expect(authApi.setup2FA).toHaveBeenCalledWith();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await waitFor(() => expect(authApi.verify2FASetup).toHaveBeenCalledWith('123456'));
    expect(await screen.findByRole('heading', { name: 'Backup codes' })).toBeTruthy();
  });

  it.each(['FIRST_PARTY_SESSION_REQUIRED', 'CSRF_REQUIRED', 'BAD_ORIGIN'])('shows a refresh instruction after disable refuses %s', async detail => {
    useAuthStore.setState({ user: { ...user, totp_enabled: true } });
    authApi.disable2FA.mockRejectedValueOnce(Object.assign(new AxiosError('refused'), {
      response: { status: 403, data: { detail } },
    }));
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }));
    await screen.findByText('Please refresh the page and try again.');
    expect(screen.queryByText(detail)).toBeNull();
  });

  it('disables then sets up again with replacement credentials and no login navigation', async () => {
    useAuthStore.setState({ user: { ...user, totp_enabled: true }, refreshAuth: realRefreshAuth });
    const refreshRequest = vi.spyOn(axios, 'post').mockRejectedValue(new Error('Unexpected refresh'));
    authApi.disable2FA.mockResolvedValue({ message: '2FA disabled', access_token: 'replacement', token_type: 'bearer' });
    authApi.getMe.mockImplementation(async () => {
      expect(useAuthStore.getState().token).toBe('replacement');
      return { ...user, totp_enabled: false };
    });
    authApi.setup2FA.mockImplementation(async () => {
      expect(useAuthStore.getState().token).toBe('replacement');
      return { secret: 'NEWSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 };
    });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enable two-factor authentication' }));
    await screen.findByText('NEWSECRET');
    expect(refreshRequest).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/dashboard/settings');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    refreshRequest.mockRestore();
  });

  it.each([
    ['disable2FA', 'Disable 2FA'],
    ['regenerateBackupCodes', 'Regenerate backup codes'],
  ] as const)('completes %s in one click without a code or reauthentication', async (method, label) => {
    useAuthStore.setState({ user: { ...user, totp_enabled: true } });
    authApi.disable2FA.mockResolvedValue({ message: '2FA disabled', access_token: 'replacement', token_type: 'bearer' });
    authApi.getMe.mockResolvedValue({ ...user, totp_enabled: false });
    authApi.regenerateBackupCodes.mockResolvedValue({ backup_codes: ['backup-one', 'backup-two'] });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(authApi[method]).toHaveBeenCalledExactlyOnceWith());
    if (method === 'disable2FA') {
      await waitFor(() => expect(useAuthStore.getState().token).toBe('replacement'));
      expect(refreshAuth).not.toHaveBeenCalled();
    }
    else expect(await screen.findByText('backup-one')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Current TOTP code' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Re-authenticate' })).toBeNull();

  });
});

describe('Company settings enrollment', () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, '', '/dashboard/settings'); useAuthStore.setState({ user, token: 'session', refreshAuth: vi.fn().mockResolvedValue(undefined) }); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });
it('shows only the new server-eligible passwordless company enrollment and preserves legacy APIs', async () => {
  useAuthStore.setState({ user: { ...user, auth_methods: ['oidc'], sso_enforced: true, two_factor_setup_eligible: true } });
  authApi.companySetup.mockResolvedValue({ secret: 'COMPANYSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 });
  render(<SettingsPage />);
  expect(screen.queryByRole('button', { name: 'Enable two-factor authentication' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Set up company authenticator' }));
  await screen.findByText('COMPANYSECRET');
  expect(authApi.setup2FA).not.toHaveBeenCalled();
});
it('does not offer company setup without server eligibility', async () => {
  useAuthStore.setState({ user: { ...user, auth_methods: ['oidc'], sso_enforced: true, two_factor_setup_eligible: false,
    two_factor_setup_reason: 'two_factor_managed_by_sso' } });
  render(<SettingsPage />);
  expect(screen.queryByRole('button', { name: 'Set up company authenticator' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enable two-factor authentication' })).toBeNull();
  expect(authApi.companySetup).not.toHaveBeenCalled();
});

it('starts password-bearing company setup without reauthentication', async () => {
  useAuthStore.setState({ user: { ...user, sso_enforced: true, two_factor_setup_eligible: true } });
  authApi.setup2FA.mockResolvedValue({ secret: 'LEGACY', qr_uri: 'otpauth://fixture', expires_in: 600 });
  render(<SettingsPage />);
  expect(screen.queryByRole('button', { name: 'Set up company authenticator' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
  await waitFor(() => expect(authApi.setup2FA).toHaveBeenCalledExactlyOnceWith());
  expect(authApi.companySetup).not.toHaveBeenCalled();
});
it('recovers an enrolled company authenticator and re-enrolls with the retained company session', async () => {
  const company = { ...user, sso_enforced: true, auth_methods: ['oidc'], totp_enabled: true, two_factor_setup_eligible: false };
  useAuthStore.setState({ user: company });
  authApi.getMe.mockImplementation(async () => {
    expect(useAuthStore.getState().token).toBe('company-replacement');
    return { ...company, totp_enabled: false, two_factor_setup_eligible: true };
  });
  authApi.companyRecover.mockResolvedValue({ message: '2FA disabled', access_token: 'company-replacement', token_type: 'bearer' });
  authApi.companySetup.mockImplementation(async () => {
    expect(useAuthStore.getState().token).toBe('company-replacement');
    return { secret: 'NEWSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 };
  });
  authApi.companyVerify.mockResolvedValue({ backup_codes: ['new-backup'] });
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Set up company authenticator' }));
  await screen.findByText('NEWSECRET');
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
  await screen.findByText('new-backup');
  expect(authApi.companyRecover).toHaveBeenCalledExactlyOnceWith();
  expect(navigation.push).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/dashboard/settings');
  expect(useAuthStore.getState().token).toBe('company-replacement');
  expect(useAuthStore.getState().refreshAuth).not.toHaveBeenCalled();
  expect(authApi.companyVerify).toHaveBeenCalledExactlyOnceWith('654321');
  expect(authApi.disable2FA).not.toHaveBeenCalled();
});

it('keeps server-ineligible company setup unavailable without asking for sign-in', () => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  useAuthStore.setState({ user: { ...user, sso_enforced: true, auth_methods: ['oidc'],
    two_factor_setup_eligible: false, two_factor_setup_reason: 'two_factor_managed_by_sso' } });
  render(<SettingsPage />);
  expect(screen.queryByLabelText('Company sign-in ID')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Set up company authenticator' })).toBeNull();
  expect(authApi.companySetup).not.toHaveBeenCalled();
});

});
