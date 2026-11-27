'use client';
import {Component,createContext,createRef,useContext,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
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
const CurrentEvidence = createContext(true);
const LEASE_MS = 10 * 60_000;

export function useCurrentListingEvidence() {
  return useContext(CurrentEvidence);
}

export function CurrentListingEvidence({children, required = true, fallback = null}: {
  children: ReactNode; required?: boolean; fallback?: ReactNode;
}) {
  const fresh = useCurrentListingEvidence();
  return fresh || !required ? children : fallback;
}

export function CurrentListingLayout({children, className, expired}: {
  children: ReactNode; className: string; expired?: boolean;
}) {
  const current = useCurrentListingEvidence();
  return <ListingLayout className={className} expired={expired ?? !current}>{children}</ListingLayout>;
}

type LayoutProps = {children: ReactNode; className: string; expired: boolean};
type ScrollSnapshot = {height: number; top: number} | null;

class ListingLayout extends Component<LayoutProps, object, ScrollSnapshot> {
  private layout = createRef<HTMLDivElement>();

  getSnapshotBeforeUpdate(previous: LayoutProps): ScrollSnapshot {
    if (previous.expired || !this.props.expired || !this.layout.current) return null;
    return {height: this.layout.current.getBoundingClientRect().height, top: window.scrollY};
  }

  componentDidUpdate(previous: LayoutProps, _state: object, snapshot: ScrollSnapshot) {
    const layout = this.layout.current!;
    // Restore the scrollable extent from before React removed the expired terms.
    if (snapshot) {
      layout.style.minHeight = `${snapshot.height}px`;
      if (window.scrollY !== snapshot.top) window.scrollTo({top: snapshot.top, behavior: 'instant'});
    } else if (previous.expired && !this.props.expired) {
      layout.style.removeProperty('min-height');
    }
  }

  render() {
    return <div ref={this.layout} className={this.props.className}
      style={this.props.expired ? {overflowAnchor: 'none'} : undefined}>{this.props.children}</div>;
  }
}

export type ListingProjection = {observedAt: number; content: ReactNode};

export default function CurrentDisplayFreshness({observedAt,children,refreshAction}: {
  observedAt: number; children: ReactNode; refreshAction: () => Promise<ListingProjection | null>;
}) {
  const [replacement,setReplacement] = useState<(ListingProjection & {replaces: number}) | null>(null);
  const current = replacement?.replaces === observedAt ? replacement : null;
  const projection = current?.observedAt ?? observedAt;
  const [expired,setExpired] = useState(false);
  const requestRefresh = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const lease = deliveredLease(projection);
    let disposed = false;
    let pending = false;
    let deadline: ReturnType<typeof setTimeout>;
    const check = () => {
      const elapsed = performance.now() - lease.start;
      // A wall discontinuity can invalidate a paused monotonic clock.
      if (Math.abs(Date.now() - lease.wallStart - elapsed) > 60_000) lease.invalid = true;
      const stale = lease.invalid || elapsed >= LEASE_MS;
      setExpired(stale);
      clearTimeout(deadline);
      if (!stale) deadline = setTimeout(check, LEASE_MS - elapsed);
      return stale;
    };
    const refresh = async () => {
      check();
      if (pending) return;
      pending = true;
      try {
        const next = await refreshAction();
        if (!disposed && next && next.observedAt !== projection) {
          // Revisiting the original router-cache entry must not revive this projection.
          lease.invalid = true;
          setReplacement({...next, replaces: observedAt});
        }
      } catch {
        // Transport failures leave the existing projection's lease in place.
      } finally {
        pending = false;
      }
    };
    requestRefresh.current = refresh;
    const tick = setInterval(refresh, 5 * 60_000);
    const visibility = () => {if (document.visibilityState === 'visible') void refresh();};
    const restore = (event: PageTransitionEvent) => {if (event.persisted) void refresh();};
    const resume = () => {void refresh();};
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pageshow',restore);
    document.addEventListener('resume',resume);
    if (check()) void refresh();
    return () => {
      disposed = true;
      clearTimeout(deadline);
      clearInterval(tick);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pageshow',restore);
      document.removeEventListener('resume',resume);
    };
  }, [observedAt,projection,refreshAction]);

  return <CurrentEvidence.Provider value={!expired}>
    {current ? current.content : children}
    {expired && <p role="status" className="fixed inset-x-0 bottom-0 z-10 mx-auto w-fit rounded-t-lg border bg-white px-4 py-2 text-sm shadow">
      <button type="button" onClick={() => requestRefresh.current()} className="underline">Refresh current display</button>
    </p>}
  </CurrentEvidence.Provider>;
}
