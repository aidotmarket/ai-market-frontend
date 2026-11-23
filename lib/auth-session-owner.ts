// Page-local lifecycle ownership. Token rotation deliberately does not advance it.
// This fences JavaScript work, not browser processing of HttpOnly Set-Cookie.
let generation = 0;
let ownerChannel: BroadcastChannel | null = null;
let signalUsers = 0;
type OwnerChange = 'changed' | 'restored';
const restoredPage = (event: PageTransitionEvent) => { if (event.persisted) advanceOwner(false, 'restored'); };
const listeners = new Set<(change: OwnerChange) => void>();
export function subscribeAuthSessionOwner(listener: (change: OwnerChange) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const authSessionOwner = (): number => generation;
function advanceOwner(broadcast: boolean, change: OwnerChange): number {
  ++generation;
  if (broadcast) { try { ownerChannel?.postMessage({ type: 'owner_changed' }); } catch { /* Local fences still apply. */ } }
  listeners.forEach((listener) => listener(change));
  return generation;
}
export const advanceAuthSessionOwner = (broadcast = true): number => advanceOwner(broadcast, 'changed');
export const isAuthSessionOwner = (owner: number): boolean => owner === generation;

export function assertAuthSessionOwner(owner: number): void {
  if (!isAuthSessionOwner(owner)) {
    throw new Error('Authentication operation superseded');
  }
}

// Only an invalidation signal crosses tabs. No identity, draft, receipt or token.
export function installAuthSessionOwnerSignals(): () => void {
  if (++signalUsers === 1) {
    if (typeof window !== 'undefined') window.addEventListener('pageshow', restoredPage);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        ownerChannel = new BroadcastChannel('ai-market-auth-owner');
        ownerChannel.onmessage = event => {
          if (event.data?.type === 'owner_changed') advanceAuthSessionOwner(false);
        };
      } catch { ownerChannel = null; }
    }
  }
  return () => {
    if (--signalUsers !== 0) return;
    ownerChannel?.close(); ownerChannel = null;
    if (typeof window !== 'undefined') window.removeEventListener('pageshow', restoredPage);
  };
}
