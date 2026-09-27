// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import axios from 'axios';
import SettingsPage from './page';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';

const authApi = vi.hoisted(() => ({
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

vi.mock('@/api/auth', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/auth')>(), ...authApi }));
vi.mock('@/api/capabilities', () => capabilitiesApi);
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
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
    cleanup();
    vi.clearAllMocks();
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
    expect(screen.getByText('setup-secret')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await waitFor(() => expect(authApi.verify2FASetup).toHaveBeenCalledWith('123456', 'fresh-settings-token'));
    expect(screen.getByRole('heading', { name: 'Backup codes' })).toBeTruthy();
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
    expect(screen.getByRole('heading', { name: 'Backup codes' })).toBeTruthy();
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
    expect(screen.getByText('setup-secret')).toBeTruthy();
    expect(screen.getByText('Re-authentication required')).toBeTruthy();
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
