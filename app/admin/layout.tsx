'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const [routeReady, setRouteReady] = useState(false);

  useEffect(() => {
    setRouteReady(false);
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    if (user && user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    if (user) setRouteReady(true);
  }, [isAuthenticated, isLoading, pathname, router, user]);

  if (isLoading || !isAuthenticated || !routeReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
      </div>
    );
  }

  const links = [{ name: 'Tickets', href: '/admin/tickets' }];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <span className="truncate text-lg font-semibold text-gray-900">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-6">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
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

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
