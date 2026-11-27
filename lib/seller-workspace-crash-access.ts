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
        invalidateSellerCrashSession();
      }
    });
    subscribeAuthSessionOwner(invalidateSellerCrashSession);
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
  owner: string;
  generation: number;
  sourceReads?: SourceReadEpoch;
};
type SourceReadEpoch = {
  session: SellerSession;
  pending: number;
};
type CrashObservation = {
  pathname: string;
  session: SellerSession;
  sourceReads: SourceReadEpoch;
  getProof: SellerWorkspaceCrashProof;
  draftRevision: number;
  draft?: { uuid: string };
};
let rootAccess: CrashObservation | undefined;
let workspaceVisit: WorkspaceVisit | undefined;

function invalidateSellerCrashSession() {
  retireRootSellerCrashAccess();
  if (workspaceVisit) workspaceVisit.sourceReads = undefined;
}

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

export function mountSellerWorkspaceCrashVisit(pathname: string, owner: string | null, generation: number) {
  clearRootSellerCrashAccess();
  if (!owner || !isSellerWorkspacePath(pathname)) return;
  const visit: WorkspaceVisit = { pathname, owner, generation };
  workspaceVisit = visit;
  return () => {
    // End read admission at teardown. Next's root fallback still needs the last observation.
    if (workspaceVisit === visit) workspaceVisit = undefined;
  };
}

function currentSourceReadEpoch() {
  const visit = workspaceVisit;
  if (!visit || !isSellerWorkspacePath(visit.pathname) || !isAuthSessionOwner(visit.generation)) return;
  const token = useAuthStore.getState().token;
  if (!token) return;
  const session = visit.sourceReads?.session ?? captureSellerCrashSession(visit.owner, token);
  if (!getCurrentSellerSessionToken(session)) return;
  // Use live credentials so a normal read can register before React commits
  // the rotation or the replacement capability request has even started.
  return (visit.sourceReads ??= { session, pending: 0 });
}

export function getSellerWorkspaceCrashProof(session: SellerSession) {
  const token = getCurrentSellerSessionToken(session);
  if (!token) return null;
  const draft = rootAccess?.session === session && rootAccess.sourceReads.pending === 0 && isSellerWorkspacePath(rootAccess.pathname)
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
  const sourceReads = currentSourceReadEpoch();
  if (!sourceReads) return;
  // An outstanding source read can contradict a later draft read in this visit,
  // even when it starts while capability revalidation has retired crash proof.
  sourceReads.pending++;
  return (response?: { current_draft_id: unknown }) => {
    if (workspaceVisit?.sourceReads !== sourceReads || !isSellerWorkspacePath(workspaceVisit.pathname)) return;
    sourceReads.pending--;
    const active = rootAccess;
    if (!response || active?.sourceReads !== sourceReads || !active.getProof()) return;
    const current = response.current_draft_id;
    if (!active.draft || current !== active.draft.uuid || (expectedDraftId && current !== expectedDraftId)) {
      // A source read cannot prove a pointer. When it finishes before any
      // draft is proven, retire overlapping current-draft reads as well.
      clearSellerWorkspaceCrashDraft();
    }
  };
}

export function observeRootSellerCrashAccess(session: SellerSession | null) {
  retireRootSellerCrashAccess();
  if (!session || !getCurrentSellerSessionToken(session)) return;
  const visit = workspaceVisit;
  const sourceReads = currentSourceReadEpoch();
  if (!visit || !sourceReads) return;
  const { pathname } = visit;

  const observation: CrashObservation = {
    pathname, session, sourceReads, draftRevision: 0,
    getProof: () => rootAccess === observation && isSellerWorkspacePath(pathname) ? getSellerWorkspaceCrashProof(session) : null,
  };
  rootAccess = observation;
  window.addEventListener('capabilities:changed', retireRootSellerCrashAccess);
}

export function getRootSellerCrashAccess(pathname: string | null) {
  discardRootSellerCrashAccessOutside(pathname);
  return rootAccess?.getProof ?? null;
}
