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
    const read=()=>{controller.backgroundRead();};
    window.addEventListener('focus',read);
    return ()=>{unsubscribe();unsubscribeOwner();window.removeEventListener('focus',read);controller.retire();};
  },[controller,principal,owner]);
  if (!principal || owner!==authSessionOwner()) return null;
  const pending=view.rows.filter(r=>r.state==='pending');
  if (!pending.length && !view.error && !view.settled) return null;
  return <section aria-label="Pending account changes" className="border p-4" aria-busy={view.busy}>
    {pending.length>0 && <p>Email changes last read as pending are shown below. Confirm or cancel explicitly after a current read. Old mailbox proof is not restored by cancellation.</p>}
    {view.readAt && <p>Last read: {new Date(view.readAt).toLocaleString()}. Read again for current readiness.</p>}
    <button disabled={view.busy} onClick={()=>void controller.read()}>Read current changes</button>
    {view.nextPending && <button disabled={view.busy} onClick={()=>void controller.readMore()}>Read more pending changes</button>}
    {view.nextPending && <p>More pending changes may be available. Each click reads one page.</p>}
    {view.error && <p role="status">{view.error}</p>}
    {view.settled && <p>Decided email intent: <strong>{view.settled.intent.email}</strong> · Revision {view.settled.revision}. Current decision: {view.settled.state}.</p>}
    {view.submitted && !pending.some(r=>r.id===view.submitted?.id && r.revision===view.submitted.revision && r.intent.email===view.submitted.intent.email) && <p>Submitted email intent: <strong>{view.submitted.intent.email}</strong> · Revision {view.submitted.revision}. Current owned result: {view.submittedState}.</p>}
    {pending.map(row=><div key={row.id}>
      <p>Change account email to <strong>{row.intent.email}</strong></p>
      {view.submitted?.id===row.id && view.submitted.revision===row.revision && view.submitted.intent.email===row.intent.email && <p>Submitted intent · Current owned result: {view.submittedState}.</p>}
      <p>Requested {new Date(row.created_at).toLocaleString()} · Revision {row.revision}</p>
      {view.readAt && <p>Age at last read: {Math.max(0,Math.floor((view.readAt-Date.parse(row.created_at))/60000))} minutes.</p>}
      <p>{view.reconcile ? 'Read current changes before deciding.' : !controller.isFresh(row) ? 'Last known change. Read its pending page before deciding.' : row.ready_to_reconfirm ? 'Ready for your decision.' : 'A prior send is still active. Read again later.'}</p>
      <button disabled={!controller.canDecide(row)}
        onClick={()=>void controller.decide(row,'reconfirm')}>Confirm email change</button>
      <button disabled={!controller.canDecide(row)}
        onClick={()=>void controller.decide(row,'cancel')}>Cancel change</button>
    </div>)}
  </section>;
}
