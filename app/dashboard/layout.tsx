'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getCapabilities, type CapabilityStatus } from '@/api/capabilities';
import SellerSetupProgressBar from '@/components/onboarding/SellerSetupProgressBar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [routeReady, setRouteReady] = useState(false);
  const [sellerStatus, setSellerStatus] = useState<CapabilityStatus | null>(null);
  const [capabilitiesResolved, setCapabilitiesResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSellerStatus(null);
    setCapabilitiesResolved(false);

    if (isLoading || !isAuthenticated) return;

    getCapabilities()
      .then((capabilities) => {
        if (!cancelled) {
          setSellerStatus(capabilities.seller.effective_status);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch dashboard capabilities', err);
      })
      .finally(() => {
        if (!cancelled) {
          setCapabilitiesResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    setRouteReady(false);
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    const roleSellerFallback = user?.role === 'seller' || user?.role === 'admin';
    const isSeller = capabilitiesResolved
      ? sellerStatus === 'active' || sellerStatus === 'provisioning'
      : roleSellerFallback;
    const buyerAllowedRoutes = ['/dashboard', '/dashboard/inquiries', '/dashboard/orders', '/dashboard/requests', '/dashboard/settings'];
    const isBuyer = user && !isSeller;
    if (isBuyer && !buyerAllowedRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      router.push('/dashboard/inquiries');
      return;
    }

    setRouteReady(true);
  }, [capabilitiesResolved, isAuthenticated, isLoading, pathname, router, sellerStatus, user]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
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

  const isSeller = capabilitiesResolved
    ? sellerStatus === 'active' || sellerStatus === 'provisioning'
    : user?.role === 'seller' || user?.role === 'admin';
  const isAdminEmail = user?.email === 'max@ai.market';

  const navLinks = [
    ...(isSeller
      ? [
        { name: 'Overview', href: '/dashboard' },
        { name: 'Listings', href: '/dashboard/listings' },
        { name: 'Orders', href: '/dashboard/orders' },
        { name: 'Inquiries', href: '/dashboard/seller/inquiries' },
        { name: 'Settings', href: '/dashboard/settings' },
      ]
      : [
        { name: 'My Inquiries', href: '/dashboard/inquiries' },
        { name: 'My Orders', href: '/dashboard/orders' },
        { name: 'My Requests', href: '/dashboard/requests' },
      ]),
    ...(isAdminEmail ? [{ name: 'Blog Admin', href: '/keystatic' }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <span className="text-lg font-semibold text-gray-900 truncate">
            {user?.company_name || user?.first_name || (isSeller ? 'Seller Dashboard' : 'Dashboard')}
          </span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
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
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
      <SellerSetupProgressBar />
    </div>
  );
}
