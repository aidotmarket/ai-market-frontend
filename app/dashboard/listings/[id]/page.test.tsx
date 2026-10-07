// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ListingPage from './page';
import { getMyListings, getSellerListing, getListingOwnership } from '@/api/listings';
import { getGatewayListingSource } from '@/api/sellerGateways';
import { getCloudflareVerifierStatus, getAwsVerifierStatus, setupAwsVerifier, type AWSVerifierStatus } from '@/api/dataVerificationGateway';
const auth = vi.hoisted(() => ({ user: { id: 'seller' }, isAuthenticated: true, hydrated: true }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));
vi.mock('@/api/listings', () => ({ getMyListings: vi.fn(), getSellerListing: vi.fn(), getListingOwnership: vi.fn() }));
vi.mock('@/api/sellerGateways', () => ({ getGatewayListingSource: vi.fn() }));
vi.mock('@/api/dataVerificationGateway', async importOriginal => ({ ...await importOriginal<typeof import('@/api/dataVerificationGateway')>(), getCloudflareVerifierStatus: vi.fn(), getAwsVerifierStatus: vi.fn(), setupAwsVerifier: vi.fn() }));
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
const awsStatus: AWSVerifierStatus = {
  state: 'none', eligible: true, connection_id: 'verified-aws-connection',
  runner_id: null, region: 'eu-north-1', code_sha256: null,
  registered_at: null, last_seen_at: null, poll_interval_minutes: 1, setup_expires_at: null,
};
async function page(id = 'listing') { const params = Promise.resolve({ id }); await act(async () => { render(<Suspense fallback={<p>Loading…</p>}><ListingPage params={params} /></Suspense>); await params; }); }
describe('seller listing verification entry', () => {
  beforeEach(() => {
    vi.resetAllMocks(); auth.isAuthenticated = true; auth.hydrated = true;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null } });
    vi.mocked(getMyListings).mockResolvedValue({ data: [] } as Awaited<ReturnType<typeof getMyListings>>);
    vi.mocked(getListingOwnership).mockResolvedValue(true);
    vi.mocked(getSellerListing).mockResolvedValue({ id: 'listing', title: 'My data', status: 'published' } as Awaited<ReturnType<typeof getSellerListing>>);
    vi.mocked(getGatewayListingSource).mockResolvedValue({ type: 'gateway', gateway_id: 'gateway', file_ids: ['a'.repeat(32)] });
    vi.mocked(getCloudflareVerifierStatus).mockResolvedValue({ eligible: false, connection_id: null } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue(awsStatus);
    vi.mocked(setupAwsVerifier).mockResolvedValue({ connection_id: 'verified-aws-connection', quick_create_url: 'https://console.aws.amazon.com/cloudformation/', expires_at_utc: '2026-10-05T12:30:00Z', scanner_version: '1.2.3', image_digest: 'sha256:hash' });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); Object.defineProperty(window, 'localStorage', originalStorage); });
  it('offers verification for an owned published gateway listing absent from the inventory', async () => {
    await page(); await screen.findByRole('heading', { name: 'Check verification availability' });
    expect(screen.getByText(/Check your data in your own gateway/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check data and get quote' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up the verifier' })).toBeNull();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
    expect(getGatewayListingSource).toHaveBeenCalledWith('listing');
    expect(getListingOwnership).toHaveBeenCalledWith('listing');
    expect(getMyListings).not.toHaveBeenCalled();
  });
  it('does not query a gateway or show verification for another seller’s listing', async () => {
    vi.mocked(getListingOwnership).mockResolvedValue(false);
    await page('someone-else'); await screen.findByText('This listing is not available.');
    expect(getGatewayListingSource).not.toHaveBeenCalled();
    expect(getSellerListing).not.toHaveBeenCalled();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
    expect(screen.queryByText(/Verify this data/)).toBeNull();
  });
  it('handles a server 404 without exposing cross-seller details', async () => {
    vi.mocked(getGatewayListingSource).mockRejectedValue({ response: { status: 404, data: { detail: 'unowned' } } });
    await page(); await screen.findByText('This listing is not available.');
    expect(screen.queryByText(/Verify this data/)).toBeNull();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
  });
  it('makes no seller calls while signed out', async () => {
    auth.isAuthenticated = false; await page(); await screen.findByRole('link', { name: 'Sign in' });
    expect(getListingOwnership).not.toHaveBeenCalled(); expect(getSellerListing).not.toHaveBeenCalled(); expect(getMyListings).not.toHaveBeenCalled(); expect(getGatewayListingSource).not.toHaveBeenCalled();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
  });
  it('offers verification for an eligible AWS listing and sets up its verified connection', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    const replace = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ opener: window, location: { replace }, close: vi.fn() } as unknown as Window);
    await page('aws-listing');
    fireEvent.click(await screen.findByRole('button', { name: 'Verify this data' }));
    const setup = await screen.findByRole('button', { name: 'Set up the verifier' });
    await waitFor(() => expect((setup as HTMLButtonElement).disabled).toBe(false));
    expect(getAwsVerifierStatus).toHaveBeenCalledWith('aws-listing');
    fireEvent.click(setup);
    expect(setupAwsVerifier).not.toHaveBeenCalled();
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, state: 'waiting' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm setup' }));
    await screen.findByText('Waiting for verifier');
    expect(setupAwsVerifier).toHaveBeenCalledExactlyOnceWith({ connection_id: 'verified-aws-connection' });
    expect(replace).toHaveBeenCalledWith('https://console.aws.amazon.com/cloudformation/');
  });
  it.each(['ineligible S3', 'other source'])('does not offer verification for an %s listing', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, eligible: false, connection_id: null });
    await page(); await screen.findByRole('heading', { name: 'My data' });
    expect(getAwsVerifierStatus).toHaveBeenCalledWith('listing');
    expect(screen.queryByText(/Verify this data/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not offer AWS verification without a connection ID', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, connection_id: null });
    await page(); await screen.findByRole('heading', { name: 'My data' });
    expect(screen.queryByText(/Verify this data/)).toBeNull();
  });
  it.each([
    ['404/unowned', { response: { status: 404, data: { detail: 'unowned' } } }],
    ['server error', { response: { status: 500 } }],
    ['network error', new Error('offline')],
  ])('hides verification without a listing error when AWS status returns %s', async (_label, error) => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockRejectedValue(error);
    await page(); await screen.findByRole('heading', { name: 'My data' });
    expect(screen.queryByText(/Verify this data|unowned|could not load|not available/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it.each(['gateway', 'aws'])('does not offer verification for a draft %s listing', async kind => {
    if (kind === 'aws') vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getSellerListing).mockResolvedValue({ id: 'listing', title: 'Draft data', status: 'draft' } as Awaited<ReturnType<typeof getSellerListing>>);
    await page(); await screen.findByRole('heading', { name: 'Draft data' }); expect(screen.queryByText(/Verify this data/)).toBeNull();
  });
  it.each([true, false])('uses Cloudflare server eligibility (%s) rather than source naming', async eligible => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, eligible: false });
    vi.mocked(getCloudflareVerifierStatus).mockResolvedValue({ eligible, connection_id: 'r2-connection', state: 'none' } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    await page('s3-looking-name'); await screen.findByRole('heading', { name: 'My data' });
    expect(getCloudflareVerifierStatus).toHaveBeenCalledWith('s3-looking-name');
    if (eligible) { fireEvent.click(screen.getByRole('button', { name: 'Verify this data' })); await screen.findByRole('heading', { name: 'Cloudflare verifier' }); }
    else expect(screen.queryByText('Verify this data')).toBeNull();
  });
  it('hides Cloudflare verification when status has no registered connection pair', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, eligible: false });
    vi.mocked(getCloudflareVerifierStatus).mockResolvedValue({ eligible: true, connection_id: null } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    await page(); await screen.findByRole('heading', { name: 'My data' }); expect(screen.queryByText('Verify this data')).toBeNull();
  });
});
