import { isAuthSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { isSellerWorkspacePath } from '@/lib/seller-workspace-crash';
import { useAuthStore } from '@/store/auth';

type SellerSession = { owner: string; generation: number; token: string };

export function getCurrentSellerSessionToken(session: SellerSession): string | null {
  const auth = useAuthStore.getState();
  return isAuthSessionOwner(session.generation) && auth.user?.id === session.owner &&
    auth.token === session.token && auth.isAuthenticated && auth.hydrated && !auth.isLoading &&
    !auth.pendingTwoFactor ? auth.token : null;
}

let rootAccess: { getToken: () => string | null; dispose: () => void } | undefined;
// The dashboard can retain the snapshot for navigation while it revalidates.
const invalidatedObservations = new WeakSet<SellerSession>();

export function clearRootSellerCrashAccess() {
  rootAccess?.dispose();
  rootAccess = undefined;
}

export function discardRootSellerCrashAccessOutside(pathname: string | null) {
  if (!isSellerWorkspacePath(pathname)) clearRootSellerCrashAccess();
}

// The dashboard publishes its completed active capability observation here.
// Next replaces that tree on a root crash, so disposal is tied to the proof.
export function observeRootSellerCrashAccess(pathname: string | null, session: SellerSession) {
  clearRootSellerCrashAccess();
  if (!isSellerWorkspacePath(pathname) || invalidatedObservations.has(session) || !getCurrentSellerSessionToken(session)) return;

  const invalidate = () => {
    invalidatedObservations.add(session);
    clearRootSellerCrashAccess();
  };
  const unsubscribeAuth = useAuthStore.subscribe(() => {
    if (!getCurrentSellerSessionToken(session)) invalidate();
  });
  const unsubscribeOwner = subscribeAuthSessionOwner(invalidate);
  window.addEventListener('capabilities:changed', invalidate);
  const observation = {
    getToken: () => rootAccess === observation ? getCurrentSellerSessionToken(session) : null,
    dispose: () => {
      unsubscribeAuth();
      unsubscribeOwner();
      window.removeEventListener('capabilities:changed', invalidate);
    },
  };
  rootAccess = observation;
}

export function getRootSellerCrashAccess(pathname: string | null) {
  discardRootSellerCrashAccessOutside(pathname);
  return rootAccess?.getToken ?? null;
}
