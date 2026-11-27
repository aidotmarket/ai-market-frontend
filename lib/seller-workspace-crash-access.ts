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
  pendingSourceReads: number;
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
  if (invalidatedObservations.has(session)) return null;
  const token = getCurrentSellerSessionToken(session);
  if (!token) return null;
  const draft = rootAccess?.session === session && rootAccess.pendingSourceReads === 0 && isSellerWorkspacePath(rootAccess.pathname)
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

export function checkSellerWorkspaceCrashDraft() {
  const access = rootAccess;
  return (currentDraftId: unknown) => {
    if (access?.getProof() && access.draft && currentDraftId !== access.draft.uuid) {
      clearSellerWorkspaceCrashDraft();
    }
  };
}

export function beginSellerWorkspaceCrashSourceRead(expectedDraftId?: string | null) {
  const access = rootAccess;
  if (!access?.getProof()) return;
  // Either read can finish first. Withhold the pointer until they agree.
  access.pendingSourceReads++;
  return (response?: { current_draft_id: unknown }) => {
    access.pendingSourceReads--;
    if (!response || !access.getProof()) return;
    const current = response.current_draft_id;
    if (!access.draft || current !== access.draft.uuid || (expectedDraftId && current !== expectedDraftId)) {
      // A source read cannot prove a pointer. When it finishes before any
      // draft is proven, retire overlapping current-draft reads as well.
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
    pathname, session, draftRevision: 0, pendingSourceReads: 0,
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
