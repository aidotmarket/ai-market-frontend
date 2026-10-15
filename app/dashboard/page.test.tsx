// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { StrictMode } from 'react';
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
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cG5n') },
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

  it.each(['google','github'] as const)('unlocks Stripe from server current-policy missing steps for %s, without native MFA',async provider=>{
    useAuthStore.setState({user:{...baseUser,two_factor_setup_eligible:false,two_factor_setup_reason:'two_factor_managed_by_provider',
      two_factor_provider:provider,seller_two_factor_satisfied:true,reauth_method:'magic_link'}});
    capabilitiesApi.getCapabilities.mockResolvedValue({seller:{effective_status:'provisioning',missing_steps:['stripe_payouts_live']},next_action:{capability:'seller',step:'stripe_payouts_live'}});
    connectApi.getConnectStatus.mockResolvedValue({data:{details_submitted:false}});sellerApi.getSellerStats.mockResolvedValue({data:sellerStats});listingsApi.getMyListings.mockResolvedValue({data:[]});
    connectApi.getConnectOnboarding.mockResolvedValue({data:{url:'https://connect.stripe.com/synthetic'}});
    render(<DashboardOverview/>);
    const connect=await screen.findByRole('button',{name:'Connect Stripe'});expect((connect as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button',{name:'Enable 2FA'})).toBeNull();
    expect(screen.getByText(`Sign-in security is managed by your ${provider==='google'?'Google':'GitHub'} account.`)).toBeTruthy();
    fireEvent.click(connect);await waitFor(()=>expect(connectApi.getConnectOnboarding).toHaveBeenCalledOnce());
    expect(useAuthStore.getState().user?.totp_enabled).toBe(false);expect(authApi.setup2FA).not.toHaveBeenCalled();
  });

  it('keeps server missing-step refusal when /me assurance is stale',async()=>{
    useAuthStore.setState({user:{...baseUser,seller_two_factor_satisfied:true}});
    connectApi.getConnectStatus.mockResolvedValue({data:{details_submitted:false}});sellerApi.getSellerStats.mockResolvedValue({data:sellerStats});listingsApi.getMyListings.mockResolvedValue({data:[]});
    render(<DashboardOverview/>);const connect=await screen.findByRole('button',{name:'Connect Stripe'});
    expect((connect as HTMLButtonElement).disabled).toBe(true);fireEvent.click(connect);expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
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
    expect(await screen.findByText('setup-secret')).toBeTruthy();
    expect((await screen.findByRole('img', { name: 'QR code for two-factor authentication setup' })).getAttribute('src'))
      .toMatch(/^data:image\/png;base64,/);
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

  it('keeps backup codes visible during Done and refreshes only once on a double click', async () => {
    let rejectRefresh!: (reason?: unknown) => void;
    refreshAuth.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectRefresh = reject;
    }));
    authApi.setup2FA.mockResolvedValue({ secret: 'setup-secret', qr_uri: 'otpauth://example', expires_in: 600 });
    authApi.verify2FASetup.mockResolvedValue({ backup_codes: ['backup-one'] });
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable 2FA' }));
    await completeReauth();
    fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
    expect(await screen.findByText('backup-one')).toBeTruthy();

    const done = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(done);
    fireEvent.click(done);
    expect(refreshAuth).toHaveBeenCalledOnce();
    expect(done.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('backup-one')).toBeTruthy();

    await act(async () => rejectRefresh(new Error('network unavailable')));
    await waitFor(() => expect(screen.queryByText('backup-one')).toBeNull());
    expect(refreshAuth).toHaveBeenCalledOnce();
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
    expect(await screen.findByRole('heading', { name: 'Backup codes' })).toBeTruthy();
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
    expect(await screen.findByText('setup-secret')).toBeTruthy();
    expect(await screen.findByText('Re-authentication required')).toBeTruthy();
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
    expect(screen.getByRole('heading', { name: 'Your purchases' })).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Unable to load your purchase history');
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

describe('dashboard purchase read recovery', () => {
  const unavailable = new Error('purchase GET unavailable');
  const originalAuth = useAuthStore.getState();
  const capability = (status = 'not_requested') => ({
    buyer: { effective_status: 'active', missing_steps: [] },
    seller: { effective_status: status, missing_steps: [] },
    next_action: null,
  });
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const expectOnlyPurchaseRetry = (purchaseCalls: number, sellerCalls = 0) => {
    expect(ordersApi.getMyOrders).toHaveBeenCalledTimes(purchaseCalls);
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledOnce();
    expect(connectApi.getConnectStatus).toHaveBeenCalledTimes(sellerCalls);
    expect(sellerApi.getSellerStats).toHaveBeenCalledTimes(sellerCalls);
    expect(listingsApi.getMyListings).toHaveBeenCalledTimes(sellerCalls);
    expect(capabilitiesApi.requestSellerCapability).not.toHaveBeenCalled();
    expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
    expect(authApi.setup2FA).not.toHaveBeenCalled();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();
    expect(useAuthStore.getState().refreshAuth).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useAuthStore.setState({ user: baseUser, refreshAuth: vi.fn() });
    capabilitiesApi.getCapabilities.mockResolvedValue(capability());
    ordersApi.getMyOrders.mockRejectedValue(unavailable);
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: true, payouts_enabled: true } });
    sellerApi.getSellerStats.mockResolvedValue({ data: sellerStats });
    listingsApi.getMyListings.mockResolvedValue({ data: [] });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAuthStore.setState(originalAuth);
  });

  it('keeps buyer welcome and selling entry usable and persists the error across a failed read-only retry', async () => {
    render(<DashboardOverview />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Welcome back, Seller' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start selling' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
    const retry = deferred<never>();
    ordersApi.getMyOrders.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Retry purchases' }));
    const busy = screen.getByRole('button', { name: 'Retrying purchases...' });
    expect(busy.hasAttribute('disabled')).toBe(true);
    fireEvent.click(busy);
    expect(screen.getByRole('alert')).toBeTruthy();
    await act(async () => retry.reject(unavailable));
    expect(await screen.findByRole('button', { name: 'Retry purchases' })).toBeTruthy();
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
    expectOnlyPurchaseRetry(2);
    expect(console.error).toHaveBeenCalledWith('Failed to fetch dashboard purchase data', unavailable);
  });

  it.each(['empty', 'populated'])('clears the error after explicit %s recovery', async (result) => {
    render(<DashboardOverview />);
    await screen.findByRole('alert');
    ordersApi.getMyOrders.mockResolvedValueOnce(result === 'empty' ? [] : [buyerOrder]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry purchases' }));
    if (result === 'empty') {
      expect(await screen.findByText("You haven't bought anything yet")).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Browse data' }).getAttribute('href')).toBe('/find-data');
    } else {
      expect(await screen.findByText('Climate Dataset')).toBeTruthy();
      expect(screen.getByText('Fulfilled')).toBeTruthy();
      expect(screen.getByText('$25.00')).toBeTruthy();
      expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
    }
    expect(screen.queryByRole('alert')).toBeNull();
    expectOnlyPurchaseRetry(2);
  });

  it.each(['empty', 'populated'])('keeps active seller statistics and notices unchanged during failure and %s recovery', async (result) => {
    capabilitiesApi.getCapabilities.mockResolvedValue(capability('active'));
    connectApi.getConnectStatus.mockResolvedValue({ data: { details_submitted: true, payouts_enabled: false } });
    listingsApi.getMyListings.mockResolvedValue({ data: [{ status: 'published' }] });
    render(<DashboardOverview />);
    await screen.findByRole('alert');
    const views = screen.getByText('12');
    const revenue = screen.getByText('$45.50');
    const notice = screen.getByText('Published listings are not yet purchasable. Finish payout setup to enable sales.');
    const retry = deferred<typeof buyerOrder[]>();
    ordersApi.getMyOrders.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Retry purchases' }));
    expect(screen.getByText('12')).toBe(views);
    expect(screen.getByText('$45.50')).toBe(revenue);
    expect(screen.getByText(notice.textContent!)).toBe(notice);
    expect(screen.getByRole('link', { name: 'Sales awaiting delivery' }).textContent).toContain('2');
    await act(async () => retry.resolve(result === 'empty' ? [] : [buyerOrder]));
    expect(await screen.findByText(result === 'empty' ? "You haven't bought anything yet" : 'Climate Dataset')).toBeTruthy();
    expect(screen.getByText('12')).toBe(views);
    expect(screen.queryByRole('alert')).toBeNull();
    expectOnlyPurchaseRetry(2, 1);
  });

  it('retains the last purchases when a seller setup refresh fails, then replaces them on recovery', async () => {
    ordersApi.getMyOrders.mockResolvedValueOnce([buyerOrder]);
    capabilitiesApi.requestSellerCapability.mockResolvedValue(capability('provisioning'));
    render(<DashboardOverview />);
    await screen.findByText('Climate Dataset');
    fireEvent.click(screen.getByRole('button', { name: 'Start selling' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Climate Dataset')).toBeTruthy();
    expect(screen.getByText('Showing your last loaded purchases.')).toBeTruthy();
    ordersApi.getMyOrders.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry purchases' }));
    await screen.findByText("You haven't bought anything yet");
    expect(screen.queryByText('Climate Dataset')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(2);
  });

  it('keeps provisioning setup usable while a purchase read is pending or failed', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValue({ ...capability('provisioning'), seller: { effective_status: 'provisioning', missing_steps: ['totp_enabled', 'stripe_payouts_live'] } });
    const pending = deferred<never>();
    ordersApi.getMyOrders.mockReturnValueOnce(pending.promise);
    render(<DashboardOverview />);
    expect(await screen.findByRole('button', { name: 'Enable 2FA' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading purchases...');
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
    await act(async () => pending.reject(unavailable));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Enable 2FA' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Stripe' }).hasAttribute('disabled')).toBe(true);
  });

  it.each(['resolve', 'reject'])('ignores an obsolete identity read that later %ss after recovery', async (completion) => {
    const obsolete = deferred<typeof buyerOrder[]>();
    ordersApi.getMyOrders.mockReturnValueOnce(obsolete.promise);
    render(<DashboardOverview />);
    await screen.findByRole('heading', { name: 'Welcome back, Seller' });
    act(() => useAuthStore.setState({ user: { ...baseUser, id: 'user-2', first_name: 'New buyer' } }));
    await screen.findByRole('alert');
    ordersApi.getMyOrders.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry purchases' }));
    await screen.findByText("You haven't bought anything yet");
    await act(async () => completion === 'resolve' ? obsolete.resolve([buyerOrder]) : obsolete.reject(unavailable));
    expect(screen.queryByText('Climate Dataset')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Welcome back, New buyer' })).toBeTruthy();
  });

  it.each(['resolve', 'reject'])('preserves the current account pending read when an old seller action finishes (%s)', async (completion) => {
    const sellerRequest = deferred<ReturnType<typeof capability>>();
    const currentRead = deferred<typeof buyerOrder[]>();
    capabilitiesApi.requestSellerCapability.mockReturnValueOnce(sellerRequest.promise);
    ordersApi.getMyOrders.mockResolvedValueOnce([]).mockReturnValueOnce(currentRead.promise).mockResolvedValue([]);
    render(<DashboardOverview />);
    await screen.findByText("You haven't bought anything yet");
    fireEvent.click(screen.getByRole('button', { name: 'Start selling' }));
    expect(capabilitiesApi.requestSellerCapability).toHaveBeenCalledOnce();

    act(() => useAuthStore.setState({ user: { ...baseUser, id: 'user-2', first_name: 'Current buyer' } }));
    await screen.findByRole('heading', { name: 'Welcome back, Current buyer' });
    expect(ordersApi.getMyOrders).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toBe('Loading purchases...');
    await act(async () => sellerRequest.resolve(capability()));
    expect(screen.getByRole('status').textContent).toBe('Loading purchases...');

    await act(async () => completion === 'resolve'
      ? currentRead.resolve([{ ...buyerOrder, listing_title: 'Current account purchase' }])
      : currentRead.reject(unavailable));
    if (completion === 'resolve') {
      expect(screen.getByText('Current account purchase')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    } else {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Retry purchases' }).hasAttribute('disabled')).toBe(false);
    }
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
    expect(ordersApi.getMyOrders).toHaveBeenCalledTimes(2);
    expect(connectApi.getConnectOnboarding).not.toHaveBeenCalled();
    expect(authApi.setup2FA).not.toHaveBeenCalled();
    expect(authApi.verify2FASetup).not.toHaveBeenCalled();
    expect(useAuthStore.getState().refreshAuth).not.toHaveBeenCalled();
  });

  it('clears retained purchases when the account identity changes', async () => {
    ordersApi.getMyOrders.mockResolvedValueOnce([buyerOrder]);
    render(<DashboardOverview />);
    await screen.findByText('Climate Dataset');
    act(() => useAuthStore.setState({ user: { ...baseUser, id: 'user-2' } }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Climate Dataset')).toBeNull();
    expect(screen.queryByText('Showing your last loaded purchases.')).toBeNull();
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
  });

  it('invalidates a pending read on unmount', async () => {
    const obsolete = deferred<typeof buyerOrder[]>();
    ordersApi.getMyOrders.mockReturnValueOnce(obsolete.promise).mockResolvedValue([]);
    const { unmount } = render(<DashboardOverview />);
    await screen.findByRole('heading', { name: 'Welcome back, Seller' });
    unmount();
    render(<DashboardOverview />);
    await screen.findByText("You haven't bought anything yet");
    await act(async () => obsolete.resolve([buyerOrder]));
    expect(screen.queryByText('Climate Dataset')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not start a purchase read when a seller action finishes after unmount', async () => {
    const request = deferred<ReturnType<typeof capability>>();
    ordersApi.getMyOrders.mockResolvedValue([]);
    capabilitiesApi.requestSellerCapability.mockReturnValueOnce(request.promise);
    const { unmount } = render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start selling' }));
    expect(capabilitiesApi.requestSellerCapability).toHaveBeenCalledOnce();
    unmount();
    await act(async () => request.resolve(capability('provisioning')));
    expect(ordersApi.getMyOrders).toHaveBeenCalledOnce();
  });

  it('ignores a read invalidated by StrictMode effect cleanup on the same component', async () => {
    const obsolete = deferred<typeof buyerOrder[]>();
    ordersApi.getMyOrders.mockReturnValueOnce(obsolete.promise).mockResolvedValue([]);
    render(<StrictMode><DashboardOverview /></StrictMode>);
    await screen.findByText("You haven't bought anything yet");
    expect(ordersApi.getMyOrders).toHaveBeenCalledTimes(2);
    await act(async () => obsolete.resolve([buyerOrder]));
    expect(screen.queryByText('Climate Dataset')).toBeNull();
    expect(screen.getByText("You haven't bought anything yet")).toBeTruthy();
  });

  it.each(['resolve', 'reject'])('ignores an older same-user read after a newer retry succeeds (%s)', async (completion) => {
    const obsolete = deferred<typeof buyerOrder[]>();
    ordersApi.getMyOrders.mockReturnValueOnce(obsolete.promise);
    capabilitiesApi.requestSellerCapability.mockResolvedValue(capability('provisioning'));
    render(<DashboardOverview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start selling' }));
    await screen.findByRole('alert');
    ordersApi.getMyOrders.mockResolvedValueOnce([buyerOrder]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry purchases' }));
    await screen.findByText('Climate Dataset');
    await act(async () => completion === 'resolve' ? obsolete.resolve([]) : obsolete.reject(unavailable));
    expect(screen.getByText('Climate Dataset')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
  });

  it('preserves the top-three purchase links, amounts and statuses on successful reads', async () => {
    ordersApi.getMyOrders.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ ...buyerOrder, id: `order-${i}`, listing_title: `Dataset ${i}` })));
    render(<DashboardOverview />);
    await screen.findByText('Dataset 0');
    for (let i = 0; i < 3; i++) {
      const row = screen.getByRole('link', { name: new RegExp(`Dataset ${i}`) });
      expect(row.getAttribute('href')).toBe(`/dashboard/orders/order-${i}`);
      expect(row.textContent).toContain('$25.00');
      expect(row.textContent).toContain('Fulfilled');
    }
    expect(screen.queryByText('Dataset 3')).toBeNull();
    expect(screen.getByRole('link', { name: 'View all orders' }).getAttribute('href')).toBe('/dashboard/orders');
  });
});
