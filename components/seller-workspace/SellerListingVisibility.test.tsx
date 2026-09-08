// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerListingVisibility from './SellerListingVisibility';
import type {PublicationReceipt} from '@/api/sellerListingPublication';
const api=vi.hoisted(()=>({setPublicationVisibility:vi.fn()}));vi.mock('@/api/sellerListingPublication',()=>api);
const publication={id:'p',listing_id:'l',status:'published',is_listed:true} as PublicationReceipt;
afterEach(cleanup);beforeEach(()=>vi.resetAllMocks());
it('only pauses after a click and reuses the same request after an unknown outcome',async()=>{
  const onChange=vi.fn();api.setPublicationVisibility.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({...publication,status:'unlisted',is_listed:false});
  render(<SellerListingVisibility publication={publication} active onChange={onChange}/>);
  expect(api.setPublicationVisibility).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Pause new sales'}));await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Pause new sales'}));
  await act(async()=>{});expect(onChange).toHaveBeenCalledOnce();
  expect(api.setPublicationVisibility.mock.calls[0][1]).toBe(false);
  expect(api.setPublicationVisibility.mock.calls[0][2]).toBe(api.setPublicationVisibility.mock.calls[1][2]);
});
it('refuses stale changes and aborts when leaving the listings',async()=>{
  api.setPublicationVisibility.mockRejectedValueOnce({isAxiosError:true,response:{status:409}});
  const onChange=vi.fn();const view=render(<SellerListingVisibility publication={publication} active onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:'Pause new sales'}));await screen.findByRole('alert');
  expect((screen.getByRole('button',{name:'Pause new sales'}) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<SellerListingVisibility publication={{...publication,status:'unlisted',is_listed:false}} active onChange={onChange}/>);
  let finish!:(value:unknown)=>void;api.setPublicationVisibility.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  fireEvent.click(screen.getByRole('button',{name:'Resume sales'}));view.unmount();
  expect(api.setPublicationVisibility.mock.calls[1][3].aborted).toBe(true);
  await act(async()=>finish(publication));expect(onChange).not.toHaveBeenCalled();
});
