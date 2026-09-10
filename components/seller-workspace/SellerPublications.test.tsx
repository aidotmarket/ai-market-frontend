// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerPublications from './SellerPublications';
const api=vi.hoisted(()=>({readPublicationPage:vi.fn()}));vi.mock('@/api/sellerListingPublication',()=>api);
afterEach(cleanup);beforeEach(()=>vi.resetAllMocks());
it('loads only when opened and pages through saved publications',async()=>{
  api.readPublicationPage.mockResolvedValueOnce({page:0,has_more:true,items:[{id:'one',title:'Retail',slug:'retail',status:'published',is_listed:true,published_at:'2026-09-08T00:00:00Z'}]})
    .mockResolvedValueOnce({page:1,has_more:false,items:[]});
  const view=render(<SellerPublications active={false} enabled/>);expect(api.readPublicationPage).not.toHaveBeenCalled();
  view.rerender(<SellerPublications active enabled/>);await screen.findByText('Retail');
  expect(screen.getByText('Published')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Next page'}));await screen.findByText(/No Workspace listings on this page/);
  expect(api.readPublicationPage.mock.calls[1][0]).toBe(1);
  expect((screen.getByRole('button',{name:'Next page'}) as HTMLButtonElement).disabled).toBe(true);
});
it('does not claim an empty list when the server cannot be reached',async()=>{
  api.readPublicationPage.mockRejectedValue(new Error('network'));render(<SellerPublications active enabled/>);
  await screen.findByRole('alert');expect(screen.queryByText(/No Workspace listings/)).toBeNull();
});
