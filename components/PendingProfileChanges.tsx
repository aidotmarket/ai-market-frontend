"use client";
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/auth';
import { authSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { profileRecovery } from '@/api/support';
import { ProfileRecovery } from '@/lib/profile-recovery';

export function PendingProfileChanges() {
  const principal=useAuthStore(s=>s.hydrated && !s.isLoading && s.isAuthenticated && s.token ? s.user?.id : null);
  const owner=useSyncExternalStore(subscribeAuthSessionOwner,authSessionOwner,authSessionOwner);
  const controller=useMemo(()=>new ProfileRecovery(profileRecovery,()=>
    authSessionOwner()===owner && !!principal && !!useAuthStore.getState().token && useAuthStore.getState().isAuthenticated
      && useAuthStore.getState().hydrated && !useAuthStore.getState().isLoading
      && useAuthStore.getState().user?.id===principal),[principal,owner]);
  const view=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  useEffect(()=>{
    if (!principal) return;
    const retire=()=>{
      const state=useAuthStore.getState();
      if (authSessionOwner()!==owner || !state.token || state.user?.id!==principal || !state.isAuthenticated || !state.hydrated || state.isLoading) controller.retire();
    };
    const unsubscribe=useAuthStore.subscribe(retire);
    const unsubscribeOwner=subscribeAuthSessionOwner(retire);
    controller.activate();
    void controller.read();
    const read=()=>{void controller.read();};
    window.addEventListener('focus',read);
    return ()=>{unsubscribe();unsubscribeOwner();window.removeEventListener('focus',read);controller.retire();};
  },[controller,principal,owner]);
  if (!principal || owner!==authSessionOwner()) return null;
  const pending=view.rows.filter(r=>r.state==='pending');
  if (!pending.length && !view.error) return null;
  return <section aria-label="Pending account changes" className="border p-4" aria-busy={view.busy}>
    {pending.length>0 && <p>Your email change needs an explicit decision. Old mailbox proof is not restored by cancellation.</p>}
    {view.readAt && <p>Last read: {new Date(view.readAt).toLocaleString()}. Read again for current readiness.</p>}
    <button disabled={view.busy} onClick={()=>void controller.read()}>Read current changes</button>
    {view.error && <p role="status">{view.error}</p>}
    {pending.map(row=><div key={row.id}>
      <p>Change account email to <strong>{row.intent.email}</strong></p>
      <p>Requested {new Date(row.created_at).toLocaleString()} · Revision {row.revision}</p>
      {view.readAt && <p>Age at last read: {Math.max(0,Math.floor((view.readAt-Date.parse(row.created_at))/60000))} minutes.</p>}
      <p>{row.ready_to_reconfirm ? 'Ready for your decision.' : 'A prior send is still active. Read again later.'}</p>
      <button disabled={view.busy || view.reconcile || !row.ready_to_reconfirm}
        onClick={()=>void controller.decide(row,'reconfirm')}>Confirm email change</button>
      <button disabled={view.busy || view.reconcile || !row.ready_to_reconfirm}
        onClick={()=>void controller.decide(row,'cancel')}>Cancel change</button>
    </div>)}
  </section>;
}
