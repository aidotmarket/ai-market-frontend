// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {nativeClient} from '@/api/connector-seller-settings';
import {api} from '@/api/client';
import {useAuthStore} from '@/store/auth';
import type {User} from '@/types';
import type {OwnerListing} from '@/api/sellerListingPublication';
import SellerListingRemoval from './SellerListingRemoval';
import SellerPublications from './SellerPublications';

vi.mock('@/components/listing/ListingDocumentsEditor', () => ({default: () => null}));
vi.mock('@/components/listings/SellerAtAGlance', () => ({default: () => null}));
vi.mock('./SellerPreviewConsent', () => ({default: () => null}));

const listing: OwnerListing = {
  listing_id: 'dc174df5-3e99-425b-b4fc-ac265da5509f',
  title: 'Retail data', slug: 'retail-data', status: 'published', seller_status: 'published',
  staff_restriction: 'none', is_listed: true, action_id: null, confirmed_at: null,
  withdrawn_at: null, pending_effects: false, allowed_actions: ['hide', 'withdraw'], protected_buyer_count: 2,
};
const hidden: OwnerListing = {...listing, status: 'hidden', seller_status: 'hidden', is_listed: false, allowed_actions: ['unhide', 'withdraw']};
const withdrawn: OwnerListing = {...listing, status: 'withdrawn', seller_status: 'withdrawn', is_listed: false, allowed_actions: []};
const second = {...listing, listing_id: '7a1de954-b727-43c0-8597-974e278a9494', title: 'Weather data'};
const receipt = (row: OwnerListing) => ({
  listing_id: row.listing_id, status: row.status, seller_status: row.seller_status,
  staff_restriction: row.staff_restriction, is_listed: row.is_listed, action_id: 'a58fb6ee-f6bf-4e9d-9982-eec855400856',
  confirmed_at: '2026-11-22T00:00:00Z', pending_effects: true, protected_buyer_count: row.protected_buyer_count,
});
const httpError = (status: number, detail: unknown) => ({isAxiosError: true, response: {status, data: {detail}}});
const click = (name: string) => fireEvent.click(screen.getByRole('button', {name}));
const open = async (name: string) => {
  await screen.findByRole('button', {name});
  click(name);
  return within(screen.getByRole('alertdialog'));
};
const page = (...items: OwnerListing[]) => ({data: {items, cursor: null}});
const checkout = 'You can hide or withdraw this listing once its open checkouts finish. You can pause it now to stop new sales, or contact support.';

beforeEach(() => useAuthStore.setState({user: {id: 'first-owner'} as User, token: 'first-token'}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({user: null, token: null});
});

it('keeps every new control dark on the owner-read 404', async () => {
  const get = vi.spyOn(nativeClient, 'get').mockRejectedValue(httpError(404, {code: 'NOT_FOUND', message: 'Not found.'}));
  const post = vi.spyOn(nativeClient, 'post');
  render(<SellerListingRemoval active />);
  await act(async () => {});
  expect(get).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('region')).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

it('keeps Pause and Resume available through the legacy publication when removal is off', async () => {
  const legacy = {
    id: listing.listing_id, listing_id: listing.listing_id, listing_version_id: listing.listing_id, approval_id: listing.listing_id,
    status: 'published', is_listed: true, title: listing.title, slug: listing.slug,
    published_at: '2026-11-22T00:00:00Z', review_hash: 'a'.repeat(64), render_hash: 'b'.repeat(64),
  };
  vi.spyOn(nativeClient, 'get').mockRejectedValue(httpError(404, {code: 'NOT_FOUND', message: 'Not found.'}));
  vi.spyOn(api, 'get').mockResolvedValue({data: {items: [legacy], page: 0, has_more: false}});
  const post = vi.spyOn(api, 'post').mockResolvedValue({data: {...legacy, status: 'unlisted', is_listed: false}});
  render(<SellerPublications active enabled />);
  await screen.findByRole('button', {name: 'Pause new sales'});
  expect(screen.queryByRole('region', {name: 'Listing visibility'})).toBeNull();
  click('Pause new sales');
  await screen.findByRole('button', {name: 'Resume sales'});
  expect(post).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', {name: 'Withdraw all listings'})).toBeNull();
});

it('reads and offers owner actions with publication unavailable', async () => {
  vi.spyOn(nativeClient, 'get').mockResolvedValue(page(listing));
  const get = vi.spyOn(api, 'get');
  render(<SellerPublications active enabled={false} />);
  await screen.findByRole('button', {name: 'Hide listing'});
  expect(get).not.toHaveBeenCalled();
});

it.each([
  [listing, hidden, 'Hide listing', 'Confirm hide', 'hide', 'Listing hidden.'],
  [hidden, listing, 'Unhide listing', 'Confirm unhide', 'unhide', 'Listing restored.'],
  [listing, withdrawn, 'Withdraw listing permanently', 'Confirm permanent withdrawal', 'withdraw', 'Listing permanently withdrawn.'],
] as const)('confirms %s to %s from owner metadata alone', async (before, after, button, confirm, action, notice) => {
  vi.spyOn(nativeClient, 'get').mockResolvedValueOnce(page(before)).mockResolvedValue(page(after));
  const post = vi.spyOn(nativeClient, 'post').mockResolvedValue({data: receipt(after)});
  render(<SellerListingRemoval active />);
  const dialog = await open(button);
  expect(dialog.getByText('2 buyers currently have protected access.')).toBeTruthy();
  expect(dialog.getByText(/AI assistants|AI discovery/)).toBeTruthy();
  expect(dialog.getByText(/Existing orders continue/)).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
  click(confirm);
  await screen.findByText(notice);
  expect(post).toHaveBeenCalledExactlyOnceWith(`/seller-workspace/listings/${listing.listing_id}/state`, {
    request_id: expect.any(String), action, expected_status: before.status, expected_seller_status: before.seller_status,
    expected_staff_restriction: before.staff_restriction, csrf: expect.any(String),
    ...(action === 'withdraw' ? {confirm_permanent: true} : {}),
  }, expect.objectContaining({signal: expect.any(AbortSignal)}));
});

it('shows the exact checkout refusal and offers the legacy Pause action', async () => {
  vi.spyOn(nativeClient, 'get').mockResolvedValue(page(listing));
  vi.spyOn(nativeClient, 'post').mockRejectedValue(httpError(409, {code: 'listing_has_open_checkouts', message: checkout}));
  const pause = vi.spyOn(api, 'post').mockResolvedValue({data: {...listing, status: 'unlisted', is_listed: false}});
  const onChange = vi.fn();
  render(<SellerListingRemoval active onChange={onChange} />);
  await open('Hide listing');
  click('Confirm hide');
  expect((await screen.findByRole('alert')).textContent).toBe(checkout);
  expect(screen.getByText('Stop new sales. Page stays viewable by link.')).toBeTruthy();
  click('Pause new sales');
  await screen.findByText('New sales paused. The page is still viewable by link.');
  expect(pause).toHaveBeenCalledExactlyOnceWith(`/seller-workspace/listing-publications/${listing.listing_id}/visibility`, {
    request_id: expect.any(String), expected_status: 'published', listed: false,
  }, expect.any(Object));
  expect(onChange).toHaveBeenCalledOnce();
});

it.each([
  [409, {code: 'STATE_STALE'}, 'This listing changed.', false],
  [409, {code: 'WITHDRAWN_TERMINAL'}, 'This listing was permanently withdrawn.', false],
  [409, {code: 'DELIVERY_MATERIAL_DESTROYED'}, 'This listing needs a new approval', true],
  [409, {code: 'APPROVAL_REQUIRED'}, 'This listing needs a new approval', true],
  [409, {code: 'STAFF_RESTRICTED'}, 'The marketplace has restricted this listing.', true],
  [409, {code: 'DELIVERY_UNAVAILABLE'}, 'We could not restore this listing.', true],
  [422, [{msg: 'internal validation detail'}], 'We could not accept this confirmation.', false],
] as const)('gives plain recovery for HTTP %i %j', async (status, detail, message, restoring) => {
  vi.spyOn(nativeClient, 'get').mockResolvedValue(page(restoring ? hidden : listing));
  vi.spyOn(nativeClient, 'post').mockRejectedValue(httpError(status, detail));
  const onRecovery = vi.fn();
  render(<SellerListingRemoval active onRecovery={onRecovery} />);
  await open(restoring ? 'Unhide listing' : 'Hide listing');
  click(restoring ? 'Confirm unhide' : 'Confirm hide');
  expect((await screen.findByRole('alert')).textContent).toContain(message);
  expect(screen.queryByText('internal validation detail')).toBeNull();
  expect(screen.getByRole('button', {name: 'Refresh listings'})).toBeTruthy();
  if (restoring) {
    click('Prepare listing');
    click('Check storage');
    expect(onRecovery.mock.calls).toEqual([['listing'], ['storage']]);
  }
});

it('omits Unhide when the owner read omits it and offers a new approval', async () => {
  vi.spyOn(nativeClient, 'get').mockResolvedValue(page({...hidden, allowed_actions: ['withdraw']}));
  render(<SellerListingRemoval active />);
  await screen.findByText(/Start a new listing and get it approved/);
  expect(screen.queryByRole('button', {name: 'Unhide listing'})).toBeNull();
});

it('removes visible controls when the mutation rollout gate closes', async () => {
  vi.spyOn(nativeClient, 'get').mockResolvedValue(page(listing));
  vi.spyOn(nativeClient, 'post').mockRejectedValue(httpError(503, {code: 'REMOVAL_UNAVAILABLE'}));
  render(<SellerListingRemoval active />);
  await open('Hide listing');
  click('Confirm hide');
  await act(async () => {});
  expect(screen.queryByRole('button')).toBeNull();
});

it('retries an uncertain write with the exact same action and request ID', async () => {
  vi.spyOn(nativeClient, 'get').mockResolvedValue(page(listing));
  const post = vi.spyOn(nativeClient, 'post').mockRejectedValueOnce(httpError(503, {code: 'PERSISTENCE_UNCERTAIN'}))
    .mockResolvedValueOnce({data: receipt(hidden)});
  render(<SellerListingRemoval active />);
  await open('Hide listing');
  click('Confirm hide');
  await screen.findByRole('alert');
  click('Try again');
  await screen.findByText('Listing hidden.');
  expect(post.mock.calls[1].slice(0, 2)).toEqual(post.mock.calls[0].slice(0, 2));
});

it('discards a pending write and all first-owner UI after the principal changes', async () => {
  vi.spyOn(nativeClient, 'get').mockResolvedValueOnce(page(listing)).mockResolvedValue(page(second));
  let finish!: (value: {data: ReturnType<typeof receipt>}) => void;
  vi.spyOn(nativeClient, 'post').mockReturnValue(new Promise(resolve => {finish = resolve;}));
  const onChange = vi.fn();
  render(<SellerListingRemoval active onChange={onChange} />);
  await open('Hide listing');
  click('Confirm hide');
  await act(async () => useAuthStore.setState({user: {id: 'second-owner'} as User, token: 'second-token'}));
  await screen.findByText('Weather data');
  await act(async () => finish({data: receipt(hidden)}));
  expect(screen.queryByText('Retail data')).toBeNull();
  expect(screen.queryByText('Listing hidden.')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

it('names partial bulk results and reconfirms only the previous failures after refreshing', async () => {
  const newListing = {...listing, listing_id: 'befe4883-22dc-46b7-be16-d3333128cf65', title: 'Newly published'};
  const get = vi.spyOn(nativeClient, 'get')
    .mockResolvedValueOnce({data: {items: [listing], cursor: listing.listing_id}})
    .mockResolvedValueOnce(page(second)).mockResolvedValue(page(withdrawn, second, newListing));
  const post = vi.spyOn(nativeClient, 'post')
    .mockResolvedValueOnce({data: {receipts: [receipt(withdrawn)], failed: [{listing_id: second.listing_id, code: 'STATE_STALE'}], partial: true}})
    .mockResolvedValueOnce({data: {receipts: [receipt({...withdrawn, listing_id: second.listing_id})], failed: [], partial: false}});
  render(<SellerListingRemoval active />);
  const dialog = await open('Withdraw all listings');
  expect(dialog.getByText('Retail data (2 buyers with protected access)')).toBeTruthy();
  expect(dialog.getByText('Weather data (2 buyers with protected access)')).toBeTruthy();
  expect(get).toHaveBeenNthCalledWith(2, '/seller-workspace/listings', expect.objectContaining({params: {limit: 50, cursor: listing.listing_id}}));
  click('Confirm permanent withdrawal');
  await screen.findByText('Permanently withdrawn.');
  expect(screen.getByText('This listing changed. Refresh your listings and try again.')).toBeTruthy();
  expect(screen.queryByRole('button', {name: 'Withdraw remaining listings'})).toBeNull();
  click('Refresh remaining listings');
  await screen.findByText('Newly published');
  const reconfirm = await open('Withdraw remaining listings');
  expect(reconfirm.queryByText(/Newly published|Retail data/)).toBeNull();
  click('Confirm permanent withdrawal');
  await act(async () => {});
  expect(screen.getAllByText('Permanently withdrawn.')).toHaveLength(2);
  expect(post.mock.calls[0][1]).toMatchObject({confirm_permanent: true, listing_ids: [listing.listing_id, second.listing_id]});
  expect(post.mock.calls[1][1]).toMatchObject({confirm_permanent: true, listing_ids: [second.listing_id]});
  expect(post.mock.calls[0][1]).not.toMatchObject({request_id: (post.mock.calls[1][1] as {request_id: string}).request_id});
});
