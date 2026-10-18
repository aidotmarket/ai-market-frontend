// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import SellerPreparation from './SellerPreparation';
import {nativeClient,nativeSession} from '@/api/connector-seller-settings';
import {useAuthStore} from '@/store/auth';
import {instrument,id,hash} from '@/tests/fixtures/seller-authority';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
import type {User} from '@/types';
const row=instrument();
const approval={id:row.binding.approval_id,draft_id:row.binding.draft_id,draft_version:3,review_hash:hash,render_hash:hash,license_selection:row.license_selection} as ApprovalReceipt;
const switches={seller:true,bulk:true,floors:true,tools:{publish_listing:false,unpublish_listing:false,bulk_publish_listings:false,bulk_unpublish_listings:false,bulk_update_listings:false}};
beforeEach(()=>{window.history.replaceState({},'', '/dashboard/seller-workspace');useAuthStore.setState({user:{id:id(99)} as User,token:'session'});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function mockReads(existing:boolean,status=200) {
  return vi.spyOn(nativeClient,'get').mockImplementation(async path=>{
    if(String(path).endsWith('connector-switches'))return {status,data:switches};
    if(String(path).endsWith('listing-preparation')) {
      if(existing)return {data:row};
      throw {isAxiosError:true,response:{status:404,data:{detail:'NOT_FOUND'}}};
    }
    return {data:{full_text:'Complete fixture legal terms'}};
  });
}
it('retries the same user action then recovers on remount without a second preparation',async()=>{
  const reads=mockReads(false);const post=vi.spyOn(nativeClient,'post').mockRejectedValueOnce(new Error('network')).mockResolvedValue({data:row});
  const props={approval,active:true,onChange:vi.fn(),onLoaded:vi.fn()};
  const first=render(<SellerPreparation {...props}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Prepare for publishing'}));
  await screen.findByText(/Preparation could not be confirmed/);
  fireEvent.click(screen.getByRole('button',{name:'Prepare for publishing'}));
  await screen.findByText('Needs signing');
  expect(post).toHaveBeenCalledTimes(2);expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
  first.unmount();reads.mockRestore();mockReads(true);
  render(<SellerPreparation {...props}/>);await screen.findByText('Needs signing');
  expect(screen.queryByRole('button',{name:'Prepare for publishing'})).toBeNull();expect(post).toHaveBeenCalledTimes(2);
});
it('renders the preloaded panel on the workspace with real B3 hook and all publication tools off',async()=>{
  const get=mockReads(true);render(<SellerPreparation approval={approval} active onChange={vi.fn()} onLoaded={vi.fn()}/>);
  await screen.findByRole('region',{name:'Workspace batch licence signing'});
  await waitFor(()=>expect(screen.getAllByText('Complete fixture legal terms')).toHaveLength(2));
  expect(screen.queryByLabelText(/Prepared instrument IDs/)).toBeNull();
  expect((screen.getByRole('button',{name:'Sign 1 licences'}) as HTMLButtonElement).disabled).toBe(true);
  expect(get).toHaveBeenCalledWith('/seller-workspace/connector-switches',{headers:nativeSession().headers});
});
it.each([401,403,404,503])('hides signing with a neutral message for B3 HTTP %i even with an enabled-looking body',async status=>{
  mockReads(true,status);render(<SellerPreparation approval={approval} active onChange={vi.fn()} onLoaded={vi.fn()}/>);
  await screen.findByText('Needs signing');await screen.findByText('Licence signing is currently unavailable.');
  expect(screen.queryByRole('region',{name:'Workspace batch licence signing'})).toBeNull();
});

it('uses NativeSellerAuth for a missing first-party session',async()=>{
  useAuthStore.setState({token:null});
  render(<SellerPreparation approval={approval} active onChange={vi.fn()} onLoaded={vi.fn()}/>);
  await screen.findByText('Sign in again to prepare this listing.');
  expect(screen.getByRole('link',{name:'Sign in again'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Prepare for publishing'})).toBeNull();
});

it('hides signing when B3 returns 200 with floors off',async()=>{
  mockReads(true).mockImplementation(async path=>String(path).endsWith('connector-switches')?{status:200,data:{...switches,floors:false}}:{data:row});
  render(<SellerPreparation approval={approval} active onChange={vi.fn()} onLoaded={vi.fn()}/>);
  await screen.findByText('Needs signing');await screen.findByText('Licence signing is currently unavailable.');
  expect(screen.queryByRole('region',{name:'Workspace batch licence signing'})).toBeNull();
});
