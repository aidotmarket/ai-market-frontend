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
async function page(id = 'listing') {
  const params = Promise.resolve({ id });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<Suspense fallback={<p>Loading…</p>}><ListingPage params={params} /></Suspense>); await params; });
  return view;
}
async function rerenderPage(view: ReturnType<typeof render>, id: string) {
  const params = Promise.resolve({ id });
  await act(async () => { view.rerender(<Suspense fallback={<p>Loading…</p>}><ListingPage params={params} /></Suspense>); await params; });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const optionalOptions = { timeout: 10_000, signal: expect.any(AbortSignal) };
describe('seller listing verification entry', () => {
  it.each(['unlisted', 'hidden', 'withdrawn', 'held', 'suspended'])('retains the authenticated owner view for %s listings', async status => {
    vi.mocked(getSellerListing).mockResolvedValue({ id: 'listing', title: 'My retained listing', status } as Awaited<ReturnType<typeof getSellerListing>>);
    await page();
    expect(await screen.findByRole('heading', { name: 'My retained listing' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit listing' }).getAttribute('href')).toBe('/dashboard/listings/listing/edit');
    expect(screen.getByText('Your private owner view remains available when this listing is not public.')).toBeTruthy();
    expect(getListingOwnership).toHaveBeenCalledWith('listing');
    expect(getSellerListing).toHaveBeenCalledWith('listing');
    expect(screen.queryByRole('heading', { name: 'Check verification availability' })).toBeNull();
  });
  beforeEach(() => {
    vi.resetAllMocks(); auth.user = { id: 'seller' }; auth.isAuthenticated = true; auth.hydrated = true;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null } });
    vi.mocked(getMyListings).mockResolvedValue({ data: [] } as Awaited<ReturnType<typeof getMyListings>>);
    vi.mocked(getListingOwnership).mockResolvedValue(true);
    vi.mocked(getSellerListing).mockResolvedValue({ id: 'listing', title: 'My data', status: 'published' } as Awaited<ReturnType<typeof getSellerListing>>);
    vi.mocked(getGatewayListingSource).mockResolvedValue({ type: 'gateway', gateway_id: 'gateway', file_ids: ['a'.repeat(32)] });
    vi.mocked(getCloudflareVerifierStatus).mockResolvedValue({ eligible: false, connection_id: null } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue(awsStatus);
    vi.mocked(setupAwsVerifier).mockResolvedValue({ connection_id: 'verified-aws-connection', quick_create_url: 'https://console.aws.amazon.com/cloudformation/', expires_at_utc: '2026-10-05T12:30:00Z', scanner_version: '1.2.3', image_digest: 'sha256:hash' });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); Object.defineProperty(window, 'localStorage', originalStorage); });
  it('offers verification for an owned published gateway listing absent from the inventory', async () => {
    await page(); await screen.findByRole('heading', { name: 'Check verification availability' });
    expect(screen.getByText(/Check your data in your own gateway/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check data and get quote' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up the verifier' })).toBeNull();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
    expect(getGatewayListingSource).toHaveBeenCalledWith('listing', optionalOptions);
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
  it('handles a core listing 404 without exposing cross-seller details', async () => {
    vi.mocked(getSellerListing).mockRejectedValue({ response: { status: 404, data: { detail: 'unowned' } } });
    await page(); await screen.findByText('This listing is not available.');
    expect(screen.queryByText(/Verify this data/)).toBeNull();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
  });
  it('makes no seller calls while signed out', async () => {
    auth.isAuthenticated = false; await page(); await screen.findByRole('link', { name: 'Sign in' });
    expect(getListingOwnership).not.toHaveBeenCalled(); expect(getSellerListing).not.toHaveBeenCalled(); expect(getMyListings).not.toHaveBeenCalled(); expect(getGatewayListingSource).not.toHaveBeenCalled();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
  });
  it('keeps the opened verification panel when a token refresh replaces the user object', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    const params = Promise.resolve({ id: 'listing' });
    const tree = <Suspense fallback={<p>Loading…</p>}><ListingPage params={params} /></Suspense>;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(tree); await params; });
    fireEvent.click(await screen.findByRole('button', { name: 'Verify this data' }));
    await screen.findByRole('heading', { level: 2 });
    auth.user = { id: 'seller' };
    await act(async () => { view.rerender(<Suspense fallback={<p>Loading…</p>}><ListingPage params={params} /></Suspense>); });
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verify this data' })).toBeNull();
    expect(getListingOwnership).toHaveBeenCalledTimes(1);
  });
  it('offers verification for an eligible AWS listing and sets up its verified connection', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    const replace = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ opener: window, location: { replace }, close: vi.fn() } as unknown as Window);
    await page('aws-listing');
    fireEvent.click(await screen.findByRole('button', { name: 'Verify this data' }));
    const setup = await screen.findByRole('button', { name: 'Set up the verifier' });
    await waitFor(() => expect((setup as HTMLButtonElement).disabled).toBe(false));
    expect(getAwsVerifierStatus).toHaveBeenCalledWith('aws-listing', optionalOptions);
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
    expect(getAwsVerifierStatus).toHaveBeenCalledWith('listing', optionalOptions);
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
    expect(getCloudflareVerifierStatus).toHaveBeenCalledWith('s3-looking-name', optionalOptions);
    if (eligible) { fireEvent.click(screen.getByRole('button', { name: 'Verify this data' })); await screen.findByRole('heading', { name: 'Cloudflare verifier' }); }
    else expect(screen.queryByText('Verify this data')).toBeNull();
  });
  it('hides Cloudflare verification when status has no registered connection pair', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, eligible: false });
    vi.mocked(getCloudflareVerifierStatus).mockResolvedValue({ eligible: true, connection_id: null } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    await page(); await screen.findByRole('heading', { name: 'My data' }); expect(screen.queryByText('Verify this data')).toBeNull();
  });

  it.each(['AWS', 'Cloudflare', 'both'])('renders the core listing while %s status never settles, then fails closed', async kind => {
    vi.useFakeTimers();
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, eligible: false });
    const aws = deferred<Awaited<ReturnType<typeof getAwsVerifierStatus>>>();
    const cloudflare = deferred<Awaited<ReturnType<typeof getCloudflareVerifierStatus>>>();
    if (kind !== 'Cloudflare') vi.mocked(getAwsVerifierStatus).mockReturnValue(aws.promise);
    if (kind !== 'AWS') vi.mocked(getCloudflareVerifierStatus).mockReturnValue(cloudflare.promise);
    await page();
    expect(screen.getByRole('heading', { name: 'My data' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit listing' }).getAttribute('href')).toBe('/dashboard/listings/listing/edit');
    expect(getAwsVerifierStatus).toHaveBeenCalledExactlyOnceWith('listing', optionalOptions);
    expect(getCloudflareVerifierStatus).toHaveBeenCalledExactlyOnceWith('listing', optionalOptions);
    for (const provider of kind === 'both' ? ['AWS', 'Cloudflare'] : [kind]) {
      expect(screen.getByText(`Loading ${provider} verification status…`)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Verify this data' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    for (const provider of kind === 'both' ? ['AWS', 'Cloudflare'] : [kind]) {
      expect(screen.getByText(`${provider} verification status is unavailable.`)).toBeTruthy();
    }
    if (kind !== 'Cloudflare') expect(vi.mocked(getAwsVerifierStatus).mock.calls[0][1]?.signal?.aborted).toBe(true);
    if (kind !== 'AWS') expect(vi.mocked(getCloudflareVerifierStatus).mock.calls[0][1]?.signal?.aborted).toBe(true);
    // Even an eligible response arriving after the deadline cannot enable actions.
    await act(async () => {
      aws.resolve(awsStatus);
      cloudflare.resolve({ eligible: true, connection_id: 'late-r2' } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    });
    expect(screen.getByRole('heading', { name: 'My data' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verify this data' })).toBeNull();
    expect(setupAwsVerifier).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loads Cloudflare independently of a never-settling AWS status', async () => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockReturnValue(new Promise(() => {}));
    vi.mocked(getCloudflareVerifierStatus).mockResolvedValue({ eligible: true, connection_id: 'r2-connection' } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    await page();
    fireEvent.click(screen.getByRole('button', { name: 'Verify this data' }));
    expect(screen.getByRole('heading', { name: 'Cloudflare verifier' })).toBeTruthy();
    expect(screen.getByText('Loading AWS verification status…')).toBeTruthy();
  });

  it('does not select AWS when the higher-priority Cloudflare eligibility is unknown', async () => {
    vi.useFakeTimers();
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getCloudflareVerifierStatus).mockReturnValue(new Promise(() => {}));
    await page();
    expect(screen.queryByRole('button', { name: 'Verify this data' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText('Cloudflare verification status is unavailable.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verify this data' })).toBeNull();
  });

  it.each(['AWS', 'Cloudflare'])('keeps the listing visible when %s status rejects', async provider => {
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, eligible: false });
    vi.mocked(provider === 'AWS' ? getAwsVerifierStatus : getCloudflareVerifierStatus).mockRejectedValue(new Error('private details'));
    await page();
    expect(screen.getByRole('heading', { name: 'My data' })).toBeTruthy();
    expect(screen.getByText(`${provider} verification status is unavailable.`)).toBeTruthy();
    expect(screen.queryByText(/private details|could not load your listing/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verify this data' })).toBeNull();
  });

  it.each(['timeout', 'rejection'])('keeps the core listing visible on gateway source %s', async failure => {
    vi.useFakeTimers();
    vi.mocked(getGatewayListingSource).mockImplementation(() => failure === 'timeout' ? new Promise(() => {}) : Promise.reject({ response: { status: 404, data: { detail: 'unowned' } } }));
    await page();
    expect(screen.getByRole('heading', { name: 'My data' })).toBeTruthy();
    if (failure === 'timeout') expect(screen.getByText('Loading verification availability…')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText('Verification availability is unavailable.')).toBeTruthy();
    expect(screen.queryByText(/unowned|could not load your listing/)).toBeNull();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
    expect(getCloudflareVerifierStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(['id', 'user'])('ignores late optional responses after a change of %s', async change => {
    const oldAws = deferred<Awaited<ReturnType<typeof getAwsVerifierStatus>>>();
    const oldCloudflare = deferred<Awaited<ReturnType<typeof getCloudflareVerifierStatus>>>();
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockReturnValueOnce(oldAws.promise).mockResolvedValue({ ...awsStatus, eligible: false });
    vi.mocked(getCloudflareVerifierStatus).mockReturnValueOnce(oldCloudflare.promise);
    const view = await page();
    const awsSignal = vi.mocked(getAwsVerifierStatus).mock.calls[0][1]?.signal;
    const cloudflareSignal = vi.mocked(getCloudflareVerifierStatus).mock.calls[0][1]?.signal;
    const nextId = change === 'id' ? 'next-listing' : 'listing';
    if (change === 'user') auth.user = { id: 'next-seller' };
    vi.mocked(getSellerListing).mockResolvedValue({ id: nextId, title: 'Next data', status: 'published' } as Awaited<ReturnType<typeof getSellerListing>>);
    await rerenderPage(view, nextId);
    expect(awsSignal?.aborted).toBe(true);
    expect(cloudflareSignal?.aborted).toBe(true);
    await act(async () => {
      oldAws.resolve(awsStatus);
      oldCloudflare.resolve({ eligible: true, connection_id: 'old-r2' } as Awaited<ReturnType<typeof getCloudflareVerifierStatus>>);
    });
    expect(screen.getByRole('heading', { name: 'Next data' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit listing' }).getAttribute('href')).toBe(`/dashboard/listings/${nextId}/edit`);
    expect(screen.queryByText('My data')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verify this data' })).toBeNull();
    expect(getListingOwnership).toHaveBeenCalledTimes(2);
  });

  it.each(['id', 'user'])('ignores a late gateway source after a change of %s', async change => {
    const source = deferred<Awaited<ReturnType<typeof getGatewayListingSource>>>();
    vi.mocked(getGatewayListingSource).mockReturnValueOnce(source.promise).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, eligible: false });
    const view = await page();
    if (change === 'user') auth.user = { id: 'next-seller' };
    await rerenderPage(view, change === 'id' ? 'next-listing' : 'listing');
    await act(async () => { source.resolve({ type: 'gateway', gateway_id: 'old-gateway', file_ids: [] }); });
    expect(screen.queryByRole('button')).toBeNull();
    expect(getAwsVerifierStatus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ownership', 'id'], ['ownership', 'user'], ['core listing', 'id'], ['core listing', 'user'],
  ])('ignores a late %s read after a change of %s', async (stage, change) => {
    const ownership = deferred<boolean>();
    const listing = deferred<Awaited<ReturnType<typeof getSellerListing>>>();
    if (stage === 'ownership') vi.mocked(getListingOwnership).mockReturnValueOnce(ownership.promise);
    else vi.mocked(getSellerListing).mockReturnValueOnce(listing.promise);
    const view = await page();
    expect(screen.getByText('Loading your listing…')).toBeTruthy();
    expect(getGatewayListingSource).not.toHaveBeenCalled();
    if (change === 'user') auth.user = { id: 'next-seller' };
    vi.mocked(getSellerListing).mockResolvedValue({ id: 'next-listing', title: 'Next data', status: 'draft' } as Awaited<ReturnType<typeof getSellerListing>>);
    await rerenderPage(view, change === 'id' ? 'next-listing' : 'listing');
    await act(async () => {
      ownership.resolve(true);
      listing.resolve({ id: 'listing', title: 'Old private data', status: 'published' } as Awaited<ReturnType<typeof getSellerListing>>);
    });
    expect(screen.getByRole('heading', { name: 'Next data' })).toBeTruthy();
    expect(screen.queryByText('Old private data')).toBeNull();
    expect(getSellerListing).toHaveBeenCalledTimes(stage === 'ownership' ? 1 : 2);
    expect(getGatewayListingSource).toHaveBeenCalledTimes(1);
  });

  it('aborts optional reads and clears their deadlines on unmount', async () => {
    vi.useFakeTimers();
    vi.mocked(getGatewayListingSource).mockResolvedValue(null);
    vi.mocked(getAwsVerifierStatus).mockReturnValue(new Promise(() => {}));
    vi.mocked(getCloudflareVerifierStatus).mockReturnValue(new Promise(() => {}));
    const view = await page();
    // The rendered links can also schedule prefetch work; count only the two
    // optional deadlines removed by cleanup rather than all UI timers.
    const timersBeforeUnmount = vi.getTimerCount();
    view.unmount();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(timersBeforeUnmount - 2);
    expect(vi.mocked(getAwsVerifierStatus).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.mocked(getCloudflareVerifierStatus).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('waits for ownership before starting any private reads', async () => {
    const ownership = deferred<boolean>();
    vi.mocked(getListingOwnership).mockReturnValue(ownership.promise);
    await page();
    expect(getSellerListing).not.toHaveBeenCalled();
    expect(getGatewayListingSource).not.toHaveBeenCalled();
    expect(getAwsVerifierStatus).not.toHaveBeenCalled();
    expect(getCloudflareVerifierStatus).not.toHaveBeenCalled();
    await act(async () => { ownership.resolve(false); });
    expect(screen.getByText('This listing is not available.')).toBeTruthy();
    expect(getSellerListing).not.toHaveBeenCalled();
  });
});
