// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Layout } from './Layout';

const navigation = vi.hoisted(() => ({
  pathname: '/legal/terms',
  search: '',
  push: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: null,
  isAuthenticated: false,
  logout: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => auth,
}));

vi.mock('@/components/NotificationCenter', () => ({
  default: () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderSignedOutLayout() {
  render(<Layout><div>Page content</div></Layout>);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));
  return screen.getAllByRole('link', { name: 'Sign up' });
}

describe('Layout registration links', () => {
  beforeEach(() => {
    navigation.pathname = '/legal/terms';
    navigation.search = '';
    navigation.push.mockClear();
  });

  it('restores a validated listing redirect from both desktop and mobile terms Sign up actions', () => {
    const listingRedirect = '/listings/new-york-city-vehicle-collisions-281a2b31';
    navigation.search = new URLSearchParams({ redirect: listingRedirect }).toString();

    const signUpLinks = renderSignedOutLayout();

    expect(signUpLinks).toHaveLength(2);
    for (const link of signUpLinks) {
      expect(link.getAttribute('href')).toBe(
        `/register?redirect=${encodeURIComponent(listingRedirect)}`
      );
    }
  });

  it.each([
    ['an ordinary terms visit', ''],
    ['an external redirect', new URLSearchParams({ redirect: 'https://evil.example/listings/stolen' }).toString()],
    ['a protocol-relative redirect', new URLSearchParams({ redirect: '//evil.example/listings/stolen' }).toString()],
    ['a malformed redirect', 'redirect=%E0%A4%A'],
    ['a valid non-listing redirect', new URLSearchParams({ redirect: '/dashboard?tab=orders' }).toString()],
    ['a non-detail listing redirect', new URLSearchParams({ redirect: '/listings' }).toString()],
    ['a nested listing path', new URLSearchParams({ redirect: '/listings/safe/extra' }).toString()],
  ])('keeps both terms Sign up actions generic for %s', (_label, search) => {
    navigation.search = search;

    const signUpLinks = renderSignedOutLayout();

    expect(signUpLinks).toHaveLength(2);
    for (const link of signUpLinks) {
      expect(link.getAttribute('href')).toBe('/register');
    }
  });

  it.each([
    '/pricing',
    '/legal/terms/accept',
    '/legal/terms/',
  ])('keeps global Sign up actions generic on the exact path %s', (pathname) => {
    navigation.pathname = pathname;
    navigation.search = new URLSearchParams({ redirect: '/listings/ignored' }).toString();

    const signUpLinks = renderSignedOutLayout();

    expect(signUpLinks).toHaveLength(2);
    for (const link of signUpLinks) {
      expect(link.getAttribute('href')).toBe('/register');
    }
  });
});
