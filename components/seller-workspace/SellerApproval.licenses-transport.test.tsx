// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import SellerApproval from './SellerApproval';
import reviewFixture from '@/api/fixtures/s1735-v3-review.json';
import type {ListingReview} from '@/api/sellerListingReview';

const transport=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('@/api/client',()=>({api:transport}));
afterEach(()=>{cleanup();vi.resetAllMocks();});

it('renders v3 statements and posts their exact keys with the saved licence',async()=>{
  const review=reviewFixture as ListingReview;
  transport.post.mockResolvedValue({data:{id:'11111111-1111-4111-8111-111111111111',review_hash:review.review_hash,
    render_hash:review.render_hash,draft_version:review.draft_version,source_version:review.source_version,
    sample_decision:'none',license_selection:review.license_selection}});
  transport.get.mockResolvedValue({data:{publication_available:false,publication:null}});
  render(<SellerApproval review={review} active rendered/>);
  expect(screen.getByText('I read the licence.')).toBeTruthy();
  expect(screen.getByText('I confirm the covenant and authority.')).toBeTruthy();
  for(const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button',{name:'Approve this review'}));
  await waitFor(()=>expect(transport.post).toHaveBeenCalledTimes(1));
  expect(transport.post.mock.calls[0][0]).toBe('/seller-workspace/listing-approval');
  const body=transport.post.mock.calls[0][1];
  expect(body).toMatchObject({confirmation_version:'seller-listing-confirmation-v3',ownership_confirmed:true,
    privacy_confirmed:true,price_confirmed:true,license_confirmed:true,covenant_authority_confirmed:true,
    public_disclosure_confirmed:true,license_selection:review.license_selection});
  expect(body).not.toHaveProperty('price_license_confirmed');
  expect(body).not.toHaveProperty('covenant_confirmed');
  await screen.findByText('Review approved and saved.');
});
