// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import type { User } from '@/types';
import DashboardLayout from './layout';
import { useAuthStore } from '@/store/auth';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/dashboard/stripe-return',
}));

const capabilitiesApi = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace,
  }),
  usePathname: () => navigation.pathname,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/api/capabilities', () => ({
  getCapabilities: capabilitiesApi.getCapabilities,
}));

vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({
  default: () => <div>seller setup progress</div>,
}));

const user: User = {
  id: 'user-1',
  email: 'buyer@example.com',
  first_name: 'Buyer',
  last_name: null,
  company_name: null,
  role: 'buyer',
  status: 'active',
  created_at: '2026-06-17T00:00:00Z',
  email_verified_at: '2026-06-17T00:00:00Z',
  totp_enabled: false,
  auth_methods: ['password'],
  primary_auth: 'password',
};

describe('DashboardLayout hydration guard', () => {
  beforeEach(() => {
    navigation.pathname = '/dashboard/stripe-return';
    navigation.push.mockClear();
    navigation.replace.mockClear();
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'inactive' },
    });
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      hydrated: false,
      pendingTwoFactor: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the spinner and does not push login from a pristine store', async () => {
    const { container } = render(
      <DashboardLayout>
        <div>dashboard child</div>
      </DashboardLayout>
    );

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('dashboard child')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('pushes login with redirect after hydrate resolves unauthenticated', async () => {
    render(
      <DashboardLayout>
        <div>dashboard child</div>
      </DashboardLayout>
    );

    useAuthStore.setState({ hydrated: true, isLoading: false, isAuthenticated: false });

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent('/dashboard/stripe-return')}`
      );
    });
  });

  it('renders children after hydrate resolves authenticated', async () => {
    navigation.pathname = '/dashboard';
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(
      <DashboardLayout>
        <div>dashboard child</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(screen.getByText('dashboard child')).not.toBeNull();
    });
    expect(navigation.push).not.toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/dashboard')}`
    );
  });

  it('uses a neutral title and overview navigation for a buyer without a display name', async () => {
    navigation.pathname = '/dashboard';
    useAuthStore.setState({
      user: { ...user, first_name: null, company_name: null, role: 'seller' },
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(
      <DashboardLayout>
        <div>buyer dashboard child</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(screen.getByText('buyer dashboard child')).not.toBeNull();
    });

    expect(screen.getByText('Dashboard')).not.toBeNull();
    expect(screen.queryByText('Seller Dashboard')).toBeNull();
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/dashboard');
  });

  it('uses buyer purchase context for a provisioning seller-capable user without a display name', async () => {
    navigation.pathname = '/dashboard/orders';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'provisioning' },
    });
    useAuthStore.setState({
      user: { ...user, first_name: null, company_name: null, role: 'seller' },
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(
      <DashboardLayout>
        <div>buyer orders child</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(screen.getByText('buyer orders child')).not.toBeNull();
    });

    expect(screen.getByText('Dashboard')).not.toBeNull();
    expect(screen.queryByText('Seller Dashboard')).toBeNull();
    expect(screen.queryByText('seller setup progress')).toBeNull();
  });

  it('keeps seller context on a seller route for a provisioning seller-capable user', async () => {
    navigation.pathname = '/dashboard/listings';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'provisioning' },
    });
    useAuthStore.setState({
      user: { ...user, first_name: null, company_name: null, role: 'seller' },
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(
      <DashboardLayout>
        <div>seller listings child</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(screen.getByText('seller listings child')).not.toBeNull();
    });

    expect(screen.getByText('Seller Dashboard')).not.toBeNull();
    expect(screen.getByText('seller setup progress')).not.toBeNull();
  });

  it('renders exact active seller navigation', async () => {
    navigation.pathname = '/dashboard';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'active' },
    });
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(<DashboardLayout><div>active seller child</div></DashboardLayout>);

    await screen.findByText('active seller child');
    await waitFor(() => {
      expect(screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
        ['Overview', '/dashboard'],
        ['Listings', '/dashboard/listings'],
        ['Sales', '/dashboard/sales'],
        ['Purchases', '/dashboard/orders'],
        ['Inquiries', '/dashboard/seller/inquiries'],
        ['Settings', '/dashboard/settings'],
      ]);
    });
  });

  it('omits Sales for provisioning sellers but keeps Purchases', async () => {
    navigation.pathname = '/dashboard/listings';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'provisioning' },
    });
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(<DashboardLayout><div>provisioning seller child</div></DashboardLayout>);

    await screen.findByText('provisioning seller child');
    await waitFor(() => {
      expect(screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
        ['Overview', '/dashboard'],
        ['Listings', '/dashboard/listings'],
        ['Purchases', '/dashboard/orders'],
        ['Inquiries', '/dashboard/seller/inquiries'],
        ['Settings', '/dashboard/settings'],
      ]);
    });
    expect(screen.queryByRole('link', { name: 'Sales' })).toBeNull();
  });

  it('renders exact buyer navigation', async () => {
    navigation.pathname = '/dashboard';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'not_requested' },
    });
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(<DashboardLayout><div>buyer child</div></DashboardLayout>);

    await screen.findByText('buyer child');
    await waitFor(() => {
      expect(screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
        ['Overview', '/dashboard'],
        ['My Inquiries', '/dashboard/inquiries'],
        ['Purchases', '/dashboard/orders'],
        ['My Requests', '/dashboard/requests'],
      ]);
    });
  });

  it('redirects a buyer direct Sales visit', async () => {
    navigation.pathname = '/dashboard/sales';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'not_requested' },
    });
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(<DashboardLayout><div>Sales child must not render</div></DashboardLayout>);

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/dashboard/inquiries');
    });
    expect(screen.queryByText('Sales child must not render')).toBeNull();
  });
});
