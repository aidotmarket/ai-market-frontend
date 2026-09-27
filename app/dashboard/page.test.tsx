// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import axios from 'axios';
import DashboardOverview from './page';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';

const connectApi = vi.hoisted(() => ({
  getConnectStatus: vi.fn(),
  getConnectOnboarding: vi.fn(),
  isConnectOnboardingTwoFactorRequired: vi.fn(),
  redirectToConnectOnboarding: vi.fn(),
}));

const authApi = vi.hoisted(() => ({
  setup2FA: vi.fn(),
  submitReauth: vi.fn(),
  verifyReauthMagicLink: vi.fn(),
  verify2FASetup: vi.fn(),
}));

const sellerApi = vi.hoisted(() => ({
  getSellerStats: vi.fn(),
}));

const listingsApi = vi.hoisted(() => ({
  getMyListings: vi.fn(),
}));

const ordersApi = vi.hoisted(() => ({
  getMyOrders: vi.fn(),
}));

const capabilitiesApi = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  requestSellerCapability: vi.fn(),
}));

vi.mock('@/api/connect', () => connectApi);
vi.mock('@/api/auth', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/auth')>(), ...authApi }));
vi.mock('@/api/seller', () => sellerApi);
vi.mock('@/api/listings', () => listingsApi);
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/capabilities', () => capabilitiesApi);
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({
  notifyCapabilitiesChanged: vi.fn(),
}));
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const baseUser: User = {
  id: 'user-1',
  email: 'seller@example.com',
  first_name: 'Seller',
  last_name: null,
  company_name: 'Seller Co',
  role: 'buyer',
  status: 'active',
  created_at: '2026-06-17T00:00:00Z',
  email_verified_at: '2026-06-17T00:00:00Z',
  totp_enabled: false,
  auth_methods: ['password'],
  primary_auth: 'password',
};

const buyerOrder = {
  id: 'order-12345678',
  listing_id: 'listing-1',
  listing_title: 'Climate Dataset',
  seller_name: 'Data Seller',
  amount: 25,
  status: 'fulfilled' as const,
  created_at: '2026-08-14T00:00:00Z',
  updated_at: null,
};

const sellerStats = {
  period: '30d',
  total_listings: 2,
  total_views: 12,
  total_inquiries: 4,
  total_sales: 3,
  period_sales: 2,
  period_revenue_cents: 4550,
  period_revenue_display: '$45.50',
  pending_fulfillments: 2,
  conversion_rate: 75,
};

describe('DashboardOverview seller setup 2FA state', () => {
  const realRefreshAuth = useAuthStore.getState().refreshAuth;
  const refreshAuth = vi.fn();
  const completeReauth = async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: '654321' },
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
    authApi.submitReauth.mockResolvedValue({ token: 'dashboard-token' });
    capabilitiesApi.getCapabilities.mockResolvedValue({
      buyer: { persisted_status: 'active', effective_status: 'active', missing_steps: [], reason: null },
      seller: {
        persisted_status: 'provisioning',
        effective_status: 'provisioning',
        missing_steps: ['totp_enabled', 'stripe_payouts_live'],
        reason: null,
      },
      next_action: { capability: 'seller', step: 'totp_enabled' },
    });
    ordersApi.getMyOrders.mockResolvedValue([]);
    useAuthStore.setState({
      user: baseUser,
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

  it('renders provisioning seller setup from capability state alone', async () => {
    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByText('Enable authenticator-app verification before connecting payouts.')).not.toBeNull();
    });

    expect(screen.queryByText('Two-factor authentication is enabled.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enable 2FA' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Connect Stripe' }).hasAttribute('disabled')).toBe(true);
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledOnce();
    expect(connectApi.getConnectStatus).not.toHaveBeenCalled();
    expect(sellerApi.getSellerStats).not.toHaveBeenCalled();
    expect(listingsApi.getMyListings).not.toHaveBeenCalled();
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });

  it('reauthenticates before setup and uses the same token for verification', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
    expect(authApi.setup2FA).not.toHaveBeenCalled();
    expect(screen.queryByText('setup-secret')).toBeNull();
    await completeReauth();
    expect(authApi.setup2FA).toHaveBeenCalledWith('dashboard-token');
    expect(screen.getByText('setup-secret')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    await waitFor(() => expect(authApi.verify2FASetup).toHaveBeenCalledWith('123456', 'dashboard-token'));
    expect(await screen.findByRole('heading', { name: 'Backup codes' })).toBeTruthy();
  });

  it('shows the SSO managed message without offering setup', async () => {
    useAuthStore.setState({ user: { ...baseUser, auth_methods: ['magic_link'], primary_auth: 'magic_link', sso_enforced: true } });
    render(<DashboardOverview />);
    expect(await screen.findByText("Two-factor authentication for your account is managed by your organization's single sign-on.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable 2FA' })).toBeNull();
    expect(authApi.submitReauth).not.toHaveBeenCalled();
  });

  it('shows the SSO managed message returned by setup', async () => {
    authApi.setup2FA.mockRejectedValueOnce(Object.assign(new AxiosError('SSO'), {
      response: { status: 409, data: { detail: 'two_factor_managed_by_sso' } },
    }));
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
    await completeReauth();
    expect(await screen.findByText("Two-factor authentication for your account is managed by your organization's single sign-on.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable 2FA' })).toBeNull();
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
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
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
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
    const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(authApi.setup2FA).not.toHaveBeenCalled();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();
    expect(screen.getByText('Enable authenticator-app verification before connecting payouts.')).toBeTruthy();
  });

  it('reauthenticates once after expiry and retries verification without restarting setup', async () => {
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockRejectedValueOnce(expiredReauth).mockResolvedValueOnce({ backup_codes: ['backup-one'] });
    authApi.submitReauth.mockResolvedValueOnce({ token: 'first-token' }).mockResolvedValueOnce({ token: 'fresh-token' });
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
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
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
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
    useAuthStore.setState({ user: { ...baseUser, auth_methods: ['magic_link'], primary_auth: 'magic_link' } });
    authApi.submitReauth.mockResolvedValue({ token: null, method: 'magic_link' });
    authApi.verifyReauthMagicLink.mockResolvedValue({ token: 'magic-reauth-token', method: 'magic_link' });
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
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

  it('renders active seller stats from the real contract shape', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({
      buyer: { persisted_status: 'active', effective_status: 'active', missing_steps: [], reason: null },
      seller: {
        persisted_status: 'active',
        effective_status: 'active',
        missing_steps: [],
        reason: null,
      },
      next_action: null,
    });
    connectApi.getConnectStatus.mockResolvedValue({
      data: { details_submitted: true, payouts_enabled: true },
    });
    sellerApi.getSellerStats.mockResolvedValue({
      data: sellerStats,
    });
    listingsApi.getMyListings.mockResolvedValue({ data: [] });

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByText("Here's what's happening with your store today.")).not.toBeNull();
    });

    expect(screen.getByText('12')).not.toBeNull();
    expect(screen.getByText('3')).not.toBeNull();
    expect(screen.getByText('$45.50')).not.toBeNull();
    expect(screen.getByText('Revenue (30 days)')).not.toBeNull();
    expect(screen.queryByText('Total Revenue')).toBeNull();
    const salesPointer = screen.getByRole('link', { name: 'Sales awaiting delivery' });
    expect(salesPointer.getAttribute('href')).toBe('/dashboard/sales?status=pending_delivery');
    expect(salesPointer.textContent).toContain('2');
    expect(screen.queryByText('Finish seller setup')).toBeNull();
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledOnce();
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    expect(sellerApi.getSellerStats).toHaveBeenCalledOnce();
    expect(listingsApi.getMyListings).toHaveBeenCalledOnce();
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading', { name: 'Your purchases' })).toBeNull();
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
  });

  it('renders purchases and order rows for an active seller', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({
      buyer: { persisted_status: 'active', effective_status: 'active', missing_steps: [], reason: null },
      seller: {
        persisted_status: 'active',
        effective_status: 'active',
        missing_steps: [],
        reason: null,
      },
      next_action: null,
    });
    connectApi.getConnectStatus.mockResolvedValue({
      data: { details_submitted: true, payouts_enabled: true },
    });
    sellerApi.getSellerStats.mockResolvedValue({
      data: sellerStats,
    });
    listingsApi.getMyListings.mockResolvedValue({ data: [] });
    ordersApi.getMyOrders.mockResolvedValue([buyerOrder]);

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Your purchases' })).not.toBeNull();
    });

    expect(screen.getByText('Climate Dataset')).not.toBeNull();
    expect(screen.getByText('Fulfilled')).not.toBeNull();
    expect(screen.getByText('$25.00')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'View all orders' }).getAttribute('href')).toBe('/dashboard/orders');
    expect(screen.getByRole('link', { name: 'Sales awaiting delivery' }).getAttribute('href')).toBe('/dashboard/sales?status=pending_delivery');
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
  });

  it('renders purchases for a provisioning seller', async () => {
    ordersApi.getMyOrders.mockResolvedValue([buyerOrder]);

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Your purchases' })).not.toBeNull();
    });

    expect(screen.getByText('Climate Dataset')).not.toBeNull();
    expect(screen.getByText('Finish seller setup')).not.toBeNull();
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });

  it('renders purchases first and an explicit empty state for a buyer', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({
      buyer: { persisted_status: 'active', effective_status: 'active', missing_steps: [], reason: null },
      seller: {
        persisted_status: 'not_requested',
        effective_status: 'not_requested',
        missing_steps: [],
        reason: null,
      },
      next_action: null,
    });
    ordersApi.getMyOrders.mockResolvedValue([]);

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Your purchases' })).not.toBeNull();
    });

    expect(screen.getByText("You haven't bought anything yet")).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Browse data' }).getAttribute('href')).toBe('/find-data');
    expect(screen.getByRole('heading', { name: 'Interested in selling on AI Market?' })).not.toBeNull();
    expect(screen.queryByText('Finish seller setup')).toBeNull();
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
    expect(sellerApi.getSellerStats).not.toHaveBeenCalled();
  });

  it('summarizes recent buyer orders with status and an orders entry point', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({
      buyer: { persisted_status: 'active', effective_status: 'active', missing_steps: [], reason: null },
      seller: {
        persisted_status: 'inactive',
        effective_status: 'inactive',
        missing_steps: [],
        reason: null,
      },
      next_action: null,
    });
    ordersApi.getMyOrders.mockResolvedValue([buyerOrder]);

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByText('Climate Dataset')).not.toBeNull();
    });

    expect(screen.getByText('Fulfilled')).not.toBeNull();
    expect(screen.getByText('$25.00')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'View all orders' }).getAttribute('href')).toBe('/dashboard/orders');
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
  });

  it('keeps active seller dashboard content when purchases fail to load', async () => {
    const purchaseError = new Error('orders unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    capabilitiesApi.getCapabilities.mockResolvedValue({
      buyer: { persisted_status: 'active', effective_status: 'active', missing_steps: [], reason: null },
      seller: {
        persisted_status: 'active',
        effective_status: 'active',
        missing_steps: [],
        reason: null,
      },
      next_action: null,
    });
    connectApi.getConnectStatus.mockResolvedValue({
      data: { details_submitted: true, payouts_enabled: true },
    });
    sellerApi.getSellerStats.mockResolvedValue({
      data: sellerStats,
    });
    listingsApi.getMyListings.mockResolvedValue({ data: [] });
    ordersApi.getMyOrders.mockRejectedValue(purchaseError);

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByText("Here's what's happening with your store today.")).not.toBeNull();
    });

    expect(screen.queryByText('Failed to load dashboard data.')).toBeNull();
    expect(screen.getByText('Total Views')).not.toBeNull();
    expect(screen.getByText('12')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Sales awaiting delivery' }).textContent).toContain('2');
    expect(screen.queryByRole('heading', { name: 'Your purchases' })).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('Failed to fetch dashboard purchase data', purchaseError);
  });

  it('renders zero Sales awaiting delivery from the real contract shape', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({
      buyer: { persisted_status: 'active', effective_status: 'active', missing_steps: [], reason: null },
      seller: {
        persisted_status: 'active',
        effective_status: 'active',
        missing_steps: [],
        reason: null,
      },
      next_action: null,
    });
    connectApi.getConnectStatus.mockResolvedValue({
      data: { details_submitted: true, payouts_enabled: true },
    });
    sellerApi.getSellerStats.mockResolvedValue({
      data: { ...sellerStats, pending_fulfillments: 0 },
    });
    listingsApi.getMyListings.mockResolvedValue({ data: [] });

    render(<DashboardOverview />);

    const salesPointer = await screen.findByRole('link', { name: 'Sales awaiting delivery' });
    expect(salesPointer.getAttribute('href')).toBe('/dashboard/sales?status=pending_delivery');
    expect(salesPointer.textContent).toContain('0');
  });
});
