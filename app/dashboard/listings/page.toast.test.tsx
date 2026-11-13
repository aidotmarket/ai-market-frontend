// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ListingsPage from './page';
import { ToastProvider } from '@/components/Toast';

const auth = vi.hoisted(() => ({ user: { id: 'seller-a' }, hydrated: true, isAuthenticated: true, isLoading: false }));
vi.mock('@/store/auth', () => ({ useAuthStore: Object.assign(() => auth, { getState: () => auth }) }));
const api = vi.hoisted(() => ({
  getMyListings: vi.fn(), getPendingSellerTermsListings: vi.fn(), unpublishListing: vi.fn(), deleteListing: vi.fn(),
}));
vi.mock('@/api/listings', () => api);
vi.mock('@/api/connect', () => ({ getConnectStatus: async () => ({ data: { payouts_enabled: true } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/legal/TermsGate', () => ({
  useTermsGate: () => ({ TermsGatePrompt: () => null, checkingTerms: false, ensureTermsAccepted: vi.fn() }),
}));
vi.mock('@/components/listings/SellerShareControls', () => ({ default: () => null }));

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

it.each([
  {
    detail: { error: 'capability_required', capability: 'seller', persisted_status: 'active',
      missing_steps: ['stripe_payouts_live'], reason: 'readiness_gap' },
    expected: 'Finish seller setup first: Stripe payouts, then try again.',
  },
  {
    detail: { error: 'unexpected_backend_failure', diagnostic: 'private backend details' },
    expected: "That didn't work. Please try again or contact support.",
  },
])('renders a plain-English unpublish toast through ToastProvider: $expected', async ({ detail, expected }) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.getMyListings.mockResolvedValue({ data: [{
    id: 'listing-1', title: 'Seller dataset', status: 'published', category: 'Research',
    price: 100, created_at: '2026-09-01T12:00:00Z',
  }] });
  api.getPendingSellerTermsListings.mockResolvedValue({ data: { count: 0, listings: [] } });
  api.unpublishListing.mockRejectedValue({ response: { status: 409, data: { detail } } });
  render(<ToastProvider><ListingsPage /></ToastProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
  const toast = await screen.findByRole('alert');
  expect(toast.textContent).toContain(expected);
  expect(toast.textContent).not.toMatch(/[{}]|capability_required|persisted_status|missing_steps|readiness_gap|private backend details/);
  expect(screen.getByText('Seller dataset')).toBeTruthy();
  expect(api.getMyListings).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Unpublish' }).hasAttribute('disabled')).toBe(false));
  if (detail.error === 'capability_required') {
    expect(screen.getByRole('link', { name: 'Finish seller setup' }).getAttribute('href')).toBe('/dashboard');
  }
});
