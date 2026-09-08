// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SellerApproval from './SellerApproval';
import type { ListingReview } from '@/api/sellerListingReview';
vi.mock('./SellerPublication', () => ({default:()=>null}));
const api = vi.hoisted(() => ({approveListingReview:vi.fn()}));
vi.mock('@/api/sellerListingReview', async original => ({...await original<typeof import('@/api/sellerListingReview')>(),...api}));
const review = {approval_available:true,review_hash:'a'.repeat(64),render_hash:'b'.repeat(64),confirmation_version:'seller-listing-confirmation-v1',confirmation_statements:{ownership_confirmed:'I have rights.',privacy_confirmed:'I reviewed privacy.',price_license_confirmed:'I confirm price and license.',public_disclosure_confirmed:'I understand public discovery.'}} as ListingReview;
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
function confirmAll() { for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox); }
it('requires an explicit sample choice, all confirmations and a loaded render', async () => {
  const {rerender} = render(<SellerApproval review={review} active rendered={false} />);
  expect(screen.getAllByRole('checkbox').every(item => !(item as HTMLInputElement).checked)).toBe(true);
  confirmAll();
  expect((screen.getByRole('button',{name:'Approve this review'}) as HTMLButtonElement).disabled).toBe(true);
  rerender(<SellerApproval review={review} active rendered />);
  api.approveListingReview.mockResolvedValue({id:'approved'});
  fireEvent.click(screen.getByRole('button',{name:'Approve this review'}));
  await screen.findByText(/Review approved and saved/);
  expect(api.approveListingReview).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button',{name:/publish/i})).toBeNull();
});
it('retries an unknown outcome with the same request identity', async () => {
  api.approveListingReview.mockRejectedValueOnce(new Error('network')).mockResolvedValue({id:'approved'});
  render(<SellerApproval review={review} active rendered />);confirmAll();
  fireEvent.click(screen.getByRole('button',{name:'Approve this review'}));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Approve this review'}));
  await screen.findByText(/Review approved and saved/);
  expect(api.approveListingReview.mock.calls[0][1]).toBe(api.approveListingReview.mock.calls[1][1]);
});
it('requires refreshing a changed review before another approval attempt', async () => {
  api.approveListingReview.mockRejectedValue({isAxiosError:true,response:{status:409}});
  render(<SellerApproval review={review} active rendered />);confirmAll();
  fireEvent.click(screen.getByRole('button',{name:'Approve this review'}));
  await screen.findByText(/Refresh the saved review/);
  expect((screen.getByRole('button',{name:'Approve this review'}) as HTMLButtonElement).disabled).toBe(true);
});
it('does not display a late success after leaving the review', async () => {
  let finish!: (value:unknown) => void;
  api.approveListingReview.mockReturnValue(new Promise(resolve => {finish=resolve;}));
  const {rerender} = render(<SellerApproval review={review} active rendered />);confirmAll();
  fireEvent.click(screen.getByRole('button',{name:'Approve this review'}));
  rerender(<SellerApproval review={review} active={false} rendered />);
  expect(api.approveListingReview.mock.calls[0][2].aborted).toBe(true);
  await act(async () => finish({id:'approved'}));
  expect(screen.queryByText(/Review approved and saved/)).toBeNull();
});
