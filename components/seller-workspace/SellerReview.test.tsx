// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SellerReview from './SellerReview';
const api = vi.hoisted(() => ({readListingReview:vi.fn()}));
vi.mock('@/api/sellerListingReview', () => api);
afterEach(() => {cleanup();vi.resetAllMocks();});
it('displays saved fields without exposing an approval or publication action', async () => {
  const html = '<!doctype html><html><body><h1>Saved retail offer</h1><p>$25.00</p></body></html>';
  api.readListingReview.mockResolvedValue({rendered_html:html,fields:{title:'Saved retail offer', description:'Weekly totals', category:'Retail',tags:'retail',price:'25.00',license:'Research'},source_files:[{key:'private/retail.csv',size:42,etag:'synthetic',version_id:null}],missing_fields:[],approval_available:false});
  render(<SellerReview active enabled />);
  const frame = await screen.findByTitle('Saved listing buyers would see');
  expect(frame.getAttribute('srcdoc')).toBe(html);
  expect(screen.getByText('private/retail.csv')).toBeTruthy();
  expect(frame.getAttribute('srcdoc')).not.toContain('private/retail.csv');
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(screen.getByText(/This review uses your saved listing fields/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/approve|publish/i})).toBeNull();
});
it('does not request a review before the capability is available', () => {
  render(<SellerReview active enabled={false} />);
  expect(api.readListingReview).not.toHaveBeenCalled();
});
