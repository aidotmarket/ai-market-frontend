// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const sellerWorkspaceApi = vi.hoisted(() => ({
  getSellerWorkspaceCapabilities: vi.fn(),
}));
const gatewaysApi = vi.hoisted(() => ({ listSellerGateways: vi.fn() }));

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

vi.mock('@/api/sellerWorkspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/sellerWorkspace')>()),
  getSellerWorkspaceCapabilities: sellerWorkspaceApi.getSellerWorkspaceCapabilities,
}));
vi.mock('@/api/sellerGateways', () => ({ listSellerGateways: gatewaysApi.listSellerGateways }));

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

const enabledWorkspaceCapabilities = {
  master: { enabled: true, status: 'available' as const, reason: 'enabled' },
  providers: {
    aws: {
      connect: { enabled: true, status: 'available' as const, reason: 'enabled' },
      profile: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      publish: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      delivery: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
    },
    r2: {
      connect: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      profile: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      publish: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      delivery: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
    },
  },
};

describe('DashboardLayout hydration guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
    navigation.pathname = '/dashboard/stripe-return';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'inactive' },
    });
    sellerWorkspaceApi.getSellerWorkspaceCapabilities.mockResolvedValue(
      enabledWorkspaceCapabilities
    );
    gatewaysApi.listSellerGateways.mockResolvedValue([]);
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
    window.history.replaceState(null, '', '/');
  });

  it('shows the spinner and does not push login from a pristine store', async () => {
    const { container } = render(
      <DashboardLayout>
        <div>dashboard child</div>
      </DashboardLayout>
    );

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('dashboard child')).toBeNull();
    await act(async () => {});
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([
    ['/dashboard/stripe-return', ''],
    [
      '/dashboard/data-verification/payment-method/return',
      '?attempt=9bd1c6b2-1472-4a6c-9d6c-e61d14023163&session_id=cs_test_a1AbCdEf',
    ],
  ])('preserves %s%s in the login redirect after unauthenticated hydration', async (pathname, search) => {
    navigation.pathname = pathname;
    window.history.replaceState(null, '', pathname + search);
    render(
      <DashboardLayout>
        <div>dashboard child</div>
      </DashboardLayout>
    );

    act(() => {
      useAuthStore.setState({ hydrated: true, isLoading: false, isAuthenticated: false });
    });

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent(pathname + search)}`
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

  it.each(['active', 'provisioning'] as const)(
    'shows an owned request in buyer context for a %s seller-capable user',
    async (status) => {
      navigation.pathname = '/dashboard/requests';
      capabilitiesApi.getCapabilities.mockResolvedValue({ seller: { effective_status: status } });
      useAuthStore.setState({
        user: { ...user, first_name: null, company_name: null },
        token: 'access-token',
        isAuthenticated: true,
        isLoading: false,
        hydrated: true,
      });

      render(<DashboardLayout><div>owned requests child</div></DashboardLayout>);

      await screen.findByText('owned requests child');
      await screen.findByRole('link', { name: 'Listings' });
      expect(screen.getByRole('link', { name: 'My Requests' }).getAttribute('href')).toBe('/dashboard/requests');
      expect(screen.getByText('Dashboard')).not.toBeNull();
      expect(screen.queryByText('Seller Dashboard')).toBeNull();
      expect(screen.queryByText('seller setup progress')).toBeNull();
      expect(navigation.push).not.toHaveBeenCalledWith('/dashboard/inquiries');
    }
  );

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
        ['Seller Workspace', '/dashboard/seller-workspace'],
        ['Gateways', '/dashboard/gateways'],
        ['Sales', '/dashboard/sales'],
        ['Purchases', '/dashboard/orders'],
        ['My Requests', '/dashboard/requests'],
        ['Inquiries', '/dashboard/seller/inquiries'],
        ['Settings', '/dashboard/settings'],
      ]);
    });
  });

  it('omits Sales for provisioning sellers but keeps Purchases and My Requests', async () => {
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
        ['My Requests', '/dashboard/requests'],
        ['Inquiries', '/dashboard/seller/inquiries'],
        ['Settings', '/dashboard/settings'],
      ]);
    });
    expect(screen.queryByRole('link', { name: 'Sales' })).toBeNull();
    expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the master is default-off',
      {
        ...enabledWorkspaceCapabilities,
        master: { enabled: false, status: 'disabled' as const, reason: 'disabled_by_default' },
      },
    ],
    [
      'AWS connect is unavailable',
      {
        ...enabledWorkspaceCapabilities,
        providers: {
          ...enabledWorkspaceCapabilities.providers,
          aws: {
            ...enabledWorkspaceCapabilities.providers.aws,
            connect: { enabled: true, status: 'unavailable' as const, reason: 'not_configured' },
          },
        },
      },
    ],
  ])('omits Seller Workspace when %s', async (_scenario, workspaceCapabilities) => {
    navigation.pathname = '/dashboard';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'active' },
    });
    sellerWorkspaceApi.getSellerWorkspaceCapabilities.mockResolvedValue(workspaceCapabilities);
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(<DashboardLayout><div>default-off seller child</div></DashboardLayout>);

    await screen.findByText('default-off seller child');
    await waitFor(() => {
      expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('link', { name: 'Seller Workspace' })).toBeNull();
  });

  it('removes a stale Seller Workspace link when the capability request fails', async () => {
    navigation.pathname = '/dashboard';
    capabilitiesApi.getCapabilities.mockResolvedValue({
      seller: { effective_status: 'active' },
    });
    sellerWorkspaceApi.getSellerWorkspaceCapabilities
      .mockResolvedValueOnce(enabledWorkspaceCapabilities)
      .mockRejectedValueOnce(new Error('capability unavailable'));
    useAuthStore.setState({
      user,
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(<DashboardLayout><div>active seller child</div></DashboardLayout>);
    await screen.findByRole('link', { name: 'Seller Workspace' });

    await act(async () => {
      useAuthStore.setState({ user: { ...user, id: 'user-2' } });
    });

    await waitFor(() => {
      expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('link', { name: 'Seller Workspace' })).toBeNull();
    });
  });

  it('renders exact buyer navigation', async () => {
    navigation.pathname = '/dashboard/requests';
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
        ['Settings', '/dashboard/settings'],
      ]);
    });
    expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalledWith('/dashboard/inquiries');
  });

  it.each(['/dashboard/settings', '/dashboard/settings/connected-apps'])(
    'allows a buyer direct visit to %s before and after capabilities resolve', async (pathname) => {
      navigation.pathname = pathname;
      let resolveCapabilities!: (value: { seller: { effective_status: string } }) => void;
      capabilitiesApi.getCapabilities.mockReturnValue(new Promise((resolve) => {
        resolveCapabilities = resolve;
      }));
      useAuthStore.setState({ user, isAuthenticated: true, isLoading: false, hydrated: true });

      render(<DashboardLayout><div>buyer settings child</div></DashboardLayout>);

      await screen.findByText('buyer settings child');
      expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/dashboard/settings');
      expect(navigation.push).not.toHaveBeenCalled();

      await act(async () => {
        resolveCapabilities({ seller: { effective_status: 'not_requested' } });
      });
      expect(screen.getByText('buyer settings child')).toBeTruthy();
      expect(navigation.push).not.toHaveBeenCalled();
      expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
    }
  );

  it('keeps My Requests available during capability loading and failure', async () => {
    navigation.pathname = '/dashboard/requests';
    let rejectCapabilities!: (reason: Error) => void;
    capabilitiesApi.getCapabilities.mockReturnValue(new Promise((_resolve, reject) => {
      rejectCapabilities = reject;
    }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    useAuthStore.setState({
      user: { ...user, role: 'seller' },
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    try {
      render(<DashboardLayout><div>requests during capability load</div></DashboardLayout>);
      await screen.findByText('requests during capability load');
      expect(screen.getByRole('link', { name: 'My Requests' })).not.toBeNull();

      await act(async () => rejectCapabilities(new Error('capability unavailable')));
      expect(screen.getByRole('link', { name: 'My Requests' })).not.toBeNull();
      expect(navigation.push).not.toHaveBeenCalledWith('/dashboard/inquiries');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('drops a stale seller capability result after an account change', async () => {
    navigation.pathname = '/dashboard/requests';
    let resolveOldCapabilities!: (value: { seller: { effective_status: string } }) => void;
    capabilitiesApi.getCapabilities
      .mockReturnValueOnce(new Promise((resolve) => { resolveOldCapabilities = resolve; }))
      .mockResolvedValueOnce({ seller: { effective_status: 'not_requested' } });
    useAuthStore.setState({
      user: { ...user, role: 'seller' },
      token: 'access-token',
      isAuthenticated: true,
      isLoading: false,
      hydrated: true,
    });

    render(<DashboardLayout><div>account requests child</div></DashboardLayout>);
    // A legacy seller role grants no navigation while canonical readiness is pending.
    expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
    expect(screen.getByRole('link', { name: 'My Requests' })).not.toBeNull();

    await act(async () => {
      useAuthStore.setState({ user: { ...user, id: 'user-2' } });
    });
    await screen.findByRole('link', { name: 'My Inquiries' });
    await act(async () => resolveOldCapabilities({ seller: { effective_status: 'active' } }));

    expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
    expect(screen.getByRole('link', { name: 'My Requests' })).not.toBeNull();
    expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).not.toHaveBeenCalled();
  });

  it('redirects a signed-out direct visit to My Requests with its query intact', async () => {
    navigation.pathname = '/dashboard/requests';
    window.history.replaceState(null, '', '/dashboard/requests?from=account');
    useAuthStore.setState({ hydrated: true, isLoading: false, isAuthenticated: false });

    render(<DashboardLayout><div>private requests child</div></DashboardLayout>);

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/dashboard/requests?from=account')}`
    ));
    expect(screen.queryByText('private requests child')).toBeNull();
    expect(screen.queryByRole('link', { name: 'My Requests' })).toBeNull();
  });

  it.each(['gateway_disabled', 'other_error'])('hides Gateways after %s', async (code) => {
    navigation.pathname = '/dashboard';
    capabilitiesApi.getCapabilities.mockResolvedValue({ seller: { effective_status: 'active' } });
    gatewaysApi.listSellerGateways.mockRejectedValue({ response: { data: { error: { code } } } });
    useAuthStore.setState({ user: { ...user, role: 'seller' }, token: 'token', isAuthenticated: true, isLoading: false, hydrated: true });
    render(<DashboardLayout>Seller dashboard</DashboardLayout>);
    await screen.findByText('Seller dashboard');
    await waitFor(() => expect(gatewaysApi.listSellerGateways).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Gateways' })).toBeNull();
  });

  it.each([
    ['/dashboard/sales', 'Sales'],
    ['/dashboard/listings', 'Listings'],
    ['/dashboard/seller-workspace', 'Seller Workspace'],
  ])('redirects a buyer direct visit to %s', async (pathname, childLabel) => {
    navigation.pathname = pathname;
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

    render(<DashboardLayout><div>{childLabel} child must not render</div></DashboardLayout>);

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/dashboard/inquiries');
    });
    expect(screen.queryByText(`${childLabel} child must not render`)).toBeNull();
  });
});

// Controlled transports make every pending and superseded request observable.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const capability = (effective_status: string) => ({ seller: { effective_status } });
const signIn = (overrides: Partial<User> = {}) => useAuthStore.setState({
  user: { ...user, ...overrides }, token: 'access-token',
  isAuthenticated: true, isLoading: false, hydrated: true,
});
const changed = () => window.dispatchEvent(new Event('capabilities:changed'));

describe('DashboardLayout canonical capability ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigation.pathname = '/dashboard/listings';
    window.history.replaceState(null, '', '/');
    capabilitiesApi.getCapabilities.mockResolvedValue(capability('not_requested'));
    sellerWorkspaceApi.getSellerWorkspaceCapabilities.mockResolvedValue(enabledWorkspaceCapabilities);
    gatewaysApi.listSellerGateways.mockResolvedValue([]);
    signIn();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it.each(['buyer', 'pending'] as const)('waits for canonical readiness for legacy %s direct visits', async (role) => {
    for (const pathname of ['/dashboard/listings', '/dashboard/seller-workspace']) {
      for (const status of ['active', 'provisioning']) {
        navigation.pathname = pathname;
        navigation.push.mockClear();
        // Exercise the legacy wire value even though UserRole excludes pending.
        signIn({ role: role as User['role'] });
        const read = deferred<ReturnType<typeof capability>>();
        capabilitiesApi.getCapabilities.mockReturnValueOnce(read.promise);
        const mounted = render(<DashboardLayout><div>guarded child</div></DashboardLayout>);
        expect(screen.queryByText('guarded child')).toBeNull();
        expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
        expect(navigation.push).not.toHaveBeenCalled();
        await act(async () => read.resolve(capability(status)));
        expect(screen.getByText('guarded child')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Listings' })).toBeTruthy();
        expect(navigation.push).not.toHaveBeenCalled();
        mounted.unmount();
      }
    }
  });

  it('refreshes the same persistent layout on the actual opt-in event, then allows a seller link', async () => {
    navigation.pathname = '/dashboard';
    const read = deferred<ReturnType<typeof capability>>();
    capabilitiesApi.getCapabilities.mockResolvedValueOnce(capability('not_requested')).mockReturnValueOnce(read.promise);
    const view = render(<DashboardLayout><div>persistent child</div></DashboardLayout>);
    await act(async () => {});
    expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
    act(changed);
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(2);
    expect(screen.getByText('persistent child')).toBeTruthy();
    await act(async () => read.resolve(capability('provisioning')));
    expect(screen.getByRole('link', { name: 'Listings' }).getAttribute('href')).toBe('/dashboard/listings');
    navigation.pathname = '/dashboard/listings';
    view.rerender(<DashboardLayout><div>listing setup child</div></DashboardLayout>);
    expect(screen.getByText('listing setup child')).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(2);
    expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).not.toHaveBeenCalled();
    expect(gatewaysApi.listSellerGateways).not.toHaveBeenCalled();
  });

  it('offers one explicit retry per click after a failed read without redirecting or mounting seller content', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = deferred<ReturnType<typeof capability>>();
    const retry = deferred<ReturnType<typeof capability>>();
    capabilitiesApi.getCapabilities.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
    render(<DashboardLayout><div>private child</div></DashboardLayout>);
    await act(async () => first.reject(new Error('offline')));
    expect(screen.getByRole('alert').textContent).toContain('Unable to check seller access');
    expect(screen.queryByText('private child')).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry seller access' }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('private child')).toBeNull();
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve(capability('provisioning')));
    expect(screen.getByText('private child')).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(['not_requested', 'suspended'])('denies %s even for an admin with the admin email', async (status) => {
    signIn({ role: 'admin', email: 'max@ai.market' });
    const read = deferred<ReturnType<typeof capability>>();
    capabilitiesApi.getCapabilities.mockReturnValueOnce(read.promise);
    render(<DashboardLayout><div>denied child</div></DashboardLayout>);
    expect(screen.queryByText('denied child')).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
    await act(async () => read.resolve(capability(status)));
    expect(navigation.push).toHaveBeenCalledWith('/dashboard/inquiries');
    expect(screen.queryByText('denied child')).toBeNull();
    expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).not.toHaveBeenCalled();
    expect(gatewaysApi.listSellerGateways).not.toHaveBeenCalled();
  });

  it.each(['/dashboard', '/dashboard/inquiries/thread', '/dashboard/orders/item', '/dashboard/requests/item', '/dashboard/settings/profile'])(
    'keeps %s available through capability loading and failure', async (pathname) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      navigation.pathname = pathname;
      const read = deferred<ReturnType<typeof capability>>();
      capabilitiesApi.getCapabilities.mockReturnValueOnce(read.promise);
      render(<DashboardLayout><div>buyer route child</div></DashboardLayout>);
      expect(screen.getByText('buyer route child')).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
      await act(async () => read.reject(new Error('offline')));
      expect(screen.getByText('buyer route child')).toBeTruthy();
      expect(navigation.push).not.toHaveBeenCalled();
      expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(1);
    }
  );

  it('hides ready seller children immediately on account change, until the new owner resolves', async () => {
    capabilitiesApi.getCapabilities.mockResolvedValueOnce(capability('active'));
    const next = deferred<ReturnType<typeof capability>>();
    capabilitiesApi.getCapabilities.mockReturnValueOnce(next.promise);
    render(<DashboardLayout><div>seller private child</div></DashboardLayout>);
    await screen.findByRole('link', { name: 'Seller Workspace' });
    act(() => signIn({ id: 'user-2' }));
    expect(screen.queryByText('seller private child')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
    await act(async () => next.resolve(capability('not_requested')));
    expect(screen.queryByText('seller private child')).toBeNull();
    expect(navigation.push).toHaveBeenCalledWith('/dashboard/inquiries');
  });

  it.each(['account change', 'token change', 'signout', 'newer refresh'])(
    'rejects a stale capability completion after %s', async (transition) => {
      const old = deferred<ReturnType<typeof capability>>();
      const next = deferred<ReturnType<typeof capability>>();
      capabilitiesApi.getCapabilities.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
      render(<DashboardLayout><div>seller private child</div></DashboardLayout>);
      act(() => {
        if (transition === 'account change') signIn({ id: 'user-2' });
        else if (transition === 'token change') useAuthStore.setState({ token: 'replacement-token' });
        else if (transition === 'signout') useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
        else changed();
      });
      await act(async () => old.resolve(capability('active')));
      expect(screen.queryByText('seller private child')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
      expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).not.toHaveBeenCalled();
      expect(gatewaysApi.listSellerGateways).not.toHaveBeenCalled();
      if (transition !== 'signout') {
        expect(navigation.push).not.toHaveBeenCalled();
        await act(async () => next.resolve(capability('provisioning')));
        expect(screen.getByText('seller private child')).toBeTruthy();
      } else {
        expect(navigation.push).toHaveBeenCalledWith('/login?redirect=%2Fdashboard%2Flistings');
        expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(1);
      }
    }
  );

  it('keeps the newest refresh when older reads finish out of order (including rejection)', async () => {
    const older = deferred<ReturnType<typeof capability>>();
    const middle = deferred<ReturnType<typeof capability>>();
    const newest = deferred<ReturnType<typeof capability>>();
    capabilitiesApi.getCapabilities.mockReturnValueOnce(older.promise).mockReturnValueOnce(middle.promise).mockReturnValueOnce(newest.promise);
    render(<DashboardLayout><div>newest child</div></DashboardLayout>);
    act(changed);
    act(changed);
    await act(async () => newest.resolve(capability('provisioning')));
    expect(screen.getByText('newest child')).toBeTruthy();
    await act(async () => {
      older.resolve(capability('not_requested'));
      middle.reject(new Error('stale error'));
    });
    expect(screen.getByText('newest child')).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(3);
  });

  it.each(['account change', 'token change', 'signout', 'newer refresh'])(
    'rejects old workspace/gateway subreads after %s', async (transition) => {
      const workspace = deferred<typeof enabledWorkspaceCapabilities>();
      const gateways = deferred<never[]>();
      const next = deferred<ReturnType<typeof capability>>();
      capabilitiesApi.getCapabilities.mockResolvedValueOnce(capability('active')).mockReturnValueOnce(next.promise);
      sellerWorkspaceApi.getSellerWorkspaceCapabilities.mockReturnValueOnce(workspace.promise);
      gatewaysApi.listSellerGateways.mockReturnValueOnce(gateways.promise);
      render(<DashboardLayout><div>subread child</div></DashboardLayout>);
      await act(async () => {});
      expect(screen.getByText('subread child')).toBeTruthy();
      expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).toHaveBeenCalledTimes(1);
      act(() => {
        if (transition === 'account change') signIn({ id: 'user-2' });
        else if (transition === 'token change') useAuthStore.setState({ token: 'replacement-token' });
        else if (transition === 'signout') useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
        else changed();
      });
      expect(screen.queryByText('subread child')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Listings' })).toBeNull();
      if (transition !== 'signout') await act(async () => next.resolve(capability('provisioning')));
      await act(async () => { workspace.resolve(enabledWorkspaceCapabilities); gateways.resolve([]); });
      expect(screen.queryByRole('link', { name: 'Seller Workspace' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Gateways' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Sales' })).toBeNull();
      if (transition !== 'signout') {
        expect(screen.getByText('subread child')).toBeTruthy();
        expect(navigation.push).not.toHaveBeenCalled();
      } else expect(screen.queryByText('subread child')).toBeNull();
    }
  );

  it('cleans up the event listener and rejects late completions on unmount', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const read = deferred<ReturnType<typeof capability>>();
    capabilitiesApi.getCapabilities.mockReturnValueOnce(read.promise);
    const view = render(<DashboardLayout><div>unmounted child</div></DashboardLayout>);
    const listener = add.mock.calls.find(([name]) => name === 'capabilities:changed')?.[1];
    expect(listener).toBeTypeOf('function');
    view.unmount();
    expect(remove).toHaveBeenCalledWith('capabilities:changed', listener);
    act(changed);
    await act(async () => read.resolve(capability('active')));
    expect(capabilitiesApi.getCapabilities).toHaveBeenCalledTimes(1);
    expect(sellerWorkspaceApi.getSellerWorkspaceCapabilities).not.toHaveBeenCalled();
    expect(gatewaysApi.listSellerGateways).not.toHaveBeenCalled();
  });
});
