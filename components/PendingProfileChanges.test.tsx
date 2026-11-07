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
  ports.adapter.mockResolvedValueOnce(ok([row({state,revision:state==='cancelled'?4:3,ready_to_reconfirm:false})]));await readAgain();
  expect(screen.getByText(`Current decision: ${state}.`)).toBeTruthy();expect(screen.queryByText(row().intent.email)).toBeNull();expect(writes()).toHaveLength(1);
});
it('does not mistake omission from bounded server history for terminal success',async()=>{
  await mount();ports.adapter.mockRejectedValueOnce(rejection(503));click('Confirm email change');await screen.findByText(/Outcome unavailable/);
  ports.adapter.mockResolvedValueOnce(ok([]));await readAgain();
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
