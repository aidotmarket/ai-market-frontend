// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';

const authApi = vi.hoisted(() => ({
  disable2FA: vi.fn(),
  regenerateBackupCodes: vi.fn(),
  setup2FA: vi.fn(),
  updateProfile: vi.fn(),
  verify2FASetup: vi.fn(),
}));

const capabilitiesApi = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
}));

const payinApi = vi.hoisted(() => ({
  getDataVerificationPayInReadiness: vi.fn(),
}));

vi.mock('@/api/auth', () => authApi);
vi.mock('@/api/capabilities', () => capabilitiesApi);
vi.mock('@/api/dataVerificationPayin', () => payinApi);
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('./ReauthModal', () => ({
  default: () => null,
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
  const refreshAuth = vi.fn();

  beforeEach(() => {
    refreshAuth.mockResolvedValue(undefined);
    authApi.updateProfile.mockResolvedValue(undefined);
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'provisioning' },
    });
    payinApi.getDataVerificationPayInReadiness.mockResolvedValue({
      version: 'data_verification_payin_readiness_v1',
      state: 'setup_required',
      can_start_setup: true,
      can_replace_payment_method: false,
      message: 'fixed',
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

  it('shows pay-in onboarding when the readiness endpoint is available', async () => {
    let resolveReadiness: ((value: unknown) => void) | undefined;
    payinApi.getDataVerificationPayInReadiness.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReadiness = resolve;
      })
    );

    render(<SettingsPage />);
    expect(
      screen.queryByRole('heading', { name: 'Payment method for verification charges' })
    ).toBeNull();

    resolveReadiness?.({
      version: 'data_verification_payin_readiness_v1',
      state: 'blocked',
      can_start_setup: false,
      can_replace_payment_method: false,
      message: 'ignored',
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Payment method for verification charges',
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Manage payment method' }).getAttribute('href')
    ).toBe('/dashboard/data-verification/payment-method');
  });

  it('hides pay-in onboarding indistinguishably on readiness 404', async () => {
    payinApi.getDataVerificationPayInReadiness.mockRejectedValueOnce({
      response: { status: 404 },
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(payinApi.getDataVerificationPayInReadiness).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByRole('heading', { name: 'Payment method for verification charges' })
    ).toBeNull();
  });

  it('fails safely without details on other readiness errors', async () => {
    payinApi.getDataVerificationPayInReadiness.mockRejectedValueOnce(
      new Error('provider detail must stay hidden')
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(payinApi.getDataVerificationPayInReadiness).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText('provider detail must stay hidden')).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Payment method for verification charges' })
    ).toBeNull();
  });
});
