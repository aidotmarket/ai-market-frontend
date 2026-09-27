// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerPublication from './SellerPublication';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
import {createStandardSelection} from '@/api/listingLicenses';
const api=vi.hoisted(()=>({readPublication:vi.fn(),publishListing:vi.fn()}));
vi.mock('@/api/sellerListingPublication',()=>api);
const approval={id:'approval',review_hash:'a',render_hash:'b'} as ApprovalReceipt;
const publication={title:'Retail',slug:'retail',status:'published',is_listed:true};
afterEach(cleanup);
beforeEach(()=>{vi.resetAllMocks();api.readPublication.mockResolvedValue({publication_available:true,publication:null});});
it('requires a click and the approved render before publishing',async()=>{
  const view=render(<SellerPublication approval={approval} active rendered={false}/>);
  const button=await screen.findByRole('button',{name:'Publish this listing'});
  expect((button as HTMLButtonElement).disabled).toBe(true);expect(api.publishListing).not.toHaveBeenCalled();
  expect(screen.getByText('Wait for the saved review to finish loading before publishing.')).toBeTruthy();
  view.rerender(<SellerPublication approval={approval} active rendered/>);
  api.publishListing.mockResolvedValue(publication);fireEvent.click(button);
  await screen.findByText(/published and available/);
  expect(api.publishListing).toHaveBeenCalledOnce();expect(screen.getByRole('link',{name:'View Retail'}).getAttribute('href')).toBe('/listings/retail');
});
it('restores publication status without publishing again',async()=>{
  api.readPublication.mockResolvedValue({publication_available:false,publication});
  render(<SellerPublication approval={approval} active rendered/>);
  await screen.findByText(/published and available/);expect(api.publishListing).not.toHaveBeenCalled();
  expect(screen.queryByText(/approved listing is private/)).toBeNull();
});
it('keeps the same identity when publication outcome is unknown',async()=>{
  api.publishListing.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(publication);
  render(<SellerPublication approval={approval} active rendered/>);
  fireEvent.click(await screen.findByRole('button',{name:'Publish this listing'}));await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Publish this listing'}));await screen.findByText(/published and available/);
  expect(api.publishListing.mock.calls[0][1]).toBe(api.publishListing.mock.calls[1][1]);
});
it('blocks a stale approval and ignores success after leaving the page',async()=>{
  api.publishListing.mockRejectedValueOnce({isAxiosError:true,response:{status:409}});
  const view=render(<SellerPublication approval={approval} active rendered/>);
  fireEvent.click(await screen.findByRole('button',{name:'Publish this listing'}));await screen.findByRole('alert');
  expect((screen.getByRole('button',{name:'Publish this listing'}) as HTMLButtonElement).disabled).toBe(true);
  view.unmount();let finish!:(value:unknown)=>void;
  api.publishListing.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const late=render(<SellerPublication approval={approval} active rendered/>);
  fireEvent.click(await screen.findByRole('button',{name:'Publish this listing'}));
  late.rerender(<SellerPublication approval={approval} active={false} rendered/>);
  await act(async()=>finish(publication));expect(screen.queryByText(/published and available/)).toBeNull();
});
it.each([
  ['SELLER_LEGAL_IDENTITY_REQUIRED','Your legal name and country are not saved',false],
  ['LEGAL_IDENTITY_CONFLICT','quick check by our support team',true],
])('maps %s without marking the approval stale',async(code,message,support)=>{
  api.publishListing.mockRejectedValueOnce({response:{status:409,data:{detail:{code,sources:['Private Name']}}}});
  render(<SellerPublication approval={approval} active rendered/>);
  fireEvent.click(await screen.findByRole('button',{name:'Publish this listing'}));
  expect((await screen.findByRole('alert')).textContent).toContain(message);
  expect(document.body.textContent).not.toContain('Private Name');
  expect((screen.getByRole('button',{name:'Publish this listing'}) as HTMLButtonElement).disabled).toBe(false);
  expect(Boolean(screen.queryByRole('link',{name:'Contact support'}))).toBe(support);
});
it('maps identity 503 to retry without marking the approval stale',async()=>{
  api.publishListing.mockRejectedValueOnce({response:{status:503,data:{detail:{code:'IDENTITY_SERVICE_UNAVAILABLE'}}}});
  render(<SellerPublication approval={approval} active rendered/>);
  fireEvent.click(await screen.findByRole('button',{name:'Publish this listing'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Retry publishing');
  expect((screen.getByRole('button',{name:'Publish this listing'}) as HTMLButtonElement).disabled).toBe(false);
});
it('shows seller copy for the session-only approved free sample count',async()=>{
 const sampled={...approval,sample_decision:'member_files' as const};
 api.readPublication.mockResolvedValue({publication_available:false,publication});
 render(<SellerPublication approval={sampled} active rendered sampleCount={2}/>);
 expect(await screen.findByText('2 free sample files are part of the purchased set.')).toBeTruthy();
});
it('shows the zero-count sample branch',async()=>{
 const sampled={...approval,sample_decision:'member_files' as const};api.readPublication.mockResolvedValue({publication_available:false,publication});
 render(<SellerPublication approval={sampled} active rendered/>);
 expect(await screen.findByText('No free sample files')).toBeTruthy();
});
it('keeps none-publication markup unchanged with the widened receipt',async()=>{
 api.readPublication.mockResolvedValue({publication_available:false,publication});
 const first=render(<SellerPublication approval={approval} active rendered/>);await screen.findByText(/published and available/);
 const legacy=first.container.innerHTML;first.unmount();
 const second=render(<SellerPublication approval={{...approval,sample_decision:'none'}} active rendered/>);await screen.findByText(/published and available/);
 expect(second.container.innerHTML).toBe(legacy);
});
it('keeps publish disabled until covenant authority and signer facts are complete',async()=>{
 const licensed={...approval,license_selection:createStandardSelection()};
 render(<SellerPublication approval={licensed} active rendered/>);
 const button=await screen.findByRole('button',{name:'Publish this listing'});
 expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(button);expect(api.publishListing).not.toHaveBeenCalled();
 expect(screen.getByText(/covenant and authority not confirmed/)).toBeTruthy();
});
it('keeps publish blocked if the saved licence has no legal identity version',async()=>{
 const licensed={...approval,license_selection:{...createStandardSelection(),seller_acceptance:{signer_name:'Seller',signer_title:'Owner',authority_confirmed:true}}};
 render(<SellerPublication approval={licensed} active rendered/>);
 expect((await screen.findByRole('button',{name:'Publish this listing'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText(/legal identity and licence choice are not yet saved together/)).toBeTruthy();
});
it('opens the verified custom document through the listing disclosure',async()=>{
 const licensed={...approval,license_selection:{...createStandardSelection(),kind:'custom' as const}};
 const listed={...publication,listing_id:'11111111-1111-4111-8111-111111111111'};
 api.readPublication.mockResolvedValue({publication_available:false,publication:listed});
 render(<SellerPublication approval={licensed} active rendered/>);
 expect((await screen.findByRole('link',{name:'Open verified custom licence on listing'})).getAttribute('href')).toBe('/listings/retail');
});
