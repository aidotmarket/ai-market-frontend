// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import UsdcLargePurchaseRequest from '@/components/UsdcLargePurchaseRequest';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'buyer-1' }, isAuthenticated: true, hydrated: true, isLoading: false },
  push: vi.fn(), post: vi.fn(), getMyOrders: vi.fn(), getListingOwnership: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('@/api/client', () => ({ api: { post: mocks.post } }));
vi.mock('@/api/orders', () => ({ getMyOrders: mocks.getMyOrders }));
vi.mock('@/api/listings', () => ({ getListingOwnership: mocks.getListingOwnership }));

const props = { listingId: 'listing-1', slug: 'test-dataset', title: 'Test Dataset', pricing: { price: 10000 } };
const label = 'Request USDC payment';
const thanks = 'Thanks. We will email you to arrange payment.';
const error = "We couldn't send your request. Please try again.";

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mocks.auth, { user: { id: 'buyer-1' }, isAuthenticated: true, hydrated: true, isLoading: false });
  mocks.getListingOwnership.mockResolvedValue(false);
  mocks.getMyOrders.mockResolvedValue([]);
  mocks.post.mockResolvedValue({ status: 201, data: {} });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each([0, 25, 9999, 9999.99])('hides the request at $%s', (price) => {
  render(<UsdcLargePurchaseRequest {...props} pricing={{ price }} />);
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.getMyOrders).not.toHaveBeenCalled();
});

it.each(['EUR', 'GBP'])('hides an explicitly non-USD price (%s)', (currency) => {
  render(<UsdcLargePurchaseRequest {...props} pricing={{ price: 10000, currency }} />);
  expect(screen.queryByRole('button', { name: label })).toBeNull();
});

it.each([undefined, 'USD'])('shows exactly $10,000 with currency=%s', async (currency) => {
  render(<UsdcLargePurchaseRequest {...props} pricing={{ price: 10000, currency }} />);
  expect(await screen.findByRole('button', { name: label })).toBeTruthy();
  expect(screen.getByText('Buying for $10,000 or more? You can ask to pay in USDC on Solana.')).toBeTruthy();
});

it('redirects a signed-out click through the existing login pattern without a request', async () => {
  mocks.auth.isAuthenticated = false;
  render(<UsdcLargePurchaseRequest {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: label }));
  expect(mocks.push).toHaveBeenCalledWith('/login?redirect=/listings/test-dataset');
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.getMyOrders).not.toHaveBeenCalled();
});

it('posts exactly one ticket with the exact body and replaces the button on 201', async () => {
  let resolve!: (value: { status: number }) => void;
  mocks.post.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<UsdcLargePurchaseRequest {...props} pricing={{ price: 12345.67 }} />);
  const button = await screen.findByRole<HTMLButtonElement>('button', { name: label });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  await waitFor(() => expect(mocks.post).toHaveBeenCalledOnce());
  expect(mocks.post).toHaveBeenCalledWith('/support/tickets', {
    subject: 'USDC payment request: Test Dataset', issue_class: 'customer', channel: 'web', priority: 'medium',
    links: { listing_id: 'listing-1', listing_slug: 'test-dataset' },
    payload: { kind: 'usdc_large_purchase_request', listing_id: 'listing-1', listing_slug: 'test-dataset', amount: 12345.67, currency: 'USD' },
  });
  await act(async () => resolve({ status: 201 }));
  expect(await screen.findByText(thanks)).toBeTruthy();
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.post).toHaveBeenCalledOnce();
});

it.each([429, 500, 'network', 200])('shows the error and allows retry after %s', async (failure) => {
  if (failure === 200) mocks.post.mockResolvedValueOnce({ status: 200 });
  else mocks.post.mockRejectedValueOnce(failure === 'network' ? new Error('Network error') : { response: { status: failure } });
  render(<UsdcLargePurchaseRequest {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: label }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', error);
  const button = screen.getByRole<HTMLButtonElement>('button', { name: label });
  expect(button.disabled).toBe(false);
  expect(screen.queryByText(thanks)).toBeNull();
  fireEvent.click(button);
  expect(await screen.findByText(thanks)).toBeTruthy();
  expect(mocks.post).toHaveBeenCalledTimes(2);
});

it('hides the request for the seller of the listing', async () => {
  mocks.getListingOwnership.mockResolvedValue(true);
  render(<UsdcLargePurchaseRequest {...props} />);
  await waitFor(() => expect(mocks.getListingOwnership).toHaveBeenCalledWith('listing-1'));
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.getMyOrders).not.toHaveBeenCalled();
});

it('hides the request while checking purchases and for an existing buyer', async () => {
  let resolve!: (value: unknown[]) => void;
  mocks.getMyOrders.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<UsdcLargePurchaseRequest {...props} />);
  await waitFor(() => expect(mocks.getMyOrders).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  await act(async () => resolve([{ listing_id: 'listing-1', status: 'completed' }]));
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.post).not.toHaveBeenCalled();
});

it('hides the request during auth hydration', () => {
  mocks.auth.hydrated = false;
  render(<UsdcLargePurchaseRequest {...props} />);
  expect(screen.queryByRole('button', { name: label })).toBeNull();
});

it('hides the request and prevents a POST when the orders lookup rejects', async () => {
  mocks.getMyOrders.mockRejectedValue(new Error('Orders unavailable'));
  await act(async () => { render(<UsdcLargePurchaseRequest {...props} />); });
  expect(mocks.getMyOrders).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.post).not.toHaveBeenCalled();
});

it('hides the request and prevents a POST when the ownership lookup rejects', async () => {
  mocks.getListingOwnership.mockRejectedValue(new Error('Ownership unavailable'));
  await act(async () => { render(<UsdcLargePurchaseRequest {...props} />); });
  expect(mocks.getListingOwnership).toHaveBeenCalledWith('listing-1');
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.getMyOrders).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
});

it('stays hidden past the ownership hook deadline and after a late owner response', async () => {
  vi.useFakeTimers();
  let resolve!: (isOwner: boolean) => void;
  mocks.getListingOwnership.mockReturnValue(new Promise<boolean>(done => { resolve = done; }));
  render(<UsdcLargePurchaseRequest {...props} />);
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.getMyOrders).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
  await act(async () => resolve(true));
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.getMyOrders).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
});

it('shows the request only after ownership confirms not-owner and orders confirm no purchase', async () => {
  let resolveOwnership!: (isOwner: boolean) => void;
  let resolveOrders!: (orders: unknown[]) => void;
  mocks.getListingOwnership.mockReturnValue(new Promise<boolean>(done => { resolveOwnership = done; }));
  mocks.getMyOrders.mockReturnValue(new Promise(done => { resolveOrders = done; }));
  render(<UsdcLargePurchaseRequest {...props} />);
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(mocks.getMyOrders).not.toHaveBeenCalled();
  await act(async () => resolveOwnership(false));
  expect(mocks.getMyOrders).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  await act(async () => resolveOrders([]));
  expect(screen.getByRole('button', { name: label })).toBeTruthy();
  expect(mocks.post).not.toHaveBeenCalled();
});
