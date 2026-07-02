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
  default: () => null,
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
      `/login?redirect=${encodeURIComponent('/dashboard/stripe-return')}`
    );
  });
});
