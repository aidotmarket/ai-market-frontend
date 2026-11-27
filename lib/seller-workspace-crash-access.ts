import { authSessionOwner, isAuthSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { isCanonicalDraftUuid, isSellerWorkspacePath, type SellerWorkspaceCrashProof } from '@/lib/seller-workspace-crash';
import { useAuthStore } from '@/store/auth';

type SellerSession = { owner: string; generation: number; token: string; credentialRevision: number };

let credentialRevision = 0;
let trackingCredentials = false;

export function captureSellerCrashSession(owner: string, token: string): SellerSession {
  // A capability request and its reusable snapshot can outlive a Workspace visit.
  if (!trackingCredentials) {
    useAuthStore.subscribe((next, previous) => {
      if (next.user?.id !== previous.user?.id || next.token !== previous.token ||
        next.isAuthenticated !== previous.isAuthenticated || next.hydrated !== previous.hydrated ||
        next.isLoading !== previous.isLoading || next.pendingTwoFactor !== previous.pendingTwoFactor) {
        credentialRevision++;
        clearRootSellerCrashAccess();
      }
    });
    subscribeAuthSessionOwner(clearRootSellerCrashAccess);
    trackingCredentials = true;
  }
  return { owner, token, generation: authSessionOwner(), credentialRevision };
}

function getCurrentSellerSessionToken(session: SellerSession): string | null {
  const auth = useAuthStore.getState();
  return session.credentialRevision === credentialRevision &&
    isAuthSessionOwner(session.generation) && auth.user?.id === session.owner &&
    auth.token === session.token && auth.isAuthenticated && auth.hydrated && !auth.isLoading &&
    !auth.pendingTwoFactor ? auth.token : null;
}

type WorkspaceVisit = {
  pathname: string;
  dashboardMount: object;
  session: SellerSession;
  pendingSourceReads: number;
};
type CrashObservation = {
  session: SellerSession;
  visit: WorkspaceVisit;
  getProof: SellerWorkspaceCrashProof;
  draftRevision: number;
  draft?: { uuid: string };
};
let rootAccess: CrashObservation | undefined;
let workspaceVisit: WorkspaceVisit | undefined;

// Capability revalidation retires the draft proof and keeps outstanding reads for this visit.
export function retireRootSellerCrashAccess() {
  if (!rootAccess) return;
  window.removeEventListener('capabilities:changed', retireRootSellerCrashAccess);
  rootAccess = undefined;
}

export function clearRootSellerCrashAccess() {
  retireRootSellerCrashAccess();
  workspaceVisit = undefined;
}

export function discardRootSellerCrashAccessOutside(pathname: string | null) {
  if (!isSellerWorkspacePath(pathname)) clearRootSellerCrashAccess();
}

export function getSellerWorkspaceCrashProof(session: SellerSession) {
  const token = getCurrentSellerSessionToken(session);
  if (!token) return null;
  const draft = rootAccess?.session === session && rootAccess.visit.pendingSourceReads === 0 && isSellerWorkspacePath(rootAccess.visit.pathname)
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
  const visit = workspaceVisit;
  if (!visit || !isSellerWorkspacePath(visit.pathname) || !getCurrentSellerSessionToken(visit.session)) return;
  // An outstanding source read can contradict a later draft read in this visit,
  // even when it starts while capability revalidation has retired crash proof.
  visit.pendingSourceReads++;
  return (response?: { current_draft_id: unknown }) => {
    visit.pendingSourceReads--;
    const active = rootAccess;
    if (!response || active?.visit !== visit || !active.getProof()) return;
    const current = response.current_draft_id;
    if (!active.draft || current !== active.draft.uuid || (expectedDraftId && current !== expectedDraftId)) {
      // A source read cannot prove a pointer. When it finishes before any
      // draft is proven, retire overlapping current-draft reads as well.
      clearSellerWorkspaceCrashDraft();
    }
  };
}

// Keep the mounted visit through capability refresh. Next replaces the tree on
// a root crash, so the latest observation also survives that teardown.
export function observeRootSellerCrashAccess(
  pathname: string | null, dashboardMount: object, session: SellerSession | null, active: boolean,
) {
  if (pathname === null || !isSellerWorkspacePath(pathname) || !session || !getCurrentSellerSessionToken(session)) {
    clearRootSellerCrashAccess();
    return;
  }
  retireRootSellerCrashAccess();
  const visit = workspaceVisit?.dashboardMount === dashboardMount
    ? workspaceVisit : { pathname, dashboardMount, session, pendingSourceReads: 0 };
  workspaceVisit = visit;
  if (!active) return;

  const observation: CrashObservation = {
    session, visit, draftRevision: 0,
    getProof: () => rootAccess === observation && isSellerWorkspacePath(pathname) ? getSellerWorkspaceCrashProof(session) : null,
  };
  rootAccess = observation;
  window.addEventListener('capabilities:changed', retireRootSellerCrashAccess);
}

export function getRootSellerCrashAccess(pathname: string | null) {
  discardRootSellerCrashAccessOutside(pathname);
  return rootAccess?.getProof ?? null;
}
