// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ListingsPage from './page';

const api = vi.hoisted(() => ({
  getMyListings: vi.fn(),
  getConnectStatus: vi.fn(),
  unpublishListing: vi.fn(),
  deleteListing: vi.fn(),
}));
vi.mock('@/api/listings', () => api);
vi.mock('@/api/connect', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/legal/TermsGate', () => ({
  useTermsGate: () => ({ TermsGatePrompt: () => null, checkingTerms: false, ensureTermsAccepted: vi.fn() }),
}));
vi.mock('@/components/listings/SellerShareControls', () => ({ default: () => null }));

beforeEach(() => {
  api.getMyListings.mockResolvedValue({ data: [{
    id: 'listing-1', title: 'Seller dataset', status: 'published',
    category: 'Research', price: 100, created_at: '2026-09-01T12:00:00Z',
  }] });
  api.getConnectStatus.mockResolvedValue({ data: { payouts_enabled: true } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('renders listings with enabled payouts on the happy path', async () => {
  render(<ListingsPage />);
  expect(await screen.findByText('Seller dataset')).toBeTruthy();
  expect(screen.queryByText(/Finish payout setup/)).toBeNull();
});

it('shows the payout setup warning when Connect confirms disabled payouts', async () => {
  api.getConnectStatus.mockResolvedValue({ data: { payouts_enabled: false } });
  render(<ListingsPage />);
  expect(await screen.findByText('Seller dataset')).toBeTruthy();
  expect(screen.getByText(/Finish payout setup/)).toBeTruthy();
});

it.each([403, 500])('renders listings with unknown payouts after Connect returns %s', async (status) => {
  api.getConnectStatus.mockRejectedValue({ response: { status } });
  render(<ListingsPage />);
  expect(await screen.findByText('Seller dataset')).toBeTruthy();
  expect(screen.queryByText('Failed to load listings.')).toBeNull();
  expect(screen.queryByText(/Finish payout setup/)).toBeNull();
});

it('shows the listings error when listings fail', async () => {
  api.getMyListings.mockRejectedValue(new Error('Listings unavailable'));
  render(<ListingsPage />);
  expect(await screen.findByText('Failed to load listings.')).toBeTruthy();
  expect(screen.queryByText('Seller dataset')).toBeNull();
});
