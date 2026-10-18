// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SellerPublication from './SellerPublication';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
import {nativeClient} from '@/api/connector-seller-settings';
import {useAuthStore} from '@/store/auth';
import {instrument,id,hash} from '@/tests/fixtures/seller-authority';
import {createStandardSelection} from '@/api/listingLicenses';
const api=vi.hoisted(()=>({readPublication:vi.fn(),publishListing:vi.fn()}));
vi.mock('@/api/sellerListingPublication',()=>api);
const approval={id:'approval',review_hash:'a',render_hash:'b'} as ApprovalReceipt;
const publication={title:'Retail',slug:'retail',status:'published',is_listed:true};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
beforeEach(()=>{vi.resetAllMocks();api.readPublication.mockResolvedValue({publication_available:true,publication:null});});
it('requires a click and the approved render before publishing',async()=>{
  const view=render(<SellerPublication approval={approval} active rendered={false}/>);
  const button=await screen.findByRole('button',{name:'Publish this listing'});
  expect((button as HTMLButtonElement).disabled).toBe(true);expect(api.publishListing).not.toHaveBeenCalled();
  expect(screen.getByText('Wait for the saved review to finish loading before publishing.')).toBeTruthy();
  view.rerender(<SellerPublication approval={approval} active rendered/>);
  const changed=vi.fn();window.addEventListener('capabilities:changed',changed);
  api.publishListing.mockResolvedValue(publication);fireEvent.click(button);
  await screen.findByText(/published and available/);
  expect(changed).toHaveBeenCalledOnce();window.removeEventListener('capabilities:changed',changed);
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

it('puts publication refresh on its own spaced line',async()=>{
 api.readPublication.mockResolvedValue({publication_available:true,publication:null});
 render(<SellerPublication approval={approval} active rendered/>);
 await screen.findByRole('button',{name:'Publish this listing'});
 expect(screen.getByRole('button',{name:'Refresh publication status'}).className).toContain('block w-fit pt-2');
});

it('waits for preparation recovery and forwards the signed preparation on the website publish action',async()=>{
  useAuthStore.setState({token:'native-session'});
  const row={...instrument(),status:'signed',signing_required:false,acceptance_id:id(20),signed_coverage_hash:hash};
  const named={...approval,id:row.binding.approval_id,draft_id:row.binding.draft_id,draft_version:3,render_hash:hash};
  let finish!:(value:unknown)=>void;
  const get=vi.spyOn(nativeClient,'get').mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  try {
    render(<SellerPublication approval={named} active rendered/>);
    const button=await screen.findByRole('button',{name:'Publish this listing'});
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async()=>finish({data:row}));await screen.findByText('Ready to publish here or from Claude');
    api.publishListing.mockResolvedValue(publication);fireEvent.click(button);
    await screen.findByText('Published');
    expect(api.publishListing).toHaveBeenCalledWith(named,expect.any(String),expect.any(AbortSignal),row.id);
  } finally {get.mockRestore();}
});

const prepared={...instrument(),license_selection:undefined};
const namedApproval={...approval,id:prepared.binding.approval_id,draft_id:prepared.binding.draft_id,draft_version:3,render_hash:hash};
const notFound={isAxiosError:true,response:{status:404,data:{detail:'NOT_FOUND'}}};
function namedReads() {
  useAuthStore.setState({token:'native-session'});
  return vi.spyOn(nativeClient,'get').mockRejectedValue(notFound);
}
function deferred<T>() {
  let resolve!:(value:T)=>void, reject!:(error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
it('blocks publish while prepare is pending and after a lost response until B2 recovers its signed ID',async()=>{
  const get=namedReads();const create=deferred<unknown>();
  const post=vi.spyOn(nativeClient,'post').mockReturnValue(create.promise);
  render(<SellerPublication approval={namedApproval} active rendered/>);
  const prepare=await screen.findByRole('button',{name:'Prepare for publishing'});
  const publish=screen.getByRole('button',{name:'Publish this listing'}) as HTMLButtonElement;
  fireEvent.click(prepare);expect(publish.disabled).toBe(true);
  fireEvent.click(publish);expect(api.publishListing).not.toHaveBeenCalled();
  await act(async()=>create.reject(new Error('timeout')));
  await screen.findByText(/Preparation could not be confirmed/);
  expect(publish.disabled).toBe(true);fireEvent.click(publish);expect(api.publishListing).not.toHaveBeenCalled();
  const recovery=deferred<unknown>();get.mockReturnValue(recovery.promise);
  fireEvent.click(screen.getByRole('button',{name:'Refresh preparation status'}));
  expect(publish.disabled).toBe(true);
  const signed={...prepared,status:'signed',signing_required:false,acceptance_id:id(20),signed_coverage_hash:hash};
  await act(async()=>recovery.resolve({data:signed}));
  await waitFor(()=>expect(publish.disabled).toBe(false));
  api.publishListing.mockResolvedValue(publication);fireEvent.click(publish);
  await screen.findByText(/published and available/);
  expect(post).toHaveBeenCalledOnce();
  expect(api.publishListing).toHaveBeenCalledWith(namedApproval,expect.any(String),expect.any(AbortSignal),signed.id);
});
it('keeps publish blocked after a delayed successful preparation still needs signing',async()=>{
  namedReads();const create=deferred<unknown>();vi.spyOn(nativeClient,'post').mockReturnValue(create.promise);
  render(<SellerPublication approval={namedApproval} active rendered/>);
  fireEvent.click(await screen.findByRole('button',{name:'Prepare for publishing'}));
  const publish=screen.getByRole('button',{name:'Publish this listing'}) as HTMLButtonElement;
  expect(publish.disabled).toBe(true);
  await act(async()=>create.resolve({data:prepared}));await screen.findByText('Needs signing');
  expect(publish.disabled).toBe(true);fireEvent.click(publish);expect(api.publishListing).not.toHaveBeenCalled();
});
it('blocks prepare while ordinary publication is pending and hides it after publication',async()=>{
  namedReads();const post=vi.spyOn(nativeClient,'post');const pending=deferred<unknown>();api.publishListing.mockReturnValue(pending.promise);
  render(<SellerPublication approval={namedApproval} active rendered/>);
  const prepare=await screen.findByRole('button',{name:'Prepare for publishing'}) as HTMLButtonElement;
  fireEvent.click(screen.getByRole('button',{name:'Publish this listing'}));
  expect(prepare.disabled).toBe(true);fireEvent.click(prepare);expect(post).not.toHaveBeenCalled();
  await act(async()=>pending.resolve(publication));await screen.findByText(/published and available/);
  expect(screen.queryByRole('button',{name:'Prepare for publishing'})).toBeNull();
});
it('keeps prepare blocked after an unknown publication outcome until publication recovery',async()=>{
  namedReads();api.publishListing.mockRejectedValue(new Error('timeout'));
  render(<SellerPublication approval={namedApproval} active rendered/>);
  const prepare=await screen.findByRole('button',{name:'Prepare for publishing'}) as HTMLButtonElement;
  fireEvent.click(screen.getByRole('button',{name:'Publish this listing'}));await screen.findByRole('alert');
  expect(prepare.disabled).toBe(true);
  api.readPublication.mockResolvedValue({publication_available:true,publication});
  fireEvent.click(screen.getByRole('button',{name:'Refresh publication status'}));
  await screen.findByText(/published and available/);
  expect(screen.queryByRole('button',{name:'Prepare for publishing'})).toBeNull();
});
it('never offers prepare for a recovered ordinary publication',async()=>{
  namedReads();api.readPublication.mockResolvedValue({publication_available:true,publication});
  render(<SellerPublication approval={namedApproval} active rendered/>);
  await screen.findByText(/published and available/);
  expect(screen.queryByRole('button',{name:'Prepare for publishing'})).toBeNull();
});
it('allows named-draft website publication without preparation_id when B2 is 404 UNAVAILABLE',async()=>{
  namedReads().mockRejectedValue({isAxiosError:true,response:{status:404,data:{detail:'UNAVAILABLE'}}});
  api.publishListing.mockResolvedValue(publication);
  render(<SellerPublication approval={namedApproval} active rendered/>);
  const publish=await screen.findByRole('button',{name:'Publish this listing'}) as HTMLButtonElement;
  await waitFor(()=>expect(publish.disabled).toBe(false));
  expect(screen.queryByRole('region',{name:'Listing preparation'})).toBeNull();
  expect(screen.queryByRole('region',{name:'Workspace batch licence signing'})).toBeNull();
  fireEvent.click(publish);await screen.findByText(/published and available/);
  expect(api.publishListing).toHaveBeenCalledWith(namedApproval,expect.any(String),expect.any(AbortSignal),undefined);
});
it.each([
  [401,'FIRST_PARTY_SESSION_REQUIRED'],[403,'FORBIDDEN'],[500,'UNAVAILABLE'],[503,'UNAVAILABLE'],[404,'OTHER'],[0,'network'],
])('blocks publication on B2 failure %s %s until a successful retry',async(status,detail)=>{
  const get=namedReads().mockRejectedValue(status?{isAxiosError:true,response:{status,data:{detail}}}:new Error(detail));
  render(<SellerPublication approval={namedApproval} active rendered/>);
  await screen.findAllByRole('alert');
  const publish=screen.getByRole('button',{name:'Publish this listing'}) as HTMLButtonElement;
  expect(publish.disabled).toBe(true);fireEvent.click(publish);expect(api.publishListing).not.toHaveBeenCalled();
  get.mockRejectedValue(notFound);
  fireEvent.click(screen.getByRole('button',{name:'Refresh preparation status'}));
  await waitFor(()=>expect(publish.disabled).toBe(false));
});
