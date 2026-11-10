'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
// Bounded in-tab retention of the whole current projection, including its HTML.
// This cannot prove origin/CDN convergence; failed refreshes expire the old view.
export default function CurrentDisplayFreshness({observedAt,children}:{observedAt:number;children:ReactNode}) {
  const router=useRouter();
  const [now,setNow]=useState(observedAt);
  useEffect(()=>{
    const refresh=()=>{setNow(Date.now());router.refresh();};
    const tick=setInterval(refresh,5*60_000);
    const visibility=()=>{if(document.visibilityState==='visible')refresh();};
    const restore=(event:PageTransitionEvent)=>{if(event.persisted)refresh();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pageshow',restore);
    setNow(Date.now());
    return ()=>{clearInterval(tick);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',restore);};
  },[router,observedAt]);
  if(now-observedAt>=10*60_000)return <p role="status">Refresh this page to load the current public listing display. <button type="button" onClick={()=>router.refresh()} className="underline">Refresh current display</button></p>;
  return children;
}
