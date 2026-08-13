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
  it('renders the existing registration CTA when unauthenticated', () => {
    render(<SellDataCta variant="inline" />);

    expect(screen.getByRole('link', { name: 'Create Your Account' }).getAttribute('href')).toBe('/register');
    expect(screen.queryByRole('link', { name: 'Set up AIM Data' })).toBeNull();
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

    expect(screen.getByRole('link', { name: 'Set up AIM Data' }).getAttribute('href')).toBe('/aim-data');
    expect(screen.getByRole('link', { name: 'Your listings' }).getAttribute('href')).toBe('/dashboard/listings');
    expect(screen.queryByRole('link', { name: 'Create Your Account' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'List your data' })).toBeTruthy();
    expect(screen.getByText('Install AIM Data on your infrastructure, review what it writes, and publish.')).toBeTruthy();
  });

  it('keeps the how-it-works anchor in the authenticated hero variant', () => {
    mocks.auth.isAuthenticated = true;

    render(<SellDataCta variant="hero" />);

    expect(screen.getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#how-it-works');
    expect(screen.getByRole('link', { name: 'Set up AIM Data' }).getAttribute('href')).toBe('/aim-data');
    expect(screen.getByRole('link', { name: 'Your listings' }).getAttribute('href')).toBe('/dashboard/listings');
    expect(screen.queryByRole('link', { name: 'Create Your Account' })).toBeNull();
  });
});
