// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ListingsPage from './page';

const auth = vi.hoisted(() => ({ user: { id: 'seller-a' }, hydrated: true, isAuthenticated: true, isLoading: false }));
vi.mock('@/store/auth', () => ({ useAuthStore: Object.assign(() => auth, { getState: () => auth }) }));
const navigation = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn(), accept: vi.fn() }));
const api = vi.hoisted(() => ({
  getMyListings: vi.fn(),
  getPendingSellerTermsListings: vi.fn(),
  getConnectStatus: vi.fn(),
  unpublishListing: vi.fn(),
  deleteListing: vi.fn(),
}));
const legal = vi.hoisted(() => ({ getCurrentTerms: vi.fn() }));
vi.mock('@/api/legal', () => legal);
const termsGate = vi.hoisted(() => vi.fn(() => ({ TermsGatePrompt: () => null, checkingTerms: false, ensureTermsAccepted: navigation.accept })));
vi.mock('@/api/listings', () => api);
vi.mock('@/api/connect', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: navigation.push }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: navigation.toast }) }));
vi.mock('@/components/legal/TermsGate', () => ({
  useTermsGate: termsGate,
}));
vi.mock('@/components/listings/SellerShareControls', () => ({ default: ({ listingId }: { listingId: string }) => <span data-testid={`share-${listingId}`}>Share controls</span> }));

beforeEach(() => {
  Object.assign(auth, { user: { id: 'seller-a' }, hydrated: true, isAuthenticated: true, isLoading: false });
  navigation.accept.mockImplementation((action: () => void) => action());
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

// Equal timestamps deliberately retain the stable backend-provided ID order.
// These component mocks do not prove database ordering or old-server compatibility.
function rows(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${start + i}`, title: `Owner row ${start + i}`, status: 'unlisted',
    category: 'Research', price: 1, created_at: '2026-09-01T12:00:00Z',
  }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

it('reaches older rows in backend order, hides each sentinel, and returns from the last page', async () => {
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) })
    .mockResolvedValueOnce({ data: rows(21, 21) })
    .mockResolvedValueOnce({ data: rows(41, 3) })
    .mockResolvedValueOnce({ data: rows(21, 21) });
  render(<ListingsPage />);
  await screen.findByText('Owner row 1');
  expect(button('Previous').disabled).toBe(true);
  expect(screen.queryByText('Owner row 21')).toBeNull();
  expect(screen.getByText('Page 1 · Showing 1–20')).toBeTruthy();
  expect(screen.getAllByRole('row').slice(1).map(row => within(row).getByRole('link').textContent))
    .toEqual(rows(1, 20).map(row => row.title));
  fireEvent.click(button('Next'));
  await screen.findByText('Owner row 21');
  expect(screen.queryByText('Owner row 41')).toBeNull();
  fireEvent.click(button('Next'));
  await screen.findByText('Owner row 43');
  expect(screen.getByText('Page 3 · Showing 41–43')).toBeTruthy();
  expect(button('Next').disabled).toBe(true);
  fireEvent.click(button('Previous'));
  await screen.findByText('Owner row 21');
  expect(api.getMyListings.mock.calls).toEqual([
    [{ skip: 0, limit: 21 }], [{ skip: 20, limit: 21 }],
    [{ skip: 40, limit: 21 }], [{ skip: 20, limit: 21 }],
  ]);
});

it.each([0, 20, 21])('uses only a real sentinel for the %s-row first-page boundary', async count => {
  api.getMyListings.mockResolvedValue({ data: rows(1, count) });
  render(<ListingsPage />);
  await waitFor(() => expect(screen.queryByText('Loading listings...')).toBeNull());
  expect(screen.queryAllByRole('row').length).toBe(count === 0 ? 0 : 21);
  expect(button('Next').disabled).toBe(count !== 21);
  expect(button('Previous').disabled).toBe(true);
  if (count === 0) expect(screen.getByText('No listings yet')).toBeTruthy();
});

it('keeps Previous reachable on an empty later page without automatically reading again', async () => {
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) }).mockResolvedValueOnce({ data: [] })
    .mockResolvedValueOnce({ data: rows(1, 20) });
  render(<ListingsPage />); await screen.findByText('Owner row 1');
  fireEvent.click(button('Next')); await screen.findByText('No listings on this page');
  expect(screen.queryByText('No listings yet')).toBeNull();
  expect(button('Previous').disabled).toBe(false);
  expect(button('Next').disabled).toBe(true);
  expect(api.getMyListings).toHaveBeenCalledTimes(2);
  fireEvent.click(button('Previous')); await screen.findByText('Owner row 1');
});

it('blocks duplicate Next and makes a failed page explicit with manual retry', async () => {
  const pending = deferred<{ data: ReturnType<typeof rows> }>();
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) }).mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ data: rows(21, 1) });
  render(<ListingsPage />); await screen.findByText('Owner row 1');
  const next = button('Next');
  fireEvent.click(next); fireEvent.click(next);
  expect(api.getMyListings).toHaveBeenCalledTimes(2);
  expect(button('Next').disabled).toBe(true);
  expect(button('Previous').disabled).toBe(true);
  await act(async () => pending.reject(new Error('offline')));
  await screen.findByRole('alert');
  expect(screen.getByText('Page 2 could not be loaded. Retry or return to the previous page.')).toBeTruthy();
  expect(screen.queryByText('Owner row 1')).toBeNull();
  expect(screen.queryByText('No listings yet')).toBeNull();
  fireEvent.click(button('Retry')); await screen.findByText('Owner row 21');
  expect(api.getMyListings).toHaveBeenLastCalledWith({ skip: 20, limit: 21 });
});

it.each(['success', 'failure'])('ignores an old principal page %s, including its loading completion', async outcome => {
  const old = deferred<{ data: ReturnType<typeof rows> }>();
  const current = deferred<{ data: ReturnType<typeof rows> }>();
  api.getMyListings.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<ListingsPage />);
  auth.user = { id: 'seller-b' }; view.rerender(<ListingsPage />);
  await act(async () => {
    if (outcome === 'success') old.resolve({ data: rows(1, 21) });
    else old.reject(new Error('stale error'));
  });
  expect(screen.getByText('Loading listings...')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => current.resolve({ data: rows(101, 1) }));
  expect(await screen.findByText('Owner row 101')).toBeTruthy();
  expect(screen.queryByText('Owner row 1')).toBeNull();
});

it.each(['unmount', 'signed out', 'admission loading'])('retires outstanding page work on %s', async transition => {
  const old = deferred<{ data: ReturnType<typeof rows> }>();
  api.getMyListings.mockReturnValueOnce(old.promise).mockResolvedValue({ data: rows(101, 1) });
  const view = render(<ListingsPage />);
  if (transition === 'unmount') view.unmount();
  else {
    if (transition === 'signed out') auth.isAuthenticated = false;
    else auth.isLoading = true;
    view.rerender(<ListingsPage />);
  }
  await act(async () => old.resolve({ data: rows(1, 21) }));
  expect(screen.queryByText('Owner row 1')).toBeNull();
  if (transition === 'unmount') render(<ListingsPage />);
  else {
    auth.isAuthenticated = true; auth.isLoading = false; view.rerender(<ListingsPage />);
  }
  await screen.findByText('Owner row 101');
  expect(api.getMyListings).toHaveBeenLastCalledWith({ skip: 0, limit: 21 });
});

it('clears confirmation on page change and retires a delayed TermsGate edit callback', async () => {
  let accepted!: () => void;
  navigation.accept.mockImplementation((action: () => void) => { accepted = action; });
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) }).mockResolvedValueOnce({ data: rows(21, 1) });
  render(<ListingsPage />); await screen.findByText('Owner row 1');
  const first = screen.getByText('Owner row 1').closest('tr')!;
  fireEvent.click(within(first).getByRole('button', { name: 'Edit' }));
  fireEvent.click(within(first).getByRole('button', { name: 'Delete' }));
  expect(button('Confirm')).toBeTruthy();
  fireEvent.click(button('Next')); await screen.findByText('Owner row 21');
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  accepted(); expect(navigation.push).not.toHaveBeenCalled();
  expect(api.deleteListing).not.toHaveBeenCalled();
});

it.each(['delete', 'unpublish'])('holds paging through %s acknowledgement and refreshes the current offset', async kind => {
  const mutation = deferred<unknown>();
  const refresh = deferred<{ data: ReturnType<typeof rows> }>();
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) })
    .mockResolvedValueOnce({ data: rows(21, 21) }).mockReturnValueOnce(refresh.promise);
  api.deleteListing.mockReturnValue(mutation.promise); api.unpublishListing.mockReturnValue(mutation.promise);
  render(<ListingsPage />); await screen.findByText('Owner row 1');
  fireEvent.click(button('Next')); await screen.findByText('Owner row 21');
  const row = screen.getByText('Owner row 21').closest('tr')!;
  if (kind === 'delete') {
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    fireEvent.click(button('Confirm')); fireEvent.click(button('Confirm'));
  } else fireEvent.click(within(row).getByRole('button', { name: 'Unpublish' }));
  expect(button('Next').disabled).toBe(true); expect(button('Previous').disabled).toBe(true);
  expect(kind === 'delete' ? api.deleteListing : api.unpublishListing).toHaveBeenCalledExactlyOnceWith('id-21');
  await act(async () => mutation.resolve({}));
  expect(api.getMyListings).toHaveBeenLastCalledWith({ skip: 20, limit: 21 });
  expect(button('Previous').disabled).toBe(true);
  await act(async () => refresh.resolve({ data: rows(22, 20) }));
  await screen.findByText('Owner row 22'); expect(button('Previous').disabled).toBe(false);
  expect(screen.queryByText('Owner row 21')).toBeNull();
});

it('ignores an old mutation acknowledgement after a principal switch', async () => {
  const mutation = deferred<unknown>(); api.deleteListing.mockReturnValue(mutation.promise);
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 1) }).mockResolvedValueOnce({ data: rows(101, 1) });
  const view = render(<ListingsPage />); await screen.findByText('Owner row 1');
  fireEvent.click(button('Delete')); fireEvent.click(button('Confirm'));
  auth.user = { id: 'seller-b' }; view.rerender(<ListingsPage />); await screen.findByText('Owner row 101');
  await act(async () => mutation.resolve({}));
  expect(api.getMyListings).toHaveBeenCalledTimes(2);
  expect(navigation.toast).not.toHaveBeenCalled();
  expect(screen.getByText('Owner row 101')).toBeTruthy();
});


it.each(['success', 'failure'])('ignores an older same-query %s after effect replay resolves the newer request', async outcome => {
  const old = deferred<{ data: ReturnType<typeof rows> }>();
  const latest = deferred<{ data: ReturnType<typeof rows> }>();
  api.getMyListings.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  render(<StrictMode><ListingsPage /></StrictMode>);
  await waitFor(() => expect(api.getMyListings).toHaveBeenCalledTimes(2));
  await act(async () => latest.resolve({ data: rows(21, 21) }));
  await screen.findByText('Owner row 21');
  await act(async () => {
    if (outcome === 'success') old.resolve({ data: rows(1, 1) });
    else old.reject(new Error('retired request'));
  });
  expect(screen.getByText('Owner row 21')).toBeTruthy();
  expect(screen.queryByText('Owner row 1')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(button('Next').disabled).toBe(false);
});

it('keeps a failed mutation refresh truthful and manually retryable without restoring deleted rows', async () => {
  api.deleteListing.mockResolvedValue({});
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) })
    .mockRejectedValueOnce(new Error('refresh offline')).mockResolvedValueOnce({ data: rows(2, 20) });
  render(<ListingsPage />); await screen.findByText('Owner row 1');
  const row = screen.getByText('Owner row 1').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Delete' })); fireEvent.click(button('Confirm'));
  await screen.findByRole('alert');
  expect(screen.queryByText('Owner row 1')).toBeNull();
  expect(screen.queryByText('No listings yet')).toBeNull();
  fireEvent.click(button('Retry')); await screen.findByText('Owner row 2');
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
});

it('preserves all owner statuses, sharing eligibility, TermsGate editing and delete cancellation', async () => {
  const statuses = ['draft', 'enhanced', 'published', 'unlisted', 'pending_review', 'suspended', 'archived'];
  api.getMyListings.mockResolvedValue({ data: rows(1, statuses.length).map((row, i) => ({ ...row, status: statuses[i] })) });
  render(<ListingsPage />); await screen.findByText('Owner row 1');
  expect(api.getMyListings).toHaveBeenCalledExactlyOnceWith({ skip: 0, limit: 21 });
  statuses.forEach((status, i) => {
    const row = screen.getByText(`Owner row ${i + 1}`).closest('tr')!;
    expect(within(row).queryByRole('button', { name: 'Unpublish' }) !== null)
      .toBe(status === 'published' || status === 'unlisted');
    expect(within(row).queryByTestId(`share-id-${i + 1}`) !== null).toBe(status === 'published');
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Delete' })).toBeTruthy();
  });
  const draft = screen.getByText('Owner row 1').closest('tr')!;
  fireEvent.click(within(draft).getByRole('button', { name: 'Edit' }));
  expect(navigation.accept).toHaveBeenCalledTimes(1);
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/dashboard/listings/id-1/edit');
  fireEvent.click(within(draft).getByRole('button', { name: 'Delete' })); fireEvent.click(button('Cancel'));
  expect(api.deleteListing).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
});


it.each(['success', 'failure'])('retires an outstanding older page %s after a new principal has already loaded', async outcome => {
  const oldPage = deferred<{ data: ReturnType<typeof rows> }>();
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) })
    .mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce({ data: rows(101, 21) });
  const view = render(<ListingsPage />); await screen.findByText('Owner row 1');
  fireEvent.click(button('Next'));
  auth.user = { id: 'seller-b' }; view.rerender(<ListingsPage />);
  await screen.findByText('Owner row 101');
  await act(async () => {
    if (outcome === 'success') oldPage.resolve({ data: rows(21, 20) });
    else oldPage.reject(new Error('retired page failure'));
  });
  expect(screen.getByText('Page 1 · Showing 1–20')).toBeTruthy();
  expect(screen.getByText('Owner row 101')).toBeTruthy();
  expect(screen.queryByText('Owner row 21')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(button('Next').disabled).toBe(false);
});

it('preserves the current page when auth replaces the same principal object', async () => {
  api.getMyListings.mockResolvedValueOnce({ data: rows(1, 21) }).mockResolvedValueOnce({ data: rows(21, 1) });
  const view = render(<ListingsPage />); await screen.findByText('Owner row 1');
  fireEvent.click(button('Next')); await screen.findByText('Owner row 21');
  auth.user = { id: 'seller-a' }; view.rerender(<ListingsPage />);
  expect(screen.getByText('Page 2 · Showing 21–21')).toBeTruthy();
  expect(api.getMyListings).toHaveBeenCalledTimes(2);
});

it.each(['delete', 'unpublish'])('keeps rows and releases controls after a rejected %s without a false refresh', async kind => {
  api.deleteListing.mockRejectedValue(new Error('offline')); api.unpublishListing.mockRejectedValue(new Error('offline'));
  api.getMyListings.mockResolvedValue({ data: rows(1, 21) });
  render(<ListingsPage />); await screen.findByText('Owner row 1');
  const row = screen.getByText('Owner row 1').closest('tr')!;
  if (kind === 'delete') {
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' })); fireEvent.click(button('Confirm'));
  } else fireEvent.click(within(row).getByRole('button', { name: 'Unpublish' }));
  await waitFor(() => expect(navigation.toast).toHaveBeenCalledWith(`Failed to ${kind}`, 'error'));
  expect(screen.getByText('Owner row 1')).toBeTruthy();
  expect(button('Next').disabled).toBe(false);
  expect(api.getMyListings).toHaveBeenCalledTimes(1);
});
