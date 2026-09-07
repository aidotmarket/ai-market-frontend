// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SellerReview from './SellerReview';
const api = vi.hoisted(() => ({readListingReview:vi.fn()}));
vi.mock('@/api/sellerListingReview', () => api);
afterEach(() => {cleanup();vi.resetAllMocks();});
it('displays saved fields without exposing an approval or publication action', async () => {
  api.readListingReview.mockResolvedValue({fields:{title:'Saved retail offer', description:'Weekly totals', category:'Retail',tags:'retail',price:'25.00',license:'Research'},missing_fields:[],approval_available:false});
  render(<SellerReview active enabled />);
  await screen.findByRole('heading',{name:'Saved retail offer'});
  expect(screen.getByText(/This review uses your saved listing fields/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/approve|publish/i})).toBeNull();
});
it('does not request a review before the capability is available', () => {
  render(<SellerReview active enabled={false} />);
  expect(api.readListingReview).not.toHaveBeenCalled();
});
