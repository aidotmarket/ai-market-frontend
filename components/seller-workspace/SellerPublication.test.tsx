// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerPublication from './SellerPublication';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
import {createStandardSelection} from '@/api/listingLicenses';
const api=vi.hoisted(()=>({readPublication:vi.fn(),publishListing:vi.fn()}));
vi.mock('@/api/sellerListingPublication',()=>api);
const licenseApi=vi.hoisted(()=>({publishedCustomLicense:vi.fn()}));
vi.mock('@/api/listingLicenses',async importOriginal=>({...await importOriginal<typeof import('@/api/listingLicenses')>(),...licenseApi}));
const approval={id:'approval',review_hash:'a',render_hash:'b'} as ApprovalReceipt;
const publication={title:'Retail',slug:'retail',status:'published',is_listed:true};
afterEach(cleanup);
beforeEach(()=>{vi.resetAllMocks();api.readPublication.mockResolvedValue({publication_available:true,publication:null});});
it('requires a click and the approved render before publishing',async()=>{
  const view=render(<SellerPublication approval={approval} active rendered={false}/>);
  const button=await screen.findByRole('button',{name:'Publish this listing'});
  expect((button as HTMLButtonElement).disabled).toBe(true);expect(api.publishListing).not.toHaveBeenCalled();
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
it('opens a published custom document through the authenticated listing route',async()=>{
 const licensed={...approval,license_selection:{...createStandardSelection(),kind:'custom' as const}};
 const listed={...publication,listing_id:'11111111-1111-4111-8111-111111111111'};
 api.readPublication.mockResolvedValue({publication_available:false,publication:listed});
 licenseApi.publishedCustomLicense.mockResolvedValue(new Blob(['seller terms'],{type:'text/plain'}));
 const createObjectURL=vi.fn(()=> 'blob:published-licence');
 const revokeObjectURL=vi.fn();
 vi.stubGlobal('URL',{...URL,createObjectURL,revokeObjectURL});
 const view=render(<SellerPublication approval={licensed} active rendered/>);
 fireEvent.click(await screen.findByRole('button',{name:'Open published custom licence'}));
 expect((await screen.findByRole('link',{name:'Open published custom licence'})).getAttribute('href')).toBe('blob:published-licence');
 expect(licenseApi.publishedCustomLicense).toHaveBeenCalledWith(listed.listing_id);
 view.unmount();expect(revokeObjectURL).toHaveBeenCalledWith('blob:published-licence');
 vi.unstubAllGlobals();
});
