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

type WorkspaceVisit = { pendingSourceReads: number };
type CrashObservation = {
  pathname: string;
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
  const draft = rootAccess?.session === session && rootAccess.visit.pendingSourceReads === 0 && isSellerWorkspacePath(rootAccess.pathname)
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
  // An outstanding source read can contradict a later draft read in this visit,
  // including when the dashboard replaces its capability snapshot in between.
  const { visit } = access;
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

// The dashboard publishes its completed active capability observation here.
// Next replaces that tree on a root crash, so disposal is tied to the proof.
export function observeRootSellerCrashAccess(pathname: string | null, session: SellerSession | null) {
  if (pathname === null || !isSellerWorkspacePath(pathname)) {
    clearRootSellerCrashAccess();
    return;
  }
  retireRootSellerCrashAccess();
  if (!session || !getCurrentSellerSessionToken(session)) return;

  const visit = workspaceVisit ?? { pendingSourceReads: 0 };
  const observation: CrashObservation = {
    pathname, session, visit, draftRevision: 0,
    getProof: () => rootAccess === observation && isSellerWorkspacePath(pathname) ? getSellerWorkspaceCrashProof(session) : null,
  };
  workspaceVisit = visit;
  rootAccess = observation;
  window.addEventListener('capabilities:changed', retireRootSellerCrashAccess);
}

export function getRootSellerCrashAccess(pathname: string | null) {
  discardRootSellerCrashAccessOutside(pathname);
  return rootAccess?.getProof ?? null;
}
