import { isAuthSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { isCanonicalDraftUuid, isSellerWorkspacePath, type SellerWorkspaceCrashProof } from '@/lib/seller-workspace-crash';
import { useAuthStore } from '@/store/auth';

type SellerSession = { owner: string; generation: number; token: string };

function getCurrentSellerSessionToken(session: SellerSession): string | null {
  const auth = useAuthStore.getState();
  return isAuthSessionOwner(session.generation) && auth.user?.id === session.owner &&
    auth.token === session.token && auth.isAuthenticated && auth.hydrated && !auth.isLoading &&
    !auth.pendingTwoFactor ? auth.token : null;
}

type CrashObservation = {
  pathname: string;
  session: SellerSession;
  getProof: SellerWorkspaceCrashProof;
  dispose: () => void;
  draftRevision: number;
  draft?: { uuid: string };
};
let rootAccess: CrashObservation | undefined;
// The dashboard can retain the snapshot for navigation while it revalidates.
const invalidatedObservations = new WeakSet<SellerSession>();

export function clearRootSellerCrashAccess() {
  rootAccess?.dispose();
  rootAccess = undefined;
}

export function discardRootSellerCrashAccessOutside(pathname: string | null) {
  if (!isSellerWorkspacePath(pathname)) clearRootSellerCrashAccess();
}

export function getSellerWorkspaceCrashProof(session: SellerSession) {
  const token = getCurrentSellerSessionToken(session);
  if (!token) return null;
  const draft = rootAccess?.session === session && isSellerWorkspacePath(rootAccess.pathname)
    ? rootAccess.draft : undefined;
  return { token, draft };
}

export function clearSellerWorkspaceCrashDraft() {
  if (!rootAccess) return;
  rootAccess.draftRevision++;
  rootAccess.draft = undefined;
}

export function beginSellerWorkspaceDraftObservation() {
  const access = rootAccess;
  if (!access?.getProof()) return;
  clearSellerWorkspaceCrashDraft();
  const revision = access.draftRevision;
  return (draftId: unknown) => {
    if (access.draftRevision === revision && access.getProof() && isCanonicalDraftUuid(draftId)) {
      access.draft = { uuid: draftId };
    }
  };
}

// A conflicting response invalidates the optional pointer within the same
// capability observation. Only the current draft store can establish it again.
export function checkSellerWorkspaceCrashDraft() {
  const access = rootAccess;
  return (currentDraftId: unknown, expectedDraftId?: string | null) => {
    const proof = access?.getProof();
    const previous = proof?.draft?.uuid ?? expectedDraftId;
    if (proof && isCanonicalDraftUuid(previous) && currentDraftId !== previous) {
      clearSellerWorkspaceCrashDraft();
    }
  };
}

// The dashboard publishes its completed active capability observation here.
// Next replaces that tree on a root crash, so disposal is tied to the proof.
export function observeRootSellerCrashAccess(pathname: string | null, session: SellerSession) {
  clearRootSellerCrashAccess();
  if (pathname === null || !isSellerWorkspacePath(pathname) || invalidatedObservations.has(session) || !getCurrentSellerSessionToken(session)) return;

  const invalidate = () => {
    invalidatedObservations.add(session);
    clearRootSellerCrashAccess();
  };
  const unsubscribeAuth = useAuthStore.subscribe(() => {
    if (!getCurrentSellerSessionToken(session)) invalidate();
  });
  const unsubscribeOwner = subscribeAuthSessionOwner(invalidate);
  window.addEventListener('capabilities:changed', invalidate);
  const observation: CrashObservation = {
    pathname, session, draftRevision: 0,
    getProof: () => rootAccess === observation && isSellerWorkspacePath(pathname) ? getSellerWorkspaceCrashProof(session) : null,
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
  return rootAccess?.getProof ?? null;
}
