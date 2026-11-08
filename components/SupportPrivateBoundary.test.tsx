// @vitest-environment jsdom
import '@/tests/support-network-trap';
import '@/tests/support-private-network-guard';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({ path: '/support/mailbox-account' as string | null, list: vi.fn(), count: vi.fn(), hydrate: vi.fn(), history: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => ports.path, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/api/notifications', () => ({ getNotifications: ports.list, getUnreadNotificationCount: ports.count, markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
const transport=vi.hoisted(()=>({adapter:vi.fn()}));
vi.mock('axios',async original=>{
  const imported=await original<typeof import('axios')>();const actual=imported.default;
  return {...imported,default:Object.assign((...args:Parameters<typeof actual>)=>actual(...args),actual,
    {create:(config:Parameters<typeof actual.create>[0])=>actual.create({...config,adapter:transport.adapter})})};
});
import { SupportPrivateBoundary } from './SupportPrivateBoundary';
import { useAuthStore } from '@/store/auth';
import { principal } from '@/tests/support-fixtures';
import { profileRecovery, pendingProfileChanges } from '@/api/support';
const actualRecoveryRead=profileRecovery.read;
const recoveryRead=vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); principal(); useAuthStore.setState({ hydrate: ports.hydrate, hydrated:true, isLoading:false });
  recoveryRead.mockReset().mockResolvedValue([]);vi.spyOn(profileRecovery,'read').mockImplementation(recoveryRead);
  ports.list.mockResolvedValue({ items: [] }); ports.count.mockResolvedValue({ unread_count: 0 });
  ports.history.mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) });
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('retained-general-session');
  vi.stubGlobal('fetch', ports.history); // Explicit fake history port, never native fetch.
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['/support/mailbox-account', '/support/mailbox-account/', null])('never mounts actual normal providers/history/notifications/widgets on private or unresolved path %s', async path => {
  ports.path = path;
  render(<SupportPrivateBoundary><main>Private account confirmation</main></SupportPrivateBoundary>);
  await act(async () => {});
  expect(screen.getByText('Private account confirmation')).toBeTruthy();
  expect(document.querySelector('header')).toBeNull(); expect(document.querySelector('footer')).toBeNull();
  expect(document.getElementById('allai-launcher')).toBeNull(); expect(screen.queryByLabelText(/Notifications/)).toBeNull();
  expect(ports.hydrate).not.toHaveBeenCalled(); expect(Storage.prototype.getItem).not.toHaveBeenCalled();
  expect(ports.history).not.toHaveBeenCalled(); expect(ports.list).not.toHaveBeenCalled(); expect(ports.count).not.toHaveBeenCalled();
  expect(recoveryRead).not.toHaveBeenCalled();expect(screen.queryByLabelText('Pending account changes')).toBeNull();
});
it.each(['/dashboard', '/support', '/requests/example', '/support/mailbox-account-other'])('retains actual normal tree, hydration, history, notifications and allAI on %s', async path => {
  ports.path = path;
  render(<SupportPrivateBoundary><main>Ordinary page</main></SupportPrivateBoundary>);
  await waitFor(() => expect(ports.list).toHaveBeenCalledOnce());
  expect(ports.hydrate).toHaveBeenCalledOnce(); expect(ports.count).toHaveBeenCalledOnce();
  expect(ports.history).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/api\/allai\/support\/anonymous\/session\/retained-general-session$/));
  expect(document.querySelector('header')).toBeTruthy(); expect(document.querySelector('footer')).toBeTruthy();
  const launcher = document.getElementById('allai-launcher'); expect(launcher).toBeTruthy();
  fireEvent.click(launcher!);
  expect(await screen.findByLabelText('Conversation history')).toBeTruthy();
  expect(screen.getByText('Ordinary page')).toBeTruthy();
  expect(recoveryRead).toHaveBeenCalledOnce();
});
it('mounts owned recovery in actual Providers while retaining ordinary widgets and excludes it on mailbox navigation',async()=>{
  ports.path='/dashboard';
  recoveryRead.mockResolvedValue(pendingProfileChanges([{id:'11111111-1111-4111-8111-111111111111',revision:2,created_at:'2026-11-06T12:00:00Z',state:'pending',ready_to_reconfirm:false,intent:{kind:'profile_email',email:'private-recovery@example.test'}}]));
  const tree=render(<SupportPrivateBoundary><main>Normal account</main></SupportPrivateBoundary>);
  await screen.findByText('private-recovery@example.test');
  expect(ports.hydrate).toHaveBeenCalledOnce();expect(document.getElementById('allai-launcher')).toBeTruthy();expect(document.querySelector('header')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Confirm email change'}).hasAttribute('disabled')).toBe(true);
  ports.path='/support/mailbox-account';tree.rerender(<SupportPrivateBoundary><main>Mailbox only</main></SupportPrivateBoundary>);
  expect(screen.queryByText('private-recovery@example.test')).toBeNull();expect(document.getElementById('allai-launcher')).toBeNull();expect(recoveryRead).toHaveBeenCalledOnce();
});

it('normal Providers use the real recovery parser/client with fake Axios and retire in-flight continuation on mailbox navigation',async()=>{
  // Notification/history/hydration are explicit fake ports; recovery runs the
  // real mounted component/controller/API parser through a fake Axios adapter.
  recoveryRead.mockImplementation(actualRecoveryRead);
  const pending=(n:number)=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,revision:1,created_at:'2026-01-01T00:00:00Z',state:'pending',ready_to_reconfirm:true,intent:{kind:'profile_email',email:`provider-${n}@example.test`}});
  const response=(data:unknown)=>({data,status:200,headers:{},config:{}});
  let release!:(value:ReturnType<typeof response>)=>void;
  const late=new Promise<ReturnType<typeof response>>(resolve=>{release=resolve;});
  transport.adapter.mockImplementation(async config=>config.params?.pending_after ? late : response(Array.from({length:100},(_,i)=>pending(i+1))));
  ports.path='/dashboard';const tree=render(<SupportPrivateBoundary><main>Ordinary page</main></SupportPrivateBoundary>);
  await screen.findByText('provider-100@example.test');
  expect(document.querySelector('header')).toBeTruthy();expect(document.getElementById('allai-launcher')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Read more pending changes'}));
  await waitFor(()=>expect(transport.adapter).toHaveBeenCalledTimes(2));
  ports.path='/support/mailbox-account';tree.rerender(<SupportPrivateBoundary><main>Private mailbox</main></SupportPrivateBoundary>);
  await act(async()=>release(response([pending(101)])));
  expect(screen.queryByText('provider-100@example.test')).toBeNull();expect(screen.queryByText('provider-101@example.test')).toBeNull();
  expect(transport.adapter.mock.calls.every(([config])=>config.method==='get')).toBe(true);
  expect(transport.adapter).toHaveBeenCalledTimes(2);expect(document.querySelector('header')).toBeNull();
});
