'use client';

import axios from 'axios';
import { currentSessionRefresh, refreshAccessToken } from '@/api/client';
import { sessionCsrf } from '@/lib/session-csrf';
import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';
import type { ListingStep, ListingStepReason, ListingStepView } from '@/components/seller-workspace/listingSteps';

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
  publish: ['open_workspace', 'open_files', 'open_license', 'open_listing', 'open_review', 'publish', 'view_listing'],
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
};
type Reply =
  | { kind: 'answer'; answer: ExplainAnswer }
  | { kind: 'uncertain'; history: 'unverified' | 'possibleMatch' | 'noMatch' }
  | { kind: 'refused'; clear: boolean };

type Session = { subject: string; organization: string | null; generation: number; sessionId: string };

export function explainSession(token: string | null): Session | null {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')));
    if (claims.type !== 'access' || typeof claims.sub !== 'string' || typeof claims.session_id !== 'string'
      || !Number.isInteger(claims.auth_generation)
      || (claims.organization_id !== undefined && typeof claims.organization_id !== 'string')) return null;
    return { subject: claims.sub, organization: claims.organization_id ?? null,
      generation: claims.auth_generation, sessionId: claims.session_id };
  } catch {
    return null;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

function credentialConfig(admission: Admission, token: string) {
  if (token !== admission.currentToken()) throw new Error('Explain credential changed');
  return {
    headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': sessionCsrf(token) },
    signal: admission.signal,
  };
}

async function history(admission: Admission, token: string, conversationId?: string): Promise<History> {
  const { data } = await firstPartyExplain.get<History>('/history', {
    ...credentialConfig(admission, token),
    params: conversationId ? { conversation_id: conversationId } : undefined,
  });
  admission.currentToken();
  if (!data || !Array.isArray(data.turns) || (data.conversation_id !== null && typeof data.conversation_id !== 'string')
    || (conversationId && data.conversation_id !== conversationId)) throw new Error('Invalid Explain history');
  return data;
}

function hasDetail(error: unknown, status: number, detail: string): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== status) return false;
  const data = error.response.data;
  return !!data && typeof data === 'object' && Object.keys(data).length === 1 && data.detail === detail;
}

function refused(error: unknown): Reply {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return { kind: 'refused', clear: status === 401 || status === 403 || status === 404 || status === 503 || hasDetail(error, 409, 'SESSION_ROTATED') };
}

function validAnswer(data: ExplainAnswer, request: ExplainRequest): boolean {
  return data?.outcome === 'answered' && typeof data.conversation_id === 'string'
    && (!request.conversation_id || request.conversation_id === data.conversation_id)
    && Number.isFinite(Date.parse(data.expires_at))
    && data.turn?.question === request.question && data.turn.locale === request.locale
    && typeof data.turn.id === 'string' && typeof data.turn.label === 'string' && typeof data.turn.answer === 'string'
    && data.facts !== null && typeof data.facts === 'object';
}

export async function appendExplain(admission: Admission, request: ExplainRequest): Promise<Reply> {
  let token = admission.currentToken();
  let body = request;
  let before: History | undefined;
  try {
    const pending = currentSessionRefresh(admission.owner);
    if (pending) {
      await pending;
      token = admission.currentToken();
    }
    try {
      before = await history(admission, token, body.conversation_id);
    } catch (error) {
      // An implicit latest thread can be expired and still present. Let a
      // newly asked question reach POST without an old conversation selector.
      if (body.conversation_id || !hasDetail(error, 404, 'NOT_FOUND')) throw error;
    }
    if (!body.conversation_id && before?.conversation_id) body = { ...body, conversation_id: before.conversation_id };
    credentialConfig(admission, token);
  } catch (error) {
    admission.currentToken();
    return refused(error);
  }

  async function confirmHistory(): Promise<Reply> {
    try {
      const pending = currentSessionRefresh(admission.owner);
      if (pending) await pending;
      const current = admission.currentToken();
      // Without an anchor only the original, still-valid credential proves
      // which family the history belongs to.
      if (current !== token && !body.conversation_id) return { kind: 'uncertain', history: 'unverified' };
      const after = await history(admission, current, body.conversation_id);
      if (admission.currentToken() === current) {
        const existing = new Set(before?.turns.map(turn => turn.id));
        const possible = after.turns.some(turn => turn.question === body.question && turn.locale === body.locale && !existing.has(turn.id));
        // History has neither a request identifier nor a target. A candidate
        // may belong to another page or tab and cannot be displayed as this turn.
        return { kind: 'uncertain', history: possible ? 'possibleMatch' : 'noMatch' };
      }
    } catch {
      admission.currentToken();
    }
    return { kind: 'uncertain', history: 'unverified' };
  }

  async function send(retried: boolean): Promise<Reply> {
    let data: ExplainAnswer;
    const config = credentialConfig(admission, token);
    try {
      ({ data } = await firstPartyExplain.post<ExplainAnswer>('', body, config));
    } catch (error) {
      admission.currentToken();
      if (hasDetail(error, 409, 'SESSION_ROTATED')) {
        if (retried || !body.conversation_id) return refused(error);
        try {
          const original = explainSession(token);
          const pending = currentSessionRefresh(admission.owner);
          if (pending) await pending;
          else if (admission.currentToken() === token) await refreshAccessToken(token);
          const replacement = admission.currentToken();
          const successor = explainSession(replacement);
          if (!original || !successor || successor.sessionId === original.sessionId
            || successor.subject !== original.subject || successor.organization !== original.organization
            || successor.generation !== original.generation) return refused(error);
          // The access token omits refresh_family. An exact scoped conversation
          // read verifies the replacement web credential and family on the server.
          await history(admission, replacement, body.conversation_id);
          credentialConfig(admission, replacement);
          token = replacement;
        } catch (verificationError) {
          admission.currentToken();
          return refused(verificationError);
        }
        return send(true);
      }
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (!status || status >= 500) return confirmHistory();
      return refused(error);
    }
    const current = admission.currentToken();
    if (!validAnswer(data, body)) return confirmHistory();
    if (current !== token) {
      try {
        await history(admission, current, data.conversation_id);
        if (current !== admission.currentToken()) return { kind: 'refused', clear: true };
      } catch (error) {
        admission.currentToken();
        return refused(error);
      }
    }
    return { kind: 'answer', answer: data };
  }

  return send(false);
}
