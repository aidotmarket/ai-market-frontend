// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerPublication from './SellerPublication';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
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
