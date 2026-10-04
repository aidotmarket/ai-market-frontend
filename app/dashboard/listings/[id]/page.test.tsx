// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ListingPage from './page';
import { getMyListings } from '@/api/listings';
import { getGatewayListingSource } from '@/api/sellerGateways';
const auth = vi.hoisted(() => ({ user: { id: 'seller' }, isAuthenticated: true, hydrated: true }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));
vi.mock('@/api/listings', () => ({ getMyListings: vi.fn() }));
vi.mock('@/api/sellerGateways', () => ({ getGatewayListingSource: vi.fn() }));
vi.mock('@/components/listings/GatewayVerificationFlow', () => ({ default: ({ listingId, sellerId }: { listingId: string; sellerId: string }) => <p>Verify this data: {listingId} / {sellerId}</p> }));
async function page(id = 'listing') { const params = Promise.resolve({ id }); await act(async () => { render(<Suspense fallback={<p>Loading…</p>}><ListingPage params={params} /></Suspense>); await params; }); }
describe('seller listing verification entry', () => {
  beforeEach(() => {
    vi.clearAllMocks(); auth.isAuthenticated = true; auth.hydrated = true;
    vi.mocked(getMyListings).mockResolvedValue({ data: [{ id: 'listing', title: 'My data', status: 'published', slug: 'my-data' }] } as Awaited<ReturnType<typeof getMyListings>>);
    vi.mocked(getGatewayListingSource).mockResolvedValue({ type: 'gateway', gateway_id: 'gateway', file_ids: ['a'.repeat(32)] });
  });
  afterEach(cleanup);
  it('offers verification for an owned published gateway listing', async () => {
    await page(); await screen.findByText('Verify this data: listing / seller');
    expect(getGatewayListingSource).toHaveBeenCalledWith('listing');
  });
  it('does not query a gateway or show verification for another seller’s listing', async () => {
    await page('someone-else'); await screen.findByText('This listing is not available.');
    expect(getGatewayListingSource).not.toHaveBeenCalled();
    expect(screen.queryByText(/Verify this data/)).toBeNull();
  });
  it('handles a server 404 without exposing cross-seller details', async () => {
    vi.mocked(getGatewayListingSource).mockRejectedValue({ response: { status: 404, data: { detail: 'unowned' } } });
    await page(); await screen.findByText('This listing is not available.');
    expect(screen.queryByText(/Verify this data/)).toBeNull();
  });
  it('makes no seller calls while signed out', async () => {
    auth.isAuthenticated = false; await page(); await screen.findByRole('link', { name: 'Sign in' });
    expect(getMyListings).not.toHaveBeenCalled(); expect(getGatewayListingSource).not.toHaveBeenCalled();
  });
  it('does not offer verification for a draft or a non-gateway listing', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    await page(); await screen.findByRole('heading', { name: 'My data' }); expect(screen.queryByText(/Verify this data/)).toBeNull();
    cleanup(); vi.mocked(getGatewayListingSource).mockResolvedValue({ type: 'gateway', gateway_id: 'gateway', file_ids: [] });
    vi.mocked(getMyListings).mockResolvedValue({ data: [{ id: 'listing', title: 'Draft data', status: 'draft' }] } as Awaited<ReturnType<typeof getMyListings>>);
    await page(); await screen.findByRole('heading', { name: 'Draft data' }); expect(screen.queryByText(/Verify this data/)).toBeNull();
  });
});
