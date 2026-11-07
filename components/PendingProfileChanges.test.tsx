// @vitest-environment jsdom
import '@/tests/support-network-trap';
import '@/tests/support-private-network-guard';
import axios from 'axios';
import { createHash } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ports=vi.hoisted(()=>({adapter:vi.fn()}));
vi.mock('axios',async original=>{
  const imported=await original<typeof import('axios')>();
  const actual=imported.default;
  return {...imported,default:Object.assign((...args:Parameters<typeof actual>)=>actual(...args),actual,
    {create:(config:Parameters<typeof actual.create>[0])=>actual.create({...config,adapter:ports.adapter})})};
});
import { PendingProfileChanges } from './PendingProfileChanges';
import { pendingProfileChanges, profileRecovery, type PendingProfileChange } from '@/api/support';
import { ProfileRecovery } from '@/lib/profile-recovery';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { deferred, principal, rejection } from '@/tests/support-fixtures';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const token=(seconds=3600)=>`e30.${btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+seconds}))}.sig`;
const row=(patch:Partial<PendingProfileChange>={}):PendingProfileChange=>({id,revision:3,created_at:'2026-11-06T12:00:00Z',state:'pending',ready_to_reconfirm:true,intent:{kind:'profile_email',email:'exact-private@example.test'},...patch});
const ok=(data:unknown)=>({data,status:200,headers:{},config:{}});
const reads=()=>ports.adapter.mock.calls.filter(([config])=>config.method==='get');
const writes=()=>ports.adapter.mock.calls.filter(([config])=>config.method==='post');
beforeEach(()=>{
  vi.clearAllMocks(); principal(); useAuthStore.setState({token:token(),hydrated:true,isLoading:false});
  ports.adapter.mockReset().mockImplementation(async config=>ok(config.method==='get'?[row()]:{state:'applied',request_id:id,revision:3}));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function mount(){render(<PendingProfileChanges/>);await screen.findByText(row().intent.email);}
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
async function readAgain(){click('Read current changes');await waitFor(()=>expect(screen.getByRole('button',{name:'Read current changes'}).hasAttribute('disabled')).toBe(false));}
it('recovers abandoned 409 intent on returning mount, shows exact intent/time/revision and sends one explicit decision with normal CSRF',async()=>{
  const admittedToken=useAuthStore.getState().token!;
  await mount();
  expect(screen.getByText(/Revision 3/)).toBeTruthy();expect(screen.getByText(/Requested/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Review this exact change'})).toBeNull();expect(writes()).toHaveLength(0);
  click('Confirm email change');
  await screen.findByText(/Decision acknowledged/);
  expect(writes()).toHaveLength(1);
  expect(writes()[0][0]).toMatchObject({url:`/support/pending-profile-changes/${id}/reconfirm`,data:JSON.stringify({revision:3,email:row().intent.email})});
  expect(writes()[0][0].headers['X-CSRF-Token']).toBe(createHash('sha256').update('aim.pending.csrf.v1\0'+admittedToken).digest('hex'));
  expect(writes()[0][0].headers.Authorization).toBe('Bearer '+admittedToken);
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);
});
it('reads active then quiescent on focus without applying; cancellation is one explicit current action',async()=>{
  ports.adapter.mockResolvedValueOnce(ok([row({ready_to_reconfirm:false})]));await mount();
  expect(screen.getByRole('button',{name:'Cancel change'}).hasAttribute('disabled')).toBe(true);
  fireEvent.focus(window);await screen.findByText('Ready for your decision.');expect(writes()).toHaveLength(0);
  ports.adapter.mockResolvedValueOnce(ok({state:'cancelled',old_proof_restored:false}));click('Cancel change');await screen.findByText(/Decision acknowledged/);
  expect(writes()[0][0]).toMatchObject({url:`/support/pending-profile-changes/${id}/cancel`,data:'{"revision":3}'});
});
it.each([409,503,'network','unknown200','wrongID','wrongRevision','wrongState','wireArray'])('keeps %s outcome unknown; read must precede another explicit action',async outcome=>{
  await mount();ports.adapter.mockImplementationOnce(async()=>{
    if(typeof outcome==='number')throw rejection(outcome);
    if(outcome==='network')throw Error('synthetic connection loss');
    return ok(outcome==='wrongID'?{state:'applied',request_id:other,revision:3}:outcome==='wrongRevision'?{state:'applied',request_id:id,revision:4}:outcome==='wrongState'?{state:'pending',request_id:id,revision:3}:outcome==='wireArray'?[]:{});
  });click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  click('Confirm email change');expect(writes()).toHaveLength(1);
  await readAgain();expect(writes()).toHaveLength(1);
  click('Confirm email change');await screen.findByText(/Decision acknowledged/);expect(writes()).toHaveLength(2);
});
it.each([{},[],{state:'cancelled'},{state:'cancelled',old_proof_restored:true},{state:'applied',old_proof_restored:false}])('refuses ambiguous cancellation response %j',async response=>{
  await mount();ports.adapter.mockResolvedValueOnce(ok(response));click('Cancel change');await screen.findByText(/Outcome unavailable/);expect(writes()).toHaveLength(1);
});
it.each([403,404])('quietly handles initial %s without a claimed pending decision',async status=>{
  ports.adapter.mockRejectedValue(rejection(status));render(<PendingProfileChanges/>);await act(async()=>{});
  expect(screen.queryByLabelText('Pending account changes')).toBeNull();expect(reads()).toHaveLength(1);
});
it.each([503,'network'])('initial %s uses neutral factual text without an invented email change',async status=>{
  ports.adapter.mockRejectedValue(typeof status==='number'?rejection(status):Error('synthetic'));render(<PendingProfileChanges/>);
  await screen.findByText(/Account changes could not be checked/);expect(screen.queryByText(/needs an explicit decision/)).toBeNull();
});
it.each([403,404,503])('retains owned pending visibility on failed %s read with actions disabled',async status=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(status));await readAgain();
  expect(screen.getByText(row().intent.email)).toBeTruthy();expect(screen.getByText(/last known change/)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);
});
it.each(['applied','cancelled'] as const)('reconciles unknown via server terminal %s without replay',async state=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async()=>ok([row({state,revision:state==='cancelled'?4:3,ready_to_reconfirm:false})]));await readAgain();
  expect(screen.getByText(`Current decision: ${state}.`)).toBeTruthy();expect(screen.getByText(row().intent.email)).toBeTruthy();expect(screen.queryByRole('button',{name:'Confirm email change'})).toBeNull();expect(writes()).toHaveLength(1);
});
it('does not mistake omission from bounded server history for terminal success',async()=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockResolvedValue(ok([]));await readAgain();
  expect(screen.getByText(row().intent.email)).toBeTruthy();expect(screen.getByText(/not present/)).toBeTruthy();expect(writes()).toHaveLength(1);
});
it('same valid session token rotation retains server intent and permits its explicit decision',async()=>{
  await mount();const before=reads().length;act(()=>useAuthStore.setState({token:token(7200)}));
  expect(screen.getByText(row().intent.email)).toBeTruthy();expect(reads()).toHaveLength(before);
  click('Confirm email change');await screen.findByText(/Decision acknowledged/);expect(writes()).toHaveLength(1);
});
it.each(['owner','principal','logout','loading','unhydrated','unauthenticated'])('retires private display immediately on %s and ignores late reads',async departure=>{
  await mount();const late=deferred<ReturnType<typeof ok>>();ports.adapter.mockReturnValueOnce(late.promise).mockResolvedValue(ok([]));click('Read current changes');
  act(()=>{
    if(departure==='owner')advanceAuthSessionOwner();
    if(departure==='principal')principal('buyer','replacement');
    if(departure==='logout')useAuthStore.setState({token:null,user:null,isAuthenticated:false});
    if(departure==='loading')useAuthStore.setState({isLoading:true});
    if(departure==='unhydrated')useAuthStore.setState({hydrated:false});
    if(departure==='unauthenticated')useAuthStore.setState({isAuthenticated:false});
  });
  expect(screen.queryByText(row().intent.email)).toBeNull();
  // Replacement read returns no pending data; old read may not restore it.
  await act(async()=>late.resolve(ok([row()])));expect(screen.queryByText(row().intent.email)).toBeNull();expect(writes()).toHaveLength(0);
});
it.each(['owner','principal','logout'])('blocks delayed post-refresh dispatch after %s departure',async departure=>{
  await mount();useAuthStore.setState({token:token(-60)});const refresh=deferred<{data:{access_token:string}}>();
  const refreshCall=vi.spyOn(axios,'post').mockReturnValue(refresh.promise);click('Confirm email change');await waitFor(()=>expect(refreshCall).toHaveBeenCalledOnce());
  ports.adapter.mockResolvedValue(ok([]));
  act(()=>{if(departure==='owner')advanceAuthSessionOwner();else if(departure==='principal')principal('seller');else useAuthStore.setState({token:null,user:null,isAuthenticated:false});});
  await act(async()=>refresh.resolve({data:{access_token:token()}}));
  expect(writes()).toHaveLength(0);expect(screen.queryByText(row().intent.email)).toBeNull();
});
it('allows same-session preflight refresh then a single admitted mutation',async()=>{
  await mount();useAuthStore.setState({token:token(-60)});vi.spyOn(axios,'post').mockResolvedValue({data:{access_token:token(7200)}});
  click('Confirm email change');await screen.findByText(/Decision acknowledged/);expect(writes()).toHaveLength(1);
});
it.each(['owner','principal','logout'])('ignores late acknowledgement after %s departure',async departure=>{
  await mount();const late=deferred<ReturnType<typeof ok>>();ports.adapter.mockReturnValueOnce(late.promise);click('Confirm email change');await waitFor(()=>expect(writes()).toHaveLength(1));
  ports.adapter.mockResolvedValue(ok([]));act(()=>{if(departure==='owner')advanceAuthSessionOwner();else if(departure==='principal')principal('seller');else useAuthStore.setState({token:null,user:null,isAuthenticated:false});});
  await act(async()=>late.resolve(ok({state:'applied',request_id:id,revision:3})));
  expect(screen.queryByText(/Decision acknowledged/)).toBeNull();expect(screen.queryByText(row().intent.email)).toBeNull();expect(writes()).toHaveLength(1);
});
it.each([null,{},[null],[{...row(),state:4}],[{...row(),state:['pending']}],[{...row(),id:other,revision:'3'}],[{...row(),intent:{kind:'profile_email',email:4}}],[{...row(),intent:[]}],[{...row(),id:''}],[{...row(),created_at:'bad'}],[{...row(),ready_to_reconfirm:'true'}]])('rejects malformed typed read %j',value=>expect(()=>pendingProfileChanges(value)).toThrow('SUPPORT_WIRE_INVALID'));
it('real controller rejects stale/superseded revision, wrong ID and foreign email without dispatch',async()=>{
  const controller=new ProfileRecovery(profileRecovery,()=>true);controller.activate();await controller.read();
  for(const altered of [row({revision:2}),row({id:other}),row({intent:{kind:'profile_email',email:'foreign@example.test'}})])await controller.decide(altered,'reconfirm');
  expect(writes()).toHaveLength(0);await controller.decide(row(),'reconfirm');expect(writes()).toHaveLength(1);controller.retire();
});
it('fresh server revision supersedes a previously displayed command and still requires an explicit click',async()=>{
  const controller=new ProfileRecovery(profileRecovery,()=>true);controller.activate();await controller.read();
  const old=controller.getSnapshot().rows[0];ports.adapter.mockResolvedValueOnce(ok([row({revision:4})]));await controller.read();
  await controller.decide(old,'reconfirm');expect(writes()).toHaveLength(0);
  ports.adapter.mockResolvedValueOnce(ok({state:'applied',request_id:id,revision:4}));
  await controller.decide(controller.getSnapshot().rows[0],'reconfirm');expect(writes()).toHaveLength(1);
  expect(writes()[0][0].data).toBe(JSON.stringify({revision:4,email:row().intent.email}));controller.retire();
});
it('controller uses readiness from its current server read rather than the supplied action object',async()=>{
  ports.adapter.mockResolvedValueOnce(ok([row({ready_to_reconfirm:false})]));
  const controller=new ProfileRecovery(profileRecovery,()=>true);controller.activate();await controller.read();
  await controller.decide(row(),'reconfirm');await controller.decide(row(),'cancel');expect(writes()).toHaveLength(0);controller.retire();
});

// All continuation and exact-result fixtures below are fake Axios responses for
// the immutable terminal224 contract; no native API/provider is exercised.
const pageRow=(n:number):PendingProfileChange=>row({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,created_at:'2026-01-01T00:00:00Z',intent:{kind:'profile_email',email:`pending-${n}@example.test`}});
it('exposes pending overflow one server page per explicit click without POST or automatic crawling',async()=>{
  ports.adapter.mockImplementation(async config=>ok(config.params?.pending_after
    ? [pageRow(101),pageRow(102)] : Array.from({length:100},(_,i)=>pageRow(i+1))));
  render(<PendingProfileChanges/>);await screen.findByText('pending-100@example.test');
  expect(reads()).toHaveLength(1);expect(writes()).toHaveLength(0);
  click('Read more pending changes');await screen.findByText('pending-102@example.test');
  expect(reads()).toHaveLength(2);expect(reads()[1][0].params).toEqual({pending_after:pageRow(100).id});
  expect(screen.getAllByText('pending-1@example.test')).toHaveLength(1);
  expect(screen.queryByRole('button',{name:'Read more pending changes'})).toBeNull();expect(writes()).toHaveLength(0);
});
it('uses the exact owned lookup for an old terminal decision absent from default history and keeps submitted intent visible',async()=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async config=>ok(config.params?.request_id===id
    ? [row({state:'applied',ready_to_reconfirm:false})] : [pageRow(1)]));
  await readAgain();expect(screen.getByText('Current decision: applied.')).toBeTruthy();
  expect(screen.getByText(row().intent.email)).toBeTruthy();
  expect(reads().slice(1).map(([config])=>config.params)).toEqual([undefined,{request_id:id}]);expect(writes()).toHaveLength(1);
});
it.each([
  ['empty',[]],['foreign',[row({id:other,state:'applied'})]],
  ['ambiguous',[row({state:'applied'}),row({state:'applied'})]],
  ['email',[row({state:'applied',intent:{kind:'profile_email',email:'wrong@example.test'}})]],
  ['reversed revision',[row({state:'applied',revision:2})]],
  ['pending supersession contradicted by terminal page',[row({revision:4})]],['superseded applied',[row({state:'applied',revision:4})]],
  ['cancel without revision advance',[row({state:'cancelled',revision:3})]],
  ['cancel beyond exact advance',[row({state:'cancelled',revision:5})]],
  ['changed creation',[row({state:'applied',created_at:'2026-11-05T12:00:00Z'})]],
] as const)('keeps submitted intent unknown for %s exact lookup, even when default suggests success',async(_name,exact)=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async config=>ok(config.params?.request_id ? exact : [row({state:'applied'})]));
  await readAgain();expect(screen.getByText(row().intent.email)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText('Current decision: applied.')).toBeNull();expect(writes()).toHaveLength(1);
});
it.each(['page','exact'])('keeps unknown work and disables actions when the %s half of current reconciliation fails',async failed=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async config=>{
    if ((!!config.params?.request_id)===(failed==='exact')) throw rejection(503);
    return ok(config.params?.request_id ? [row({state:'applied'})] : [pageRow(1)]);
  });await readAgain();expect(screen.getByText(row().intent.email)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);
  expect(writes()).toHaveLength(1);expect(reads()).toHaveLength(3);
});
it('retains loaded selection after first-page refresh but requires its fresh page before another decision',async()=>{
  ports.adapter.mockImplementation(async config=>ok(config.params?.pending_after
    ? [pageRow(101)] : Array.from({length:100},(_,i)=>pageRow(i+1))));
  render(<PendingProfileChanges/>);await screen.findByText('pending-100@example.test');
  click('Read more pending changes');await screen.findByText('pending-101@example.test');
  await readAgain();expect(screen.getByText('pending-101@example.test')).toBeTruthy();
  const buttons=screen.getAllByRole('button',{name:'Confirm email change'});
  expect(buttons[100].hasAttribute('disabled')).toBe(true);expect(buttons[0].hasAttribute('disabled')).toBe(false);
  click('Read more pending changes');await waitFor(()=>expect(screen.getAllByRole('button',{name:'Confirm email change'})[100].hasAttribute('disabled')).toBe(false));
  expect(reads()).toHaveLength(4);expect(writes()).toHaveLength(0);
});
it.each(['cursor409','reversed','duplicate','terminal','sameCursor'])('retains known pending and disables decisions after %s continuation',async failure=>{
  ports.adapter.mockResolvedValueOnce(ok(Array.from({length:100},(_,i)=>pageRow(i+1))));
  render(<PendingProfileChanges/>);await screen.findByText('pending-100@example.test');
  ports.adapter.mockImplementation(async()=>{
    if(failure==='cursor409')throw rejection(409);
    return ok(failure==='reversed'?[pageRow(102),pageRow(101)]:failure==='duplicate'?[pageRow(101),pageRow(101)]
      :failure==='terminal'?[pageRow(101),row({state:'applied'})]:[pageRow(100)]);
  });click('Read more pending changes');await screen.findByText(/last known change/);
  expect(screen.getByText('pending-100@example.test')).toBeTruthy();expect(screen.queryByText('pending-101@example.test')).toBeNull();
  expect(screen.getAllByRole('button',{name:'Confirm email change'}).every(b=>b.hasAttribute('disabled'))).toBe(true);
  expect(reads()).toHaveLength(2);expect(writes()).toHaveLength(0);
});
it('blocks overlapping reads/decisions and bounds full-page continuation to one per click',async()=>{
  ports.adapter.mockResolvedValueOnce(ok(Array.from({length:100},(_,i)=>pageRow(i+1))));
  render(<PendingProfileChanges/>);await screen.findByText('pending-100@example.test');
  const late=deferred<ReturnType<typeof ok>>();ports.adapter.mockReturnValueOnce(late.promise);
  click('Read more pending changes');click('Read more pending changes');click('Read current changes');fireEvent.focus(window);
  fireEvent.click(screen.getAllByRole('button',{name:'Confirm email change'})[0]);
  await waitFor(()=>expect(reads()).toHaveLength(2));expect(writes()).toHaveLength(0);
  await act(async()=>late.resolve(ok(Array.from({length:100},(_,i)=>pageRow(i+101)))));
  expect(reads()).toHaveLength(2);expect(screen.getByRole('button',{name:'Read more pending changes'})).toBeTruthy();
});
it.each(['page','exact'].flatMap(kind=>['owner','principal','logout','loading','unhydrated','unauthenticated'].map(departure=>[kind,departure])))('retires late %s GET on %s departure',async(kind,departure)=>{
  if(kind==='page')ports.adapter.mockResolvedValueOnce(ok(Array.from({length:100},(_,i)=>pageRow(i+1))));
  render(<PendingProfileChanges/>);await screen.findByText(kind==='page'?'pending-100@example.test':row().intent.email);
  if(kind==='exact'){
    ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  }
  const late=deferred<ReturnType<typeof ok>>();
  ports.adapter.mockImplementation(config=>kind==='page'||config.params?.request_id ? late.promise : Promise.resolve(ok([])));
  click(kind==='page'?'Read more pending changes':'Read current changes');
  await waitFor(()=>expect(reads()).toHaveLength(kind==='page'?2:3));
  ports.adapter.mockResolvedValue(ok([]));act(()=>{
    if(departure==='owner')advanceAuthSessionOwner();
    if(departure==='principal')principal('seller','replacement');
    if(departure==='logout')useAuthStore.setState({token:null,user:null,isAuthenticated:false});
    if(departure==='loading')useAuthStore.setState({isLoading:true});
    if(departure==='unhydrated')useAuthStore.setState({hydrated:false});
    if(departure==='unauthenticated')useAuthStore.setState({isAuthenticated:false});
  });
  expect(screen.queryByText(row().intent.email)).toBeNull();expect(screen.queryByText('pending-100@example.test')).toBeNull();
  await act(async()=>late.resolve(ok(kind==='page'?[pageRow(101)]:[row({state:'applied'})])));
  expect(screen.queryByText('pending-101@example.test')).toBeNull();expect(screen.queryByText(/Current decision/)).toBeNull();
  expect(writes()).toHaveLength(kind==='page'?0:1);
});
it('keeps reads inert across focus, explicit reconciliation and continuation with exact pending work',async()=>{
  ports.adapter.mockResolvedValueOnce(ok(Array.from({length:100},(_,i)=>pageRow(i+1))));
  render(<PendingProfileChanges/>);await screen.findByText('pending-100@example.test');
  ports.adapter.mockRejectedValueOnce(rejection(409));fireEvent.click(screen.getAllByRole('button',{name:'Cancel change'})[0]);await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async config=>ok(config.params?.request_id ? [pageRow(1)]
    : config.params?.pending_after ? [pageRow(101)] : Array.from({length:100},(_,i)=>pageRow(i+1))));
  await readAgain();click('Read more pending changes');await screen.findByText('pending-101@example.test');
  fireEvent.focus(window);await waitFor(()=>expect(reads()).toHaveLength(7));
  expect(writes()).toHaveLength(1);expect(screen.getAllByText('pending-1@example.test')).toHaveLength(1);
});
it('refuses reversed current revision without replacing the last owned view',async()=>{
  const controller=new ProfileRecovery(profileRecovery,()=>true);controller.activate();await controller.read();
  ports.adapter.mockResolvedValueOnce(ok([row({revision:2})]));await controller.read();
  await controller.decide(row({revision:2}),'reconfirm');await controller.decide(row(),'reconfirm');
  expect(controller.getSnapshot().rows[0].revision).toBe(3);expect(writes()).toHaveLength(0);controller.retire();
});

it.each([
  {request_id:id,pending_after:other}, {request_id:'bad'}, {pending_after:'bad'}, {},
])('rejects invalid read selectors before fake transport: %j',async query=>{
  await expect(profileRecovery.read(query as never)).rejects.toThrow('SUPPORT_WIRE_INVALID');expect(reads()).toHaveLength(0);expect(writes()).toHaveLength(0);
});
it.each(['pending','terminal'])('refuses an older exact result contradicted by the current %s list',async kind=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async config=>ok(config.params?.request_id ? [row()]
    : [row(kind==='pending'?{revision:4}:{state:'applied'})]));
  await readAgain();expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/outcome remains unknown/)).toBeTruthy();expect(writes()).toHaveLength(1);
});
it('retains uncertain work after real session preflight refresh failure and needs a fresh read plus explicit retry',async()=>{
  await mount();act(()=>useAuthStore.setState({token:token(-60)}));
  const refresh=vi.spyOn(axios,'post').mockRejectedValue(Error('fake refresh unavailable'));
  click('Confirm email change');await screen.findByText(/Outcome unavailable/);expect(writes()).toHaveLength(0);expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByText(row().intent.email)).toBeTruthy();expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);
  await readAgain();expect(writes()).toHaveLength(0);expect(refresh).toHaveBeenCalledOnce();
  refresh.mockResolvedValue({data:{access_token:token(7200)}});click('Confirm email change');await screen.findByText(/Decision acknowledged/);
  expect(writes()).toHaveLength(1);expect(refresh).toHaveBeenCalledTimes(2);
});
it('releases the superseded intent after network loss without replay and still fences later omission',async()=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  const newer=row({revision:4,intent:{kind:'profile_email',email:'newer@example.test'}});
  ports.adapter.mockImplementation(async config=>ok(config.params?.request_id ? [newer] : [newer]));
  await readAgain();expect(screen.getByText('newer@example.test')).toBeTruthy();expect(screen.queryByText(row().intent.email)).toBeNull();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(false);
  expect(screen.getAllByRole('button',{name:'Confirm email change'})).toHaveLength(1);
  expect(screen.queryByText(/^Submitted intent ·/)).toBeNull();
  ports.adapter.mockResolvedValue(ok([]));await readAgain();
  expect(screen.getByText('newer@example.test')).toBeTruthy();expect(screen.queryByText(row().intent.email)).toBeNull();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);expect(writes()).toHaveLength(1);
});
it('never reverses an observed terminal exact result back to pending',async()=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async config=>ok(config.params?.request_id ? [row({state:'applied',ready_to_reconfirm:false})] : []));
  await readAgain();expect(screen.getByText('Current decision: applied.')).toBeTruthy();
  ports.adapter.mockResolvedValue(ok([row()]));await readAgain();
  expect(screen.queryByRole('button',{name:'Confirm email change'})).toBeNull();
  expect(screen.getByText(row().intent.email)).toBeTruthy();expect(writes()).toHaveLength(1);
});

it.each(['reconfirm','cancel'] as const)('supersedes failed %s only after exact current read and requires a new click with the fresh revision/email',async action=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(409));
  click(action==='reconfirm'?'Confirm email change':'Cancel change');await screen.findByText(/Outcome unavailable/);
  const newer=row({revision:4,intent:{kind:'profile_email',email:'fresh@example.test'}});
  ports.adapter.mockResolvedValue(ok([newer]));await readAgain();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('button',{name:'Cancel change'}).hasAttribute('disabled')).toBe(false);
  expect(writes()).toHaveLength(1);
  ports.adapter.mockResolvedValueOnce(ok(action==='cancel'?{state:'cancelled',old_proof_restored:false}:{state:'applied',request_id:id,revision:4}));
  click(action==='reconfirm'?'Confirm email change':'Cancel change');await screen.findByText(/Decision acknowledged/);
  expect(writes()).toHaveLength(2);expect(JSON.parse(writes()[1][0].data)).toEqual(action==='cancel'?{revision:4}:{revision:4,email:'fresh@example.test'});
});

it.each(['reconfirm','cancel'] as const)('network-lost %s with unchanged email is superseded by exact pending revision 4',async action=>{
  await mount();ports.adapter.mockRejectedValueOnce(Error('synthetic loss'));
  click(action==='cancel'?'Cancel change':'Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockResolvedValue(ok([row({revision:4})]));await readAgain();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('button',{name:'Cancel change'}).hasAttribute('disabled')).toBe(false);expect(writes()).toHaveLength(1);
});
it.each(['missing','failed','wrongID','creation','lower','conflict'])('refuses higher pending page when exact lookup is %s',async kind=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(409));click('Cancel change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockImplementation(async config=>{
    if(!config.params?.request_id)return ok([row({revision:4})]);
    if(kind==='failed')throw rejection(503);
    return ok(kind==='missing'?[]:[row({revision:kind==='lower'?2:kind==='conflict'?5:4,
      ...(kind==='wrongID'?{id:other}:kind==='creation'?{created_at:'2020-01-01T00:00:00Z'}:{})})]);
  });await readAgain();expect(screen.getByRole('button',{name:'Cancel change'}).hasAttribute('disabled')).toBe(true);expect(writes()).toHaveLength(1);
});
it('uses exact superseding pending intent even when the bounded page omits it, without crawling',async()=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(409));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  const newer=row({revision:4,intent:{kind:'profile_email',email:'exact-new@example.test'}});
  ports.adapter.mockImplementation(async config=>ok(config.params?.request_id?[newer]:Array.from({length:100},(_,i)=>pageRow(i+1))));
  await readAgain();expect(screen.getByText('exact-new@example.test')).toBeTruthy();
  expect(screen.getAllByRole('button',{name:'Confirm email change'})[0].hasAttribute('disabled')).toBe(false);
  expect(reads()).toHaveLength(3);expect(writes()).toHaveLength(1);
});
it.each(['applied','cancelled'] as const)('retires exact tracking after displayed %s and never reverses the terminal observation through omission',async state=>{
  const controller=new ProfileRecovery(profileRecovery,()=>true);controller.activate();await controller.read();await controller.decide(row(),'cancel');
  ports.adapter.mockResolvedValue(ok([row({state,revision:state==='cancelled'?4:3,ready_to_reconfirm:false})]));await controller.read();
  expect(controller.getSnapshot().submitted).toBeNull();expect(controller.getSnapshot().settled?.state).toBe(state);
  ports.adapter.mockResolvedValue(ok([]));const before=reads().length;await controller.read();expect(reads()).toHaveLength(before+1);
  ports.adapter.mockResolvedValue(ok([row({revision:5})]));await controller.read();
  expect(controller.getSnapshot().rows.find(r=>r.id===id)?.state).toBe(state);expect(controller.canDecide(row({revision:5}))).toBe(false);expect(writes()).toHaveLength(1);controller.retire();
});
it('bounds burst focus reads while manual current read and postdecision reconciliation stay immediate',async()=>{
  vi.useFakeTimers();
  try {
    render(<PendingProfileChanges/>);await act(async()=>{});expect(reads()).toHaveLength(1);
    for(let i=0;i<20;i++)fireEvent.focus(window);
    expect(reads()).toHaveLength(1);await act(async()=>vi.advanceTimersByTimeAsync(250));expect(reads()).toHaveLength(2);
    for(let i=0;i<20;i++)fireEvent.focus(window);
    click('Read current changes');await act(async()=>{});expect(reads()).toHaveLength(3);
    click('Cancel change');await act(async()=>{});expect(writes()).toHaveLength(1);
    click('Read current changes');await act(async()=>{});expect(reads()).toHaveLength(5);
    await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(reads()).toHaveLength(5);
  } finally {vi.useRealTimers();}
});
it.each(['retire','ABA','manual'])('old background timer cannot read after %s',async kind=>{
  vi.useFakeTimers();
  try {
    let current=true;const controller=new ProfileRecovery(profileRecovery,()=>current);controller.activate();await controller.read();
    controller.backgroundRead();
    if(kind==='manual')await controller.read();else {current=false;controller.retire();if(kind==='ABA'){current=true;controller.activate();}}
    const before=reads().length;await vi.advanceTimersByTimeAsync(1000);expect(reads()).toHaveLength(before);expect(writes()).toHaveLength(0);controller.retire();
  }finally{vi.useRealTimers();}
});
it.each([true,false])('orders submillisecond timestamps before UUIDs (ascending=%s)',async ascending=>{
  const early=pageRow(2),late=pageRow(1);early.created_at='2026-01-01T00:00:00.000001Z';late.created_at='2026-01-01T00:00:00.000002Z';
  ports.adapter.mockResolvedValueOnce(ok(ascending?[early,late]:[late,early]));
  const controller=new ProfileRecovery(profileRecovery,()=>true);controller.activate();await controller.read();
  expect(controller.getSnapshot().reconcile).toBe(!ascending);expect(controller.getSnapshot().rows).toHaveLength(ascending?2:0);expect(writes()).toHaveLength(0);controller.retire();
});

it.each(['owner','principal','ABA'])('ignores superseding exact result after %s changes while read is pending',async kind=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(409));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  const exact=deferred<ReturnType<typeof ok>>();ports.adapter.mockImplementation(async config=>config.params?.request_id?exact.promise:ok([]));
  click('Read current changes');await waitFor(()=>expect(reads()).toHaveLength(3));
  ports.adapter.mockResolvedValue(ok([]));
  act(()=>{if(kind==='principal')principal('seller','other');else advanceAuthSessionOwner();});
  if(kind==='ABA')act(()=>advanceAuthSessionOwner());
  await act(async()=>exact.resolve(ok([row({revision:4})])));
  expect(screen.queryByText(row().intent.email)).toBeNull();expect(screen.queryByRole('button',{name:'Confirm email change'})).toBeNull();expect(writes()).toHaveLength(1);
});
