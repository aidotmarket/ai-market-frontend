// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerPublications from './SellerPublications';
import {fetchSummaryPreview} from '@/lib/api';
import {preview} from '@/tests/summaryFixture';
vi.mock('@/lib/api',()=>({fetchSummaryPreview:vi.fn()}));
const api=vi.hoisted(()=>({readPublicationPage:vi.fn()}));vi.mock('@/api/sellerListingPublication',()=>api);
afterEach(()=>{cleanup();vi.unstubAllEnvs();});beforeEach(()=>vi.resetAllMocks());
it.each(['UTC','Europe/Madrid','America/Los_Angeles'])('shows UTC publication dates near midnight in %s',async(timeZone)=>{
  vi.stubEnv('TZ',timeZone);
  api.readPublicationPage.mockResolvedValue({page:0,has_more:false,items:[
    {id:'late',title:'Late UTC',slug:'late',status:'published',is_listed:true,published_at:'2026-09-27T23:30:00Z'},
    {id:'early',title:'Early UTC',slug:'early',status:'published',is_listed:true,published_at:'2026-09-28T00:30:00Z'},
  ]});
  render(<SellerPublications active enabled/>);
  expect(await screen.findByText('Published Sep 27, 2026')).toBeTruthy();
  expect(screen.getByText('Published Sep 28, 2026')).toBeTruthy();
});
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

it('fetches a summary only after its details opens',async()=>{
  api.readPublicationPage.mockResolvedValue({page:0,has_more:false,items:[{id:'one',listing_id:'listing',title:'Retail',slug:'retail',status:'published',is_listed:true,published_at:'2026-09-08T00:00:00Z'}]});
  vi.mocked(fetchSummaryPreview).mockResolvedValue(preview);
  render(<SellerPublications active enabled/>);
  const label=await screen.findByText('Review At a glance');
  expect(fetchSummaryPreview).not.toHaveBeenCalled();
  const details=label.closest('details')!;
  details.open=true; fireEvent(details,new Event('toggle'));
  await screen.findByRole('button',{name:'Approve At a glance'});
  expect(fetchSummaryPreview).toHaveBeenCalledTimes(1);
  details.open=false; fireEvent(details,new Event('toggle'));
  expect(screen.queryByRole('region',{name:'Review At a glance'})).toBeNull();
});
