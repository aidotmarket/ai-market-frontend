// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => mocks.auth,
}));

import SellDataCta from './SellDataCta';

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
});

afterEach(cleanup);

describe('SellDataCta', () => {
  it.each(['hero', 'inline', 'final'] as const)('keeps registration for signed-out %s CTAs', (variant) => {
    render(<SellDataCta variant={variant} />);

    expect(screen.getByRole('link', { name: 'Create Your Account' }).getAttribute('href')).toBe('/register');
    expect(screen.queryByRole('link', { name: 'Set up a gateway' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Your listings' })).toBeNull();
  });

  it('keeps the existing final-section copy when unauthenticated', () => {
    render(<SellDataCta variant="final" />);

    expect(screen.getByRole('heading', { name: 'Create Your Account' })).toBeTruthy();
    expect(screen.getByText('Start as a seller. List free and pay nothing until a sale clears.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create Your Account' }).getAttribute('href')).toBe('/register');
  });

  it('renders seller paths and authenticated final-section copy without a registration link', () => {
    mocks.auth.isAuthenticated = true;

    render(<SellDataCta variant="final" />);

    expect(screen.getByRole('link', { name: 'Open Seller Workspace' }).getAttribute('href')).toBe('/dashboard/seller-workspace');
    expect(screen.getByRole('link', { name: 'Set up a gateway' }).getAttribute('href')).toBe('/dashboard/gateways');
    expect(screen.getByRole('link', { name: 'Your listings' }).getAttribute('href')).toBe('/dashboard/listings');
    expect(screen.queryByRole('link', { name: 'Create Your Account' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'List your data' })).toBeTruthy();
    expect(screen.getByText('Connect your cloud bucket or set up an AIM Data gateway. Manage your listing, prices, licences, and payouts here.')).toBeTruthy();
  });

  it('offers both paths in the authenticated inline variant', () => {
    mocks.auth.isAuthenticated = true;
    render(<SellDataCta variant="inline" />);
    expect(screen.getByRole('link', { name: 'Open Seller Workspace' }).getAttribute('href')).toBe('/dashboard/seller-workspace');
    expect(screen.getByRole('link', { name: 'Set up a gateway' }).getAttribute('href')).toBe('/dashboard/gateways');
    expect(screen.getByRole('link', { name: 'Your listings' }).getAttribute('href')).toBe('/dashboard/listings');
  });

  it('keeps the how-it-works anchor in the authenticated hero variant', () => {
    mocks.auth.isAuthenticated = true;

    render(<SellDataCta variant="hero" />);

    expect(screen.getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#how-it-works');
    expect(screen.getByRole('link', { name: 'Open Seller Workspace' }).getAttribute('href')).toBe('/dashboard/seller-workspace');
    expect(screen.getByRole('link', { name: 'Set up a gateway' }).getAttribute('href')).toBe('/dashboard/gateways');
    expect(screen.getByRole('link', { name: 'Your listings' }).getAttribute('href')).toBe('/dashboard/listings');
    expect(screen.queryByRole('link', { name: 'Create Your Account' })).toBeNull();
  });
});
