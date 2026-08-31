// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import RegisterForm from './RegisterForm';

const authStore = vi.hoisted(() => ({
  register: vi.fn(),
}));

const toastApi = vi.hoisted(() => ({
  toast: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  search: '',
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: <T,>(selector: (state: typeof authStore) => T) => selector(authStore),
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => toastApi,
}));

vi.mock('@/components/OAuthButtons', () => ({
  default: ({ mode }: { mode: string }) => <div data-testid="oauth-buttons">{mode}</div>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('RegisterForm', () => {
  beforeEach(() => {
    navigation.search = '';
    authStore.register.mockResolvedValue(undefined);
    toastApi.toast.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not render role selection or company signup fields', () => {
    render(<RegisterForm />);

    expect(screen.queryByText('I want to buy data')).toBeNull();
    expect(screen.queryByText('I want to sell data')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByLabelText(/company name/i)).toBeNull();
    expect(screen.getByTestId('oauth-buttons').textContent).toBe('register');

    const dashboardLink = screen.getByRole('link', { name: 'dashboard' });
    expect(dashboardLink.getAttribute('href')).toBe('/dashboard');
  });

  it('submits every registration as a buyer without company name and keeps the verify-email success banner', async () => {
    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(authStore.register).toHaveBeenCalledWith(
        'ada@example.com',
        'password123',
        'Ada',
        'Lovelace',
        'buyer',
        undefined
      );
    });

    expect(toastApi.toast).toHaveBeenCalledWith(
      'Account created. Check your email to verify your account.',
      'success'
    );
    expect(
      await screen.findByText(/Account created\. We sent a verification link to ada@example\.com\./i)
    ).not.toBeNull();
    expect(screen.queryByText('Registration failed.')).toBeNull();
    expect(screen.getByRole('link', { name: 'sign in' }).getAttribute('href')).toBe('/login');
  });

  it('shows listing purchase context and preserves the validated redirect in both login links', async () => {
    const listingRedirect = '/listings/signed-out-dataset?offer=annual';
    navigation.search = new URLSearchParams({ redirect: listingRedirect }).toString();

    render(<RegisterForm />);

    expect(screen.getByText(/account or signing in does not charge you/i)).not.toBeNull();
    expect(screen.getByText(/after you sign in, you will return to this listing/i)).not.toBeNull();
    expect(screen.getByText(/final total, including payment-provider costs and applicable tax/i)).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back to listing' }).getAttribute('href')).toBe(listingRedirect);
    expect(screen.getByRole('link', { name: 'Pricing' }).getAttribute('href')).toBe('/pricing');
    expect(screen.getByRole('link', { name: 'Fees and terms' }).getAttribute('href')).toBe(
      `/legal/terms?redirect=${encodeURIComponent(listingRedirect)}#fees`
    );

    const loginHref = `/login?redirect=${encodeURIComponent(listingRedirect)}`;
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(loginHref);

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'buyer@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('link', { name: 'sign in' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'sign in' }).getAttribute('href')).toBe(loginHref);
  });

  it.each([
    ['/dashboard?tab=orders'],
    ['/listings'],
  ])('keeps valid non-detail registration behavior without purchase context for %s', (redirect) => {
    navigation.search = new URLSearchParams({ redirect }).toString();

    render(<RegisterForm />);

    expect(screen.queryByText(/account or signing in does not charge you/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to listing' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(
      `/login?redirect=${encodeURIComponent(redirect)}`
    );
  });

  it.each([
    ['an external redirect', new URLSearchParams({ redirect: 'https://evil.example/listings/stolen' }).toString()],
    ['a malformed encoded redirect', 'redirect=%E0%A4%A'],
  ])('does not expose purchase context or unsafe hrefs for %s', (_label, search) => {
    navigation.search = search;

    render(<RegisterForm />);

    expect(screen.queryByText(/account or signing in does not charge you/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to listing' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
  });
});
