// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/api/auth', () => authApi);
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

describe('DashboardOverview seller setup 2FA state', () => {
  beforeEach(() => {
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
    useAuthStore.setState({
      user: baseUser,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
      pendingTwoFactor: null,
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
    expect(ordersApi.getMyOrders).not.toHaveBeenCalled();
  });

  it('renders active seller stats from capability state alone', async () => {
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
      data: { views: 12, sales: 3, revenue: 45.5 },
    });
    listingsApi.getMyListings.mockResolvedValue({ data: [] });

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByText("Here's what's happening with your store today.")).not.toBeNull();
    });

    expect(screen.getByText('12')).not.toBeNull();
    expect(screen.getByText('3')).not.toBeNull();
    expect(screen.getByText('$45.50')).not.toBeNull();
    expect(screen.queryByText('Finish seller setup')).toBeNull();
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledOnce();
    expect(connectApi.getConnectStatus).toHaveBeenCalledOnce();
    expect(sellerApi.getSellerStats).toHaveBeenCalledOnce();
    expect(listingsApi.getMyListings).toHaveBeenCalledOnce();
    expect(ordersApi.getMyOrders).not.toHaveBeenCalled();
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
    ordersApi.getMyOrders.mockResolvedValue([
      {
        id: 'order-12345678',
        listing_id: 'listing-1',
        listing_title: 'Climate Dataset',
        seller_name: 'Data Seller',
        amount: 25,
        status: 'fulfilled',
        created_at: '2026-08-14T00:00:00Z',
        updated_at: null,
      },
    ]);

    render(<DashboardOverview />);

    await waitFor(() => {
      expect(screen.getByText('Climate Dataset')).not.toBeNull();
    });

    expect(screen.getByText('Fulfilled')).not.toBeNull();
    expect(screen.getByText('$25.00')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'View all orders' }).getAttribute('href')).toBe('/dashboard/orders');
    expect(screen.queryByText("You haven't bought anything yet")).toBeNull();
  });
});
