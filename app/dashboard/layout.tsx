'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getConnectStatus } from '@/api/connect';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    // Buyers can access inquiry, order, and request routes only
    const buyerAllowedPrefixes = ['/dashboard/inquiries', '/dashboard/orders', '/dashboard/requests'];
    const isBuyer = user && user.role !== 'seller' && user.role !== 'admin';
    if (isBuyer && !buyerAllowedPrefixes.some((p) => pathname.startsWith(p))) {
      router.push('/dashboard/inquiries');
      return;
    }

    // Check Stripe connected status for /dashboard/listings/new
    if (pathname === '/dashboard/listings/new') {
      getConnectStatus()
        .then((res) => {
          const connected = !!res.data?.details_submitted;
          setStripeConnected(connected);
          if (!connected) {
            router.push('/dashboard');
          }
        })
        .catch(() => {
          setStripeConnected(false);
          router.push('/dashboard');
        });
    } else {
      setStripeConnected(true); // not needed for other routes
    }
  }, [isAuthenticated, isLoading, user, router, pathname]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  // Still checking stripe status (buyers are now allowed for some routes)
  if (stripeConnected === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const isSeller = user?.role === 'seller' || user?.role === 'admin';

  const navLinks = isSeller
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
                    ? 'bg-blue-50 text-blue-700'
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
    </div>
  );
}
