'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
type Lease={start:number;wallStart:number;invalid:boolean};
// Survives router-cache unmount/remount without renewing a delivered projection.
// Bounded tab-local memory; evicted older server tokens stay conservatively stale.
const leases=new Map<number,Lease>();
let evictedThrough=-Infinity;
function deliveredLease(projection:number):Lease {
  const existing=leases.get(projection);
  if(existing)return existing;
  const lease={start:performance.now(),wallStart:Date.now(),invalid:projection<=evictedThrough};
  leases.set(projection,lease);
  if(leases.size>128){
    const oldest=Math.min(...leases.keys());
    evictedThrough=Math.max(evictedThrough,oldest);
    leases.delete(oldest);
  }
  return lease;
}
// Bounded in-tab retention of the whole current projection, including its HTML.
// This cannot prove origin/CDN convergence; failed refreshes expire the old view.
export default function CurrentDisplayFreshness({observedAt,children}:{observedAt:number;children:ReactNode}) {
  const router=useRouter();
  // observedAt identifies a delivered server projection, never a client age.
  // performance.now is unaffected by browser wall-clock offsets/adjustments.
  const lease=useRef<Lease|null>(null);
  const [expired,setExpired]=useState(false);
  useEffect(()=>{
    lease.current=deliveredLease(observedAt);
    const check=()=>{
      const current=lease.current!;
      const elapsed=performance.now()-current.start;
      // A paused monotonic clock during foreground OS sleep may have no
      // visibility event. Wall discontinuity is only an invalidation signal,
      // never an age/renewal source. Either clock adjustment is conservative.
      if(Math.abs(Date.now()-current.wallStart-elapsed)>60_000)current.invalid=true;
      const stale=current.invalid || elapsed>=10*60_000;
      setExpired(stale);
      return stale;
    };
    const refresh=()=>{check();router.refresh();};
    const invalidate=()=>{lease.current!.invalid=true;refresh();};
    const tick=setInterval(refresh,5*60_000);
    // Monotonic clocks can pause during OS sleep. A resumed hidden/bfcached
    // projection therefore needs a fresh response; it cannot earn a new lease.
    const visibility=()=>{if(document.visibilityState==='visible')invalidate();};
    const restore=(event:PageTransitionEvent)=>{if(event.persisted)invalidate();};
    const resume=()=>invalidate();
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pageshow',restore);
    document.addEventListener('resume',resume);
    if(check())router.refresh();
    return ()=>{clearInterval(tick);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',restore);document.removeEventListener('resume',resume);};
  },[router,observedAt]);
  if(expired)return <p role="status">Refresh this page to load the current public listing display. <button type="button" onClick={()=>router.refresh()} className="underline">Refresh current display</button></p>;
  return children;
}
