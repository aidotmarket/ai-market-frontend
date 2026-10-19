// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import axios from 'axios';
import SellerPreparation from './SellerPreparation';
vi.mock('@/components/CompanySignIn',()=>({default:()=> <button>Company sign-in</button>}));
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

it.each(['SSO_REQUIRED','BAD_ORIGIN','CSRF_REQUIRED','FIRST_PARTY_SESSION_REQUIRED','RECENT_LOGIN_REQUIRED'])('offers native authentication for session 403 %s',async detail=>{
  mockReads(false).mockRejectedValue({isAxiosError:true,response:{status:403,data:{detail:{code:detail}}}});
  render(<SellerPreparation approval={approval} active onChange={vi.fn()} onLoaded={vi.fn()}/>);
  await screen.findByText('Sign in again to prepare this listing.');
  if(detail==='SSO_REQUIRED') expect(screen.getByRole('button',{name:'Company sign-in'})).toBeTruthy();
  else expect(screen.getByRole('link',{name:'Sign in again'})).toBeTruthy();
  expect(screen.queryByText(/not allowed by the current seller policy/)).toBeNull();
});
it('keeps a policy denial distinct from authentication failures',async()=>{
  mockReads(false).mockRejectedValue({isAxiosError:true,response:{status:403,data:{detail:'POLICY_DENIED'}}});
  render(<SellerPreparation approval={approval} active onChange={vi.fn()} onLoaded={vi.fn()}/>);
  await screen.findByText(/not allowed by the current seller policy/);
  expect(screen.queryByRole('link',{name:'Sign in again'})).toBeNull();
});

function refreshedWrite(data: unknown) {
  const first = nativeSession();
  let finish!: (value: {data: unknown}) => void;
  const delayed = new Promise<{data: unknown}>(resolve => {finish=resolve;});
  const post=vi.spyOn(nativeClient,'post')
    .mockRejectedValueOnce({isAxiosError:true,response:{status:401}})
    .mockImplementationOnce(()=>delayed);
  const refresh=vi.spyOn(axios,'post').mockResolvedValue({data:{access_token:'refreshed-session'}});
  return {post,refresh,first,complete:()=>finish({data})};
}
function expectRefreshedPair(post: ReturnType<typeof vi.spyOn>, first: ReturnType<typeof nativeSession>) {
  const [path,body,config]=post.mock.calls[0];
  expect(body.request_id).toEqual(expect.any(String));
  expect(config.headers).toEqual(first.headers);
  expect(body.csrf).toBe(first.csrf);
  expect(post.mock.calls[1]).toEqual([path,{...body,csrf:nativeSession().csrf},{...config,headers:nativeSession().headers}]);
}
it.each(['success','failure'])('keeps mounted preparation alive across refresh and shows its %s',async outcome=>{
  mockReads(false);
  const write=refreshedWrite(outcome==='success'?row:{});
  const onChange=vi.fn();
  render(<SellerPreparation approval={approval} active onChange={onChange} onLoaded={vi.fn()}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Prepare for publishing'}));
  await waitFor(()=>expect(write.post).toHaveBeenCalledTimes(2));
  expect(write.refresh).toHaveBeenCalledOnce();
  expectRefreshedPair(write.post,write.first);
  const signal=write.post.mock.calls[0][2]?.signal;
  expect(signal?.aborted).toBe(false);
  await act(async()=>write.complete());
  if(outcome==='success') {
    await screen.findByText('Needs signing');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({id:row.id}));
  } else await screen.findByRole('alert');
});
it.each(['success','failure'])('keeps mounted signing alive through refresh and capability revalidation: %s',async outcome=>{
  const reads=mockReads(true);
  const signed={...row,status:'signed',signed_coverage_hash:row.coverage_hash,signing_required:false,acceptance_id:id(88)};
  const write=refreshedWrite(outcome==='success'?{instruments:[signed]}:{});
  const onChange=vi.fn();
  render(<SellerPreparation approval={approval} active onChange={onChange} onLoaded={vi.fn()}/>);
  await waitFor(()=>expect(screen.getAllByText('Complete fixture legal terms')).toHaveLength(2));
  // Capability revalidation stays pending while the write completes.
  reads.mockImplementation(()=>new Promise(()=>{}));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Sign 1 licences'}));
  await waitFor(()=>expect(write.post).toHaveBeenCalledTimes(2));
  expectRefreshedPair(write.post,write.first);
  expect(write.post.mock.calls[0][2]?.signal?.aborted).toBe(false);
  await act(async()=>write.complete());
  if(outcome==='success') {
    await screen.findByText('Ready to publish here or from Claude');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({status:'signed'}));
  } else await screen.findByRole('alert');
});
it.each(['identity','logout','unmount'])('cancels pending preparation on %s',async change=>{
  mockReads(false);
  let finish!: (value:{data:typeof row})=>void;
  const post=vi.spyOn(nativeClient,'post').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const onChange=vi.fn();
  const view=render(<SellerPreparation approval={approval} active onChange={onChange} onLoaded={vi.fn()}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Prepare for publishing'}));
  await waitFor(()=>expect(post).toHaveBeenCalledOnce());
  if(change==='unmount') view.unmount();
  else act(()=>useAuthStore.setState(change==='logout'?{token:null,user:null}:{user:{id:id(98)} as User}));
  expect(post.mock.calls[0][2]?.signal?.aborted).toBe(true);
  await act(async()=>finish({data:row}));
  expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({id:row.id}));
});

it.each(['identity','logout','unmount'])('cancels pending signing on %s',async change=>{
  mockReads(true);
  const write=refreshedWrite({instruments:[]});
  const onChange=vi.fn();
  const view=render(<SellerPreparation approval={approval} active onChange={onChange} onLoaded={vi.fn()}/>);
  await waitFor(()=>expect(screen.getAllByText('Complete fixture legal terms')).toHaveLength(2));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Sign 1 licences'}));
  await waitFor(()=>expect(write.post).toHaveBeenCalledTimes(2));
  const signal=write.post.mock.calls[0][2]?.signal;
  expect(signal?.aborted).toBe(false);
  if(change==='unmount') view.unmount();
  else act(()=>useAuthStore.setState(change==='logout'?{token:null,user:null}:{user:{id:id(98)} as User}));
  expect(signal?.aborted).toBe(true);
  await act(async()=>write.complete());
  expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({status:'signed'}));
});
