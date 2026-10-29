'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getCapabilities, type CapabilityStatus } from '@/api/capabilities';
import {
  getSellerWorkspaceCapabilities,
  isAWSConnectionAvailable,
} from '@/api/sellerWorkspace';
import SellerSetupProgressBar from '@/components/onboarding/SellerSetupProgressBar';
import { listSellerGateways } from '@/api/sellerGateways';

const isBuyerActivityRoute = (pathname: string) =>
  pathname === '/dashboard/orders' || pathname.startsWith('/dashboard/orders/') ||
  pathname === '/dashboard/requests' || pathname.startsWith('/dashboard/requests/');

type CapabilitySnapshot = {
  owner: string;
  token: string | null;
  phase: 'loading' | 'ready' | 'error';
  sellerStatus: CapabilityStatus | null;
  workspace: boolean;
  gateways: boolean;
};

const buyerAllowedRoutes = ['/dashboard', '/dashboard/inquiries', '/dashboard/orders', '/dashboard/requests', '/dashboard/settings'];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, token, isAuthenticated, isLoading, hydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const owner = user?.id;
  const request = useRef(0);
  const [snapshot, setSnapshot] = useState<CapabilitySnapshot | null>(null);

  const refreshCapabilities = useCallback(async () => {
    // Invalidate in-flight reads even when authentication is no longer usable.
    const version = ++request.current;
    if (isLoading || !hydrated || !isAuthenticated || !owner || !token) {
      setSnapshot(null);
      return;
    }

    // Check the live store as well as request ownership: auth may change before
    // React has run the previous effect's cleanup.
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return request.current === version && auth.user?.id === owner &&
        auth.token === token && auth.isAuthenticated && auth.hydrated && !auth.isLoading;
    };
    if (!isCurrent()) return;
    const pending: CapabilitySnapshot = {
      owner, token, phase: 'loading', sellerStatus: null, workspace: false, gateways: false,
    };
    // Credentials own requests; a ready view belongs to the stable action owner.
    // Revalidation must not remount the seller page and discard unsaved state.
    setSnapshot((previous) => previous?.owner === owner && previous.phase === 'ready'
      ? previous : pending);
    try {
      // The shared API client already refreshes and retries a 401 once.
      const capabilities = await getCapabilities();
      if (!isCurrent()) return;
      const status = capabilities.seller.effective_status;
      const ready: CapabilitySnapshot = { ...pending, phase: 'ready', sellerStatus: status };
      setSnapshot(ready);
      if (status !== 'active') return;

      const [workspace, gateways] = await Promise.allSettled([
        getSellerWorkspaceCapabilities(), listSellerGateways(),
      ]);
      if (!isCurrent()) return;
      setSnapshot({
        ...ready,
        workspace: workspace.status === 'fulfilled' && isAWSConnectionAvailable(workspace.value),
        gateways: gateways.status === 'fulfilled',
      });
    } catch (err) {
      if (!isCurrent()) return;
      console.error('Failed to fetch dashboard capabilities', err);
      setSnapshot({ ...pending, phase: 'error' });
    }
  }, [hydrated, isAuthenticated, isLoading, owner, token]);

  useEffect(() => {
    void refreshCapabilities();
    const onCapabilitiesChanged = () => { void refreshCapabilities(); };
    window.addEventListener('capabilities:changed', onCapabilitiesChanged);
    return () => {
      ++request.current;
      window.removeEventListener('capabilities:changed', onCapabilitiesChanged);
    };
  }, [refreshCapabilities]);

  // Derive access during render so a previous owner's ready state can never
  // render seller navigation or children while an identity change is pending.
  const current = !isLoading && hydrated && isAuthenticated && !!token &&
    snapshot?.owner === owner ? snapshot : null;
  const capabilitiesResolved = current?.phase === 'ready';
  const isSeller = capabilitiesResolved &&
    (current.sellerStatus === 'active' || current.sellerStatus === 'provisioning');
  const isSellerActive = capabilitiesResolved && current.sellerStatus === 'active';
  const sellerWorkspaceAvailable = current?.workspace === true;
  const gatewaysAvailable = current?.gateways === true;
  const buyerRoute = buyerAllowedRoutes.some((p) =>
    pathname === p || (p !== '/dashboard' && pathname.startsWith(`${p}/`)));
  const authenticated = !isLoading && hydrated && isAuthenticated && !!owner && !!token;
  const routeReady = authenticated && (buyerRoute || isSeller);

  useEffect(() => {
    if (isLoading || !hydrated) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname + (typeof window !== 'undefined' ? window.location.search : ''))}`);
    } else if (owner && !buyerRoute && capabilitiesResolved && !isSeller) {
      router.push(current?.sellerStatus === 'not_requested' ? '/dashboard' : '/dashboard/inquiries');
    }
  }, [buyerRoute, capabilitiesResolved, current?.sellerStatus, hydrated, isAuthenticated, isLoading, isSeller, owner, pathname, router]);

  if (authenticated && !buyerRoute && current?.phase === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p role="alert">Unable to check seller access. Please try again.</p>
        <button type="button" onClick={() => { void refreshCapabilities(); }}
          className="rounded-md bg-[#3F51B5] px-4 py-2 text-white">
          Retry seller access
        </button>
        <Link href="/dashboard">Back to Overview</Link>
      </div>
    );
  }

  if (!routeReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
      </div>
    );
  }

  const isAdminEmail = user?.email === 'max@ai.market';
  const usesBuyerActivityContext = isBuyerActivityRoute(pathname);

  const navLinks = [
    ...(isSeller
      ? [
        { name: 'Overview', href: '/dashboard' },
        { name: 'Listings', href: '/dashboard/listings' },
        ...(isSellerActive && sellerWorkspaceAvailable
          ? [{ name: 'Seller Workspace', href: '/dashboard/seller-workspace' }]
          : []),
        ...(isSellerActive && gatewaysAvailable
          ? [{ name: 'Gateways', href: '/dashboard/gateways' }]
          : []),
        ...(isSellerActive ? [{ name: 'Sales', href: '/dashboard/sales' }] : []),
        { name: 'Purchases', href: '/dashboard/orders' },
        { name: 'My Requests', href: '/dashboard/requests' },
        { name: 'Inquiries', href: '/dashboard/seller/inquiries' },
        { name: 'Settings', href: '/dashboard/settings' },
      ]
      : [
        { name: 'Overview', href: '/dashboard' },
        { name: 'My Inquiries', href: '/dashboard/inquiries' },
        { name: 'Purchases', href: '/dashboard/orders' },
        { name: 'My Requests', href: '/dashboard/requests' },
        { name: 'Settings', href: '/dashboard/settings' },
      ]),
    ...(isAdminEmail ? [{ name: 'Blog Admin', href: '/keystatic' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-gray-200 bg-white md:w-56 md:border-b-0 md:border-r lg:w-64">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <span className="text-lg font-semibold text-gray-900 truncate">
            {user?.company_name || user?.first_name || (capabilitiesResolved && isSeller && !usesBuyerActivityContext ? 'Seller Dashboard' : 'Dashboard')}
          </span>
        </div>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-4 py-3 md:block md:flex-1 md:space-y-1 md:py-6">
          {current?.phase === 'error' && (
            <div className="shrink-0 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p role="alert">Unable to check seller access.</p>
              <button type="button" onClick={() => { void refreshCapabilities(); }}
                className="mt-2 font-medium underline">
                Retry seller access
              </button>
            </div>
          )}
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.name}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex shrink-0 items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-[#E8EAF6] text-[#3F51B5]'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
      {!usesBuyerActivityContext && isSeller && <SellerSetupProgressBar />}
    </div>
  );
}
