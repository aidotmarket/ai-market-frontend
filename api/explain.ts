'use client';

import axios from 'axios';
import { currentSessionRefresh, refreshAccessToken } from '@/api/client';
import { subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { sessionCsrf } from '@/lib/session-csrf';
import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';
import type { ListingStep, ListingStepReason, ListingStepView } from '@/components/seller-workspace/listingSteps';
import { useAuthStore } from '@/store/auth';

export type ExplainQuestion = 'publish' | 'storage' | 'where_am_i' | 'listing_status' | 'order_status';
export type OrderRole = 'buyer' | 'seller';
export type DraftSelector = { draft_id: string | null; draft_version: number | null; source_version: number | null };
export type ExplainTarget =
  | ({ kind: 'workspace' } & DraftSelector)
  | ({ kind: 'step'; visible_step: ListingStepView; visible_step_state: ListingStep['state'];
      visible_reason_code: ListingStepReason | null; files_pending: boolean; licence_unsaved: boolean } & DraftSelector)
  | { kind: 'listing'; listing_id?: string; draft?: DraftSelector }
  | { kind: 'order'; role: OrderRole; order_id?: string };
export type ExplainRequest = {
  intent: 'explain';
  question: ExplainQuestion;
  locale: AnonymousAllAILocale;
  target: ExplainTarget;
  conversation_id?: string;
};

export const explainActions = {
  publish: ['open_workspace', 'open_storage', 'open_files', 'open_license', 'open_listing', 'open_review', 'publish', 'view_listing'],
  storage: ['open_storage', 'open_files'],
  where_am_i: ['open_workspace', 'open_storage', 'open_files', 'save_files', 'open_license', 'open_listing', 'open_review'],
  listing_status: ['view_listing', 'view_listings'],
  order_status: ['view_order', 'view_orders'],
} as const satisfies Record<ExplainQuestion, readonly string[]>;
export type ExplainAction = (typeof explainActions)[ExplainQuestion][number];

export type DisplayTurn = {
  id: string;
  question: ExplainQuestion;
  locale: AnonymousAllAILocale;
  label: string;
  answer: string;
  created_at: string;
};
export type ExplainAnswer = {
  outcome: 'answered';
  conversation_id: string;
  expires_at: string;
  turn: DisplayTurn;
  facts: { availability: 'known' | 'empty' | 'stale' | 'unavailable' | 'revoked'; next_action?: ExplainAction };
};
type History = {
  conversation_id: string | null;
  expires_at: string | null;
  turns: DisplayTurn[];
  before: string | null;
  predecessor_verified?: boolean;
};
type NonAppend = 'select_context' | 'suggestions';
type Reply =
  | { kind: 'answer'; answer: ExplainAnswer }
  | { kind: NonAppend }
  | { kind: 'uncertain'; history: 'unverified' | 'possibleMatch' | 'noMatch' }
  | { kind: 'refused'; clear: boolean };
type ApplyReply = (commit: (reply: Reply) => void) => Promise<void>;

type Session = { subject: string; organization: string | null; generation: number; sessionId: string | null };
const listingStates = new Set(['draft', 'review', 'published', 'unlisted', 'withdrawn', 'hidden']);
const sessionRowId = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export function explainSession(token: string | null): Session | null {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')));
    if (claims.type !== 'access' || claims.aud != null || typeof claims.sub !== 'string'
      || !Number.isInteger(claims.auth_generation)
      || (claims.organization_id !== undefined && typeof claims.organization_id !== 'string')) return null;
    const id = claims.session_id;
    const sessionId = typeof id === 'string' && id.length === 36 && sessionRowId.test(id) ? id : null;
    return { subject: claims.sub, organization: claims.organization_id ?? null,
      generation: claims.auth_generation, sessionId };
  } catch {
    return null;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const predecessorHeader = 'X-Explain-Predecessor-Session';

// This instance has no generic request/response interceptors. Each request uses
// the admitted bearer and its own CSRF value, without a cookie or replay.
const firstPartyExplain = axios.create({
  baseURL: `${API_URL}/api/v1/allai/explain`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
  adapter: 'fetch',
  withCredentials: false,
  fetchOptions: { cache: 'no-store', redirect: 'error' },
});

type Admission = {
  owner: number;
  signal: AbortSignal;
  // Throws when the page, selectors or authenticated owner have changed.
  currentToken: () => string;
};

function credentialConfig(admission: Admission, token: string, predecessor?: string) {
  if (token !== admission.currentToken()) throw new Error('Explain credential changed');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-CSRF-Token': sessionCsrf(token),
      ...(predecessor !== undefined && { [predecessorHeader]: predecessor }),
    },
    signal: admission.signal,
  };
}

async function history(admission: Admission, token: string, conversationId?: string, predecessor?: string): Promise<History> {
  const { data } = await firstPartyExplain.get<History>('/history', {
    ...credentialConfig(admission, token, predecessor),
    params: conversationId ? { conversation_id: conversationId } : undefined,
  });
  admission.currentToken();
  if (!data || !Array.isArray(data.turns) || (conversationId && data.conversation_id !== conversationId)
    || (data.conversation_id === null
      ? data.expires_at !== null || data.turns.length !== 0 || data.before !== null
      : typeof data.conversation_id !== 'string' || data.conversation_id.length !== 36 || !sessionRowId.test(data.conversation_id)
        || typeof data.expires_at !== 'string' || !(Date.parse(data.expires_at) > Date.now()))) {
    throw new Error('Invalid Explain history');
  }
  if (predecessor !== undefined && data.predecessor_verified !== true) throw new Error('Unverified Explain predecessor');
  return data;
}

async function waitForRefresh(admission: Admission, retired?: string) {
  const current = admission.currentToken();
  const pending = currentSessionRefresh(admission.owner);
  if (pending) await pending;
  else if (retired === current) await refreshAccessToken(retired);
}

async function replacementHistory(admission: Admission, previous: string, token: string, conversationId?: string) {
  const original = explainSession(previous);
  const successor = explainSession(token);
  if (!original?.sessionId || !successor?.sessionId || successor.sessionId.toLowerCase() === original.sessionId.toLowerCase()
    || successor.subject !== original.subject || successor.organization !== original.organization
    || successor.generation !== original.generation) throw new Error('Invalid Explain successor');
  const predecessor = original.sessionId;
  const snapshot = await history(admission, token, conversationId, predecessor);
  if (token !== admission.currentToken()) throw new Error('Explain credential changed during verification');
  return { snapshot, predecessor };
}

function firstPartyRefusal(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 401) return false;
  const data = error.response.data;
  return !!data && typeof data === 'object' && Object.keys(data).length === 1
    && data.detail === 'FIRST_PARTY_SESSION_REQUIRED';
}

function refused(error: unknown): Reply {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return { kind: 'refused', clear: status === 401 || status === 403 || status === 404 || status === 503 };
}

function validAnswer(data: ExplainAnswer, request: ExplainRequest): boolean {
  return data?.outcome === 'answered' && typeof data.conversation_id === 'string'
    && data.conversation_id.length > 0
    && (!request.conversation_id || request.conversation_id === data.conversation_id)
    && Number.isFinite(Date.parse(data.expires_at))
    && data.turn?.question === request.question && data.turn.locale === request.locale
    && typeof data.turn.id === 'string' && typeof data.turn.label === 'string' && typeof data.turn.answer === 'string'
    && data.facts !== null && typeof data.facts === 'object';
}

function knownListingStates(facts: ExplainAnswer['facts']) {
  const { listing_state: state, status_counts: counts } = facts as { listing_state?: unknown; status_counts?: unknown };
  return (state == null || (typeof state === 'string' && listingStates.has(state)))
    && (counts == null || (typeof counts === 'object' && !Array.isArray(counts)
      && Object.keys(counts).every(code => listingStates.has(code))));
}

export async function appendExplain(scope: Admission, request: ExplainRequest, previousToken?: string): Promise<ApplyReply> {
  const controller = new AbortController();
  const signal = AbortSignal.any([scope.signal, controller.signal]);
  const admission = { ...scope, signal, currentToken: () => {
    signal.throwIfAborted();
    return scope.currentToken();
  } };
  const initialToken = admission.currentToken();
  let token = previousToken ?? initialToken;
  let body = request;
  let before: History | undefined;
  let predecessor: string | undefined;
  let confirmation: { token: string; expiresAt: string | null } | undefined;
  let replacementUsed = false;
  let mayHaveAppended = false;

  const replacementLimit = new Error('Explain credential replacement limit reached');
  let replacements = initialToken === token ? 0 : 1;
  // Count publications even while a refresh, request or proof is pending.
  const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    if (state.token !== previous.token && ++replacements === 2) controller.abort(replacementLimit);
  });
  const unsubscribeOwner = subscribeAuthSessionOwner(() => controller.abort());
  let onAbort!: () => void;
  let disposed = false;
  const cancellation = new Promise<never>((_, reject) => {
    onAbort = () => {
      dispose();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

  const unknown = { kind: 'uncertain', history: 'unverified' } as const;
  const limited = (): Reply => mayHaveAppended ? unknown : { kind: 'refused', clear: true };
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', onAbort);
    unsubscribeOwner();
    unsubscribeAuth();
  }

  let reply: Reply;
  try {
    reply = await Promise.race([cancellation, run()]);
    signal.throwIfAborted();
  } catch (error) {
    if (error !== replacementLimit) {
      dispose();
      throw error;
    }
    reply = limited();
  }

  // The caller owns this one-use handoff. Keep the question's credential
  // observer alive until the view applies or discards its result.
  let applied = false;
  return async commit => {
    if (applied) return;
    applied = true;
    try {
      let result = reply;
      let provedToken = reply.kind === 'answer' ? token : confirmation?.token;
      if (!signal.aborted && reply.kind === 'answer') {
        const { answer } = reply;
        const current = admission.currentToken();
        if (current !== token && Date.parse(answer.expires_at) > Date.now()) {
          try {
            const { snapshot } = await Promise.race([
              cancellation, proveReplacement(current, answer.conversation_id),
            ]);
            const expiry = snapshot.expires_at;
            const recovered = snapshot.turns.find(turn => turn.id === answer.turn.id
              && turn.question === answer.turn.question && turn.locale === answer.turn.locale
              && turn.label === answer.turn.label && turn.answer === answer.turn.answer
              && turn.created_at === answer.turn.created_at);
            if (expiry === null || !recovered) {
              result = unknown;
            } else {
              provedToken = current;
              const expires_at = Date.parse(expiry) < Date.parse(answer.expires_at) ? expiry : answer.expires_at;
              result = { kind: 'answer', answer: { ...answer, turn: recovered, expires_at } };
            }
          } catch {
            result = unknown;
          }
        }
      }
      // The authoritative view and credential are checked on the commit stack.
      scope.signal.throwIfAborted();
      const latest = scope.currentToken();
      if (signal.aborted && signal.reason !== replacementLimit) signal.throwIfAborted();
      if (signal.aborted) result = limited();
      if ((result.kind === 'answer' || (result.kind === 'uncertain' && result.history !== 'unverified'))
        && latest !== provedToken) result = unknown;
      if (result.kind === 'uncertain' && confirmation?.expiresAt && Date.parse(confirmation.expiresAt) <= Date.now()) {
        result = unknown;
      }
      if (result.kind === 'answer') {
        if (Date.parse(result.answer.expires_at) <= Date.now()) result = unknown;
        else if (body.question === 'listing_status' && !knownListingStates(result.answer.facts)) {
          result = { kind: 'refused', clear: false };
        }
      }
      commit(result);
    } finally {
      dispose();
    }
  };

  async function proveReplacement(replacement: string, conversationId = body.conversation_id) {
    if (replacementUsed) throw new Error('Explain credential replacement already used');
    replacementUsed = true;
    return replacementHistory(admission, token, replacement, conversationId);
  }

  async function adoptReplacement(replacement: string) {
    const proof = await proveReplacement(replacement);
    before = proof.snapshot;
    predecessor = proof.predecessor;
    token = replacement;
  }

  function anchorHistory() {
    if (!body.conversation_id && before?.conversation_id) body = { ...body, conversation_id: before.conversation_id };
  }

  async function run(): Promise<Reply> {
    try {
      await waitForRefresh(admission);
      if (admission.currentToken() === token) {
        try {
          before = await history(admission, token, body.conversation_id);
        } catch (error) {
          if (!firstPartyRefusal(error)) throw error;
          try { await waitForRefresh(admission, token); } catch { throw error; }
          await adoptReplacement(admission.currentToken());
        }
        anchorHistory();
      }
      const latest = admission.currentToken();
      if (latest !== token) await adoptReplacement(latest);
      anchorHistory();
    } catch (error) {
      admission.currentToken();
      return replacementUsed ? { kind: 'refused', clear: true } : refused(error);
    }
    return send();
  }

  async function confirmHistory(): Promise<Reply> {
    try {
      await waitForRefresh(admission);
      let current = admission.currentToken();
      let after: History | undefined;
      if (current === token) {
        try {
          after = await history(admission, token, body.conversation_id, predecessor);
        } catch (error) {
          if (replacementUsed || !firstPartyRefusal(error)) throw error;
          await waitForRefresh(admission, token);
        }
        current = admission.currentToken();
      }
      if (current !== token) after = (await proveReplacement(current)).snapshot;
      if (after && admission.currentToken() === current) {
        if (!mayHaveAppended) return { kind: 'refused', clear: false };
        const existing = new Set(before?.turns.map(turn => turn.id));
        const possible = after.turns.some(turn => turn.question === body.question && turn.locale === body.locale && !existing.has(turn.id));
        // History has neither a request identifier nor a target. A candidate
        // may belong to another page or tab and cannot be displayed as this turn.
        confirmation = { token: current, expiresAt: after.expires_at };
        return { kind: 'uncertain', history: possible ? 'possibleMatch' : 'noMatch' };
      }
    } catch {
      admission.currentToken();
    }
    return mayHaveAppended ? unknown : { kind: 'refused', clear: true };
  }

  async function send(): Promise<Reply> {
    let data: ExplainAnswer | { outcome: NonAppend };
    if (token !== admission.currentToken()) return { kind: 'refused', clear: true };
    const config = credentialConfig(admission, token, predecessor);
    try {
      mayHaveAppended = true;
      ({ data } = await firstPartyExplain.post<typeof data>('', body, config));
    } catch (error) {
      admission.currentToken();
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (!status || status === 408 || status >= 500) return confirmHistory();
      mayHaveAppended = false;
      // Admission uses the same 401 for expiry and rotation. Successor proof
      // establishes continuity for the history read only.
      if (firstPartyRefusal(error)) return confirmHistory();
      return refused(error);
    }
    admission.currentToken();
    if (data?.outcome === 'select_context' || data?.outcome === 'suggestions') {
      mayHaveAppended = false;
      return { kind: data.outcome };
    }
    if (data?.outcome !== 'answered') return confirmHistory();
    if (!validAnswer(data, body)) return confirmHistory();
    return { kind: 'answer', answer: data };
  }
}
