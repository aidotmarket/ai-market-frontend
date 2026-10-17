// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ListingsPage from './page';

const api = vi.hoisted(() => ({
  getMyListings: vi.fn(),
  getPendingSellerTermsListings: vi.fn(),
  getConnectStatus: vi.fn(),
  unpublishListing: vi.fn(),
  deleteListing: vi.fn(),
}));
const legal = vi.hoisted(() => ({ getCurrentTerms: vi.fn() }));
vi.mock('@/api/legal', () => legal);
const termsGate = vi.hoisted(() => vi.fn(() => ({ TermsGatePrompt: () => null, checkingTerms: false, ensureTermsAccepted: vi.fn() })));
vi.mock('@/api/listings', () => api);
vi.mock('@/api/connect', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/legal/TermsGate', () => ({
  useTermsGate: termsGate,
}));
vi.mock('@/components/listings/SellerShareControls', () => ({ default: () => null }));

beforeEach(() => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' });
  api.getMyListings.mockResolvedValue({ data: [{
    id: 'listing-1', title: 'Seller dataset', status: 'published',
    category: 'Research', price: 100, created_at: '2026-09-01T12:00:00Z',
  }] });
  api.getConnectStatus.mockResolvedValue({ data: { payouts_enabled: true } });
  api.getPendingSellerTermsListings.mockResolvedValue({ data: { count: 0, listings: [] } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('renders listings with enabled payouts on the happy path', async () => {
  render(<ListingsPage />);
  expect(await screen.findByText('Seller dataset')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Seller dataset' }).getAttribute('href')).toBe('/dashboard/listings/listing-1');
  expect(screen.queryByText(/Finish payout setup/)).toBeNull();
});

it('shows the payout setup warning when Connect confirms disabled payouts', async () => {
  api.getConnectStatus.mockResolvedValue({ data: { payouts_enabled: false } });
  render(<ListingsPage />);
  expect(await screen.findByText('Seller dataset')).toBeTruthy();
  expect(screen.getByText(/Finish payout setup/)).toBeTruthy();
});

const publicReference = {
  url: 'https://example.org/emissions', label: 'Emissions and allowances',
  publisher: 'Public data agency', license_url: 'https://example.org/license',
  metadata_url: 'https://example.org/metadata',
};

it.each([
  ['disabled', publicReference],
  ['enabled', publicReference],
  ['unknown', publicReference],
  ['disabled', null],
  ['disabled', false],
  ['disabled', 'malformed'],
] as const)('describes an opted-in public reference with %s payouts and marker %j', async (payouts, marker) => {
  api.getMyListings.mockResolvedValue({ data: [{
    id: 'source-reference', title: 'Emissions and allowances', status: 'published',
    category: 'Science', price: 0, fulfillment_type: 'reference',
    source_delivery: { kind: 'public_url', url: 'https://example.org/emissions' },
    structured_metadata: { public_reference: marker }, created_at: '2026-09-01T12:00:00Z',
  }] });
  if (payouts === 'unknown') api.getConnectStatus.mockRejectedValue(new Error('Connect unavailable'));
  else api.getConnectStatus.mockResolvedValue({ data: { payouts_enabled: payouts === 'enabled' } });
  render(<ListingsPage />);
  const row = (await screen.findByRole('link', { name: 'Emissions and allowances' })).closest('tr')!;
  expect(within(row).getByText('Public source reference — no checkout.')).toBeTruthy();
  expect(within(row).queryByText(/Finish payout setup/)).toBeNull();
  expect(within(row).getByText('Published')).toBeTruthy();
  expect(within(row).getByRole('link').getAttribute('href')).toBe('/dashboard/listings/source-reference');
  for (const name of ['Edit', 'Unpublish', 'Delete']) expect(within(row).getByRole('button', { name })).toBeTruthy();
  expect(api.getMyListings).toHaveBeenCalledTimes(1);
  expect(api.getConnectStatus).toHaveBeenCalledTimes(1);
  expect(api.getPendingSellerTermsListings).toHaveBeenCalledTimes(1);
  expect(api.unpublishListing).not.toHaveBeenCalled();
  expect(api.deleteListing).not.toHaveBeenCalled();
});

it.each([
  undefined, null, {}, [], Object.assign([], { public_reference: null }),
  Object.create({ public_reference: {} }),
])('preserves payout warnings for legacy free references without an own metadata marker: %j', async (metadata) => {
  api.getMyListings.mockResolvedValue({ data: [{
    id: 'legacy-reference', title: 'Legacy reference', status: 'published',
    category: 'Research', price: 0, fulfillment_type: 'reference',
    structured_metadata: metadata, created_at: '2026-09-01T12:00:00Z',
  }] });
  api.getConnectStatus.mockResolvedValue({ data: { payouts_enabled: false } });
  render(<ListingsPage />);
  const row = (await screen.findByRole('link', { name: 'Legacy reference' })).closest('tr')!;
  expect(within(row).getByText(/Finish payout setup/)).toBeTruthy();
  expect(within(row).queryByText('Public source reference — no checkout.')).toBeNull();
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

it('prompts sellers with inherited listings to accept Terms 1.1', async () => {
  api.getPendingSellerTermsListings.mockResolvedValue({ data: { count: 1, listings: [{ id: 'listing-1', slug: 'seller-dataset', title: 'Seller dataset', status: 'published', license_status: 'pending_seller_terms' }] } });
  render(<ListingsPage />);
  const link = await screen.findByRole('link', { name: 'Review and accept Terms 1.1' });
  expect(link.getAttribute('href')).toBe('/legal/terms/accept?context=seller&redirect=%2Fdashboard%2Flistings');
  expect(termsGate).toHaveBeenCalledWith('seller');
  expect(screen.getByText(/not yet available to buy/)).toBeTruthy();
});

it('prompts inherited sellers with the backend-served 1.2 version', async () => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.2' });
  api.getPendingSellerTermsListings.mockResolvedValue({ data: { count: 1, listings: [] } });
  render(<ListingsPage />);
  const link = await screen.findByRole('link', { name: 'Review and accept Terms 1.2' });
  expect(link.getAttribute('href')).toBe('/legal/terms/accept?context=seller&redirect=%2Fdashboard%2Flistings');
  expect(screen.queryByText(/Terms 1.1/)).toBeNull();
});

it.each(['loading', 'failure'])('keeps the base Terms 1.1 prompt during metadata %s', async (state) => {
  if (state === 'loading') legal.getCurrentTerms.mockReturnValue(new Promise(() => {}));
  else legal.getCurrentTerms.mockRejectedValue(new Error('Metadata unavailable'));
  api.getPendingSellerTermsListings.mockResolvedValue({ data: { count: 1, listings: [] } });
  render(<ListingsPage />);
  expect(await screen.findByRole('link', { name: 'Review and accept Terms 1.1' })).toBeTruthy();
  expect(screen.getByText('Review and accept Terms 1.1 to make eligible listings available for purchase.')).toBeTruthy();
});
