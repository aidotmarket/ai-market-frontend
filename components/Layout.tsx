'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { SearchForm } from '@/components/search/SearchForm';

const footerLinkSections = [
  {
    title: 'Marketplace',
    links: [
      { label: 'Browse Data', href: '/listings' },
      { label: 'Request Data', href: '/requests' },
      { label: 'List Your Data', href: '/download' },
      { label: 'Partner Program', href: '/partner' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'The Protocol', href: '/protocol' },
      { label: 'vectorAIz', href: 'https://vectoraiz.com' },
      { label: 'GitHub', href: 'https://github.com/aidotmarket' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Contact & Support', href: '/support' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Site Terms', href: '/legal/site-terms' },
      { label: 'Privacy Notice', href: '/legal/privacy' },
    ],
  },
];

const solutionsItems = [
  'Financial Services',
  'Healthcare & Life Sciences',
  'Retail & E-Commerce',
  'Marketing & Advertising',
  'AI & Machine Learning',
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showNavSearch = pathname !== '/search' && pathname !== '/listings';

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/">
              <img src="/logo.svg" alt="ai.market" className="h-8" />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/listings" className="text-sm text-[#666666] hover:text-[#1A1A1A]">
                Browse
              </Link>
              <Link href="/requests" className="text-sm text-[#666666] hover:text-[#1A1A1A]">
                Request Data
              </Link>
              <Link href="/partner" className="text-sm text-[#666666] hover:text-[#1A1A1A]">
                Become a Partner
              </Link>
              <Link href="/download" className="text-sm text-[#666666] hover:text-[#1A1A1A]">
                List Data
              </Link>
              <Link href="/protocol" className="text-sm text-[#666666] hover:text-[#1A1A1A]">
                The Protocol
              </Link>
              {isAuthenticated && (
                <Link href="/dashboard" className="text-sm text-[#666666] hover:text-[#1A1A1A]">
                  Dashboard
                </Link>
              )}
            </nav>

            {/* Desktop Nav Search */}
            {showNavSearch && (
              <div className="hidden md:block w-full max-w-xs lg:max-w-sm">
                <Suspense fallback={null}>
                  <SearchForm size="compact" placeholder="Search datasets..." />
                </Suspense>
              </div>
            )}

            {/* Desktop Auth */}
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    {user?.first_name || user?.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0]"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 text-gray-600"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div id="mobile-nav-menu" className="md:hidden border-t border-gray-200 py-3 space-y-2">
              <Link
                href="/listings"
                className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Browse
              </Link>
              <Link
                href="/requests"
                className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Request Data
              </Link>
              <Link
                href="/partner"
                className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                Become a Partner
              </Link>
              <Link
                href="/download"
                className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                List Data
              </Link>
              <Link
                href="/protocol"
                className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                The Protocol
              </Link>
              {isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="block w-full text-left px-2 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="block px-2 py-2 text-sm text-gray-600 hover:text-gray-900"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="block px-2 py-2 text-sm text-[#3F51B5] font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-[#1b2332] text-[#c1c9d4]">
        {/* Newsletter CTA */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 pt-12 pb-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <Link href="/" className="shrink-0">
              <img src="/logo.svg" alt="ai.market" className="h-7 brightness-0 invert" />
            </Link>
            <p className="text-sm text-[#96a0af] flex-1 sm:mx-8">
              Be the first to know about new data products and providers added to ai.market.
            </p>
            <a
              href="mailto:support@ai.market?subject=Newsletter%20Subscription"
              className="inline-flex items-center gap-2.5 px-5 py-2.5 border border-[#3d4a5c] rounded-md text-sm font-medium text-[#e2e8f0] hover:border-[#6b7a8d] hover:bg-white/[0.04] transition-colors whitespace-nowrap"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 6L2 7" />
              </svg>
              Subscribe to Newsletter
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="border-t border-[#2a3545]" />
        </div>

        {/* Footer Links Grid */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 gap-y-10">
            {/* Marketplace - with links */}
            {footerLinkSections.map((section) => (
              <div key={section.title}>
                <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#e2e8f0] mb-4">
                  {section.title}
                </h4>
                <ul className="space-y-2.5">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-[#96a0af] hover:text-white transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Solutions - plain text, no links */}
            <div>
              <h4 className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#e2e8f0] mb-4">
                Solutions
              </h4>
              <ul className="space-y-2.5">
                {solutionsItems.map((item) => (
                  <li key={item} className="text-sm text-[#96a0af]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8 pb-8">
          <div className="border-t border-[#2a3545] pt-6 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px] text-[#6b7a8d]">
            <Link href="/legal/site-terms" className="hover:text-[#96a0af] transition-colors">
              Site Terms
            </Link>
            <span className="mx-1.5">|</span>
            <Link href="/legal/privacy" className="hover:text-[#96a0af] transition-colors">
              Privacy Notice
            </Link>
            <span className="flex-1" />
            <span>&copy; {new Date().getFullYear()} ai.market. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
