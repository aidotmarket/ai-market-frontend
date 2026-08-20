'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  createAnonymousSession,
  getAnonymousChatStatus,
  readAnonymousMessageStream,
  sendAnonymousMessage,
  type AnonymousMessagePayload,
} from '@/api/anonymousChat';
import type { TicketStatusCardData } from './TicketStatusCard';
import {
  ANONYMOUS_ALLAI_LOCALES,
  anonymousAllAIResources,
  preferredAnonymousAllAILocale,
  type AnonymousAllAILocale,
  type AnonymousSafeOutcome,
} from '@/lib/i18n/anonymous-allai';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'allai-session-id';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  ticketStatusCards?: TicketStatusCardData[];
  historical?: boolean;
  factRevisionSet?: string;
  safeOutcome?: AnonymousSafeOutcome;
  nextStep?: AnonymousNextStep;
}

export interface AnonymousNextStep {
  action: string;
  label: string;
  url: string;
  requires_account: boolean;
}

export interface FieldProposalEvent {
  field: string;
  value: string;
  reasoning: string;
}

interface AllAIContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
  page: string;
  locale: AnonymousAllAILocale;
  setLocale: (locale: AnonymousAllAILocale) => void;
  anonymousAvailable: boolean;
  // Wizard bridge callbacks
  onFieldProposal: ((proposal: FieldProposalEvent) => void) | null;
  setOnFieldProposal: (cb: ((proposal: FieldProposalEvent) => void) | null) => void;
  onBatchProposal: ((proposals: FieldProposalEvent[]) => void) | null;
  setOnBatchProposal: (cb: ((proposals: FieldProposalEvent[]) => void) | null) => void;
  // Form snapshot getter for G1-M1
  formSnapshotGetter: (() => Record<string, any>) | null;
  setFormSnapshotGetter: (getter: (() => Record<string, any>) | null) => void;
}

const AllAIContext = createContext<AllAIContextValue | null>(null);

function isTicketStatusCard(value: unknown): value is TicketStatusCardData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.public_ref === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.priority === 'string' &&
    typeof candidate.issue_class === 'string' &&
    typeof candidate.collapsed === 'boolean' &&
    typeof candidate.updated_at === 'string' &&
    (typeof candidate.last_ticket_message_at === 'string' || candidate.last_ticket_message_at === null)
  );
}

function coerceTicketStatusCards(value: unknown): TicketStatusCardData[] | null {
  if (!Array.isArray(value)) return null;
  const cards = value.filter(isTicketStatusCard);
  return cards.length > 0 ? cards : null;
}

function extractTicketStatusCards(evt: Record<string, any>): TicketStatusCardData[] | null {
  return (
    coerceTicketStatusCards(evt.ticket_status_cards) ??
    coerceTicketStatusCards(evt.cards) ??
    coerceTicketStatusCards(evt.data?.ticket_status_cards) ??
    coerceTicketStatusCards(evt.payload?.ticket_status_cards) ??
    coerceTicketStatusCards(evt.result?.ticket_status_cards) ??
    coerceTicketStatusCards(evt.result?.cards) ??
    null
  );
}

function isAnonymousSafeOutcome(value: unknown): value is AnonymousSafeOutcome {
  return (
    value === 'no_matches' ||
    value === 'retrieval_unavailable' ||
    value === 'answer_unverified' ||
    value === 'surface_disabled' ||
    value === 'rate_limited' ||
    value === 'unsupported_language'
  );
}

function isAnonymousNextStep(value: unknown): value is AnonymousNextStep {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.action !== 'string' ||
    typeof candidate.label !== 'string' ||
    candidate.label.length === 0 ||
    typeof candidate.url !== 'string' ||
    !candidate.url.startsWith('/') ||
    candidate.url.startsWith('//') ||
    typeof candidate.requires_account !== 'boolean'
  ) return false;

  const path = candidate.url.split('?', 1)[0].split('#', 1)[0].replace(/\/$/, '') || '/';
  const publicRoutes: Record<string, string> = {
    browse_listings: '/listings',
    refine_search: '/find-data',
    view_terms: '/legal/terms',
    view_pricing: '/pricing',
  };
  const accountRoutes: Record<string, string> = {
    post_request: '/requests/new',
    publish_listing: '/partner',
    buy_listing: '/listings',
    save_listing: '/listings',
    view_account: '/dashboard',
  };
  const accountRoute = accountRoutes[candidate.action];
  if (accountRoute) {
    const allowsDescendants = candidate.action === 'buy_listing' || candidate.action === 'save_listing';
    return candidate.requires_account &&
      (path === accountRoute || (allowsDescendants && path.startsWith(`${accountRoute}/`)));
  }
  const publicRoute = publicRoutes[candidate.action];
  return Boolean(publicRoute) && !candidate.requires_account &&
    (path === publicRoute || (candidate.action === 'browse_listings' && path.startsWith(`${publicRoute}/`)));
}

export function useAllAI() {
  const ctx = useContext(AllAIContext);
  if (!ctx) throw new Error('useAllAI must be used within AllAIProvider');
  return ctx;
}

export function AllAIProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, token } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const greetingSentRef = useRef(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [locale, setLocale] = useState<AnonymousAllAILocale>('en');
  const [anonymousAvailable, setAnonymousAvailable] = useState(true);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const localConversationStartedRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Wizard bridge callbacks
  const onFieldProposalRef = useRef<((proposal: FieldProposalEvent) => void) | null>(null);
  const onBatchProposalRef = useRef<((proposals: FieldProposalEvent[]) => void) | null>(null);
  const formSnapshotGetterRef = useRef<(() => Record<string, any>) | null>(null);

  const [onFieldProposalState, setOnFieldProposalState] = useState<((proposal: FieldProposalEvent) => void) | null>(null);
  const [onBatchProposalState, setOnBatchProposalState] = useState<((proposals: FieldProposalEvent[]) => void) | null>(null);
  const [formSnapshotGetterState, setFormSnapshotGetterState] = useState<(() => Record<string, any>) | null>(null);

  useEffect(() => {
    setLocale(user ? 'en' : preferredAnonymousAllAILocale(navigator.language));
  }, [user]);

  useEffect(() => {
    const isApprovedAnonymousRoute =
      !user && (pathname === '/' || pathname === '/find-data' || pathname === '/search');
    if (!isApprovedAnonymousRoute) {
      setAnonymousAvailable(true);
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      let refreshSeconds = 5;
      try {
        const status = await getAnonymousChatStatus();
        if (!active) return;
        const localesMatch =
          ANONYMOUS_ALLAI_LOCALES.every((item) => status.supported_locales.includes(item)) &&
          status.supported_locales.every((item) => ANONYMOUS_ALLAI_LOCALES.includes(item));
        setAnonymousAvailable(status.available && localesMatch);
        refreshSeconds = Math.max(1, status.cache_seconds || 5);
      } catch {
        if (active) setAnonymousAvailable(false);
      }
      if (active) timer = setTimeout(refresh, refreshSeconds * 1000);
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, user]);

  const setOnFieldProposal = useCallback((cb: ((proposal: FieldProposalEvent) => void) | null) => {
    onFieldProposalRef.current = cb;
    setOnFieldProposalState(() => cb);
  }, []);

  const setOnBatchProposal = useCallback((cb: ((proposals: FieldProposalEvent[]) => void) | null) => {
    onBatchProposalRef.current = cb;
    setOnBatchProposalState(() => cb);
  }, []);

  const setFormSnapshotGetter = useCallback((getter: (() => Record<string, any>) | null) => {
    formSnapshotGetterRef.current = getter;
    setFormSnapshotGetterState(() => getter);
  }, []);

  // Restore session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      sessionIdRef.current = stored;
      fetch(`${API_URL}/api/allai/support/anonymous/session/${stored}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) {
            // Session expired or not found - clear stale reference
            if (sessionIdRef.current === stored) {
              sessionIdRef.current = null;
            }
            if (sessionStorage.getItem(SESSION_KEY) === stored) {
              sessionStorage.removeItem(SESSION_KEY);
            }
            return;
          }
          if (
            sessionIdRef.current !== stored ||
            sessionStorage.getItem(SESSION_KEY) !== stored ||
            localConversationStartedRef.current
          ) {
            return;
          }
          if (data.messages?.length) {
            setMessages(
              data.messages.map((m: any, i: number) => ({
                id: `restored-${i}`,
                role: m.role,
                content: m.content,
                timestamp: Date.now(),
                historical: true,
                factRevisionSet: typeof m.fact_revision_set === 'string' ? m.fact_revision_set : undefined,
                ticketStatusCards: coerceTicketStatusCards(m.ticket_status_cards ?? m.ticketStatusCards) ?? undefined,
              }))
            );
          }
        })
        .catch(() => {
          if (sessionIdRef.current === stored) {
            sessionIdRef.current = null;
          }
          if (sessionStorage.getItem(SESSION_KEY) === stored) {
            sessionStorage.removeItem(SESSION_KEY);
          }
        });
    }
  }, []);

  // Greeting for logged-in users (QA-5)
  useEffect(() => {
    if (isOpen && !greetingSentRef.current && messages.length === 0 && user) {
      greetingSentRef.current = true;
      const name = user.first_name || user.email?.split('@')[0] || '';
      const roleGreeting = user.role === 'seller'
        ? "I can help you manage your listings, understand marketplace trends, or answer questions about ai.market."
        : "I can help you find data, submit requests, or answer questions about ai.market.";
      setMessages([{
        id: 'greeting-0',
        role: 'assistant',
        content: `Hey${name ? ' ' + name : ''}! ${roleGreeting} What can I help with?`,
        timestamp: Date.now(),
      }]);
    } else if (isOpen && !greetingSentRef.current && messages.length === 0 && !user) {
      greetingSentRef.current = true;
      setMessages([{
        id: 'greeting-0',
        role: 'assistant',
        content: anonymousAllAIResources(locale).greeting,
        timestamp: Date.now(),
      }]);
    }
  }, [isOpen, locale, messages.length, user]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const sessionId = await createAnonymousSession();
    sessionIdRef.current = sessionId;
    sessionStorage.setItem(SESSION_KEY, sessionId);
    return sessionId;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      const resources = anonymousAllAIResources(locale);
      if (!user && !anonymousAvailable) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: resources.safeOutcomes.surface_disabled,
            safeOutcome: 'surface_disabled',
            timestamp: Date.now(),
          },
        ]);
        return;
      }
      localConversationStartedRef.current = true;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() },
      ]);
      setIsStreaming(true);

      try {
        const sessionId = await ensureSession();
        const controller = new AbortController();
        abortRef.current = controller;

        const listingMatch = pathname.match(/^\/listings\/([^/]+)/);
        const context: AnonymousMessagePayload['context'] = { page: pathname };
        if (listingMatch) context.listing_id = listingMatch[1];

        const bodyPayload: AnonymousMessagePayload = {
          session_id: sessionId,
          message: trimmed,
          context,
          ...(!user ? { locale } : {}),
          stream: true,
        };

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let res = await sendAnonymousMessage(bodyPayload, {
          headers,
          signal: controller.signal,
        });

        if (res.status === 404) {
          if (sessionIdRef.current === sessionId) {
            sessionIdRef.current = null;
          }
          if (sessionStorage.getItem(SESSION_KEY) === sessionId) {
            sessionStorage.removeItem(SESSION_KEY);
          }

          const replacementSessionId = await ensureSession();
          res = await sendAnonymousMessage({
            ...bodyPayload,
            session_id: replacementSessionId,
          }, {
            headers,
            signal: controller.signal,
          });
        }

        if (res.status === 429) {
          const limitContent = user
            ? "You've reached the message limit for this session. Please try again later."
            : resources.safeOutcomes.rate_limited;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: limitContent,
                    safeOutcome: user ? undefined : 'rate_limited',
                  }
                : m
            )
          );
          setIsStreaming(false);
          return;
        }

        if (res.status === 503 && !user) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: resources.safeOutcomes.surface_disabled, safeOutcome: 'surface_disabled' }
                : m
            )
          );
          setAnonymousAvailable(false);
          return;
        }

        if (!res.ok || !res.body) throw new Error('Stream request failed');

        try {
          await readAnonymousMessageStream(res.body, (evt) => {
            if (evt.type === 'answer' && typeof evt.text === 'string') {
              const nextStep = !user && isAnonymousNextStep(evt.next_step) ? evt.next_step : undefined;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: evt.text as string,
                        nextStep,
                        factRevisionSet:
                          typeof evt.source_revision_set === 'string'
                            ? evt.source_revision_set
                            : undefined,
                      }
                    : m
                )
              );
              return;
            }

            if (evt.type === 'safe_failure' && isAnonymousSafeOutcome(evt.outcome)) {
              const outcome = evt.outcome;
              const fallback = resources.safeOutcomes[outcome];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: typeof evt.text === 'string' && evt.text ? evt.text : fallback,
                        safeOutcome: outcome,
                      }
                    : m
                )
              );
              return;
            }

            // Delta content: support both {"text":"..."} and {"type":"delta","chunk":"..."}
            const delta = evt.text ?? (evt.type === 'delta' ? evt.chunk : undefined);
            if (typeof delta === 'string' && delta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + delta } : m
                )
              );
            }

            // Error: support both {"error":"..."} and {"type":"error","message":"..."}
            const error = evt.error ?? (evt.type === 'error' ? evt.message : undefined);
            if (typeof error === 'string' && error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: error || 'Something went wrong.' }
                    : m
                )
              );
            }

            // Field proposal from wizard tools
            if (evt.type === 'field_proposal' && typeof evt.field === 'string') {
              onFieldProposalRef.current?.({
                field: evt.field,
                value: typeof evt.value === 'string' ? evt.value : '',
                reasoning: typeof evt.reasoning === 'string' ? evt.reasoning : '',
              });
            }

            // Batch proposal from wizard tools
            if (evt.type === 'batch_proposal' && Array.isArray(evt.proposals)) {
              onBatchProposalRef.current?.(
                evt.proposals
                  .filter((proposal): proposal is Record<string, unknown> => (
                    typeof proposal === 'object' && proposal !== null
                  ))
                  .map((proposal) => ({
                    field: typeof proposal.field === 'string' ? proposal.field : '',
                    value: typeof proposal.value === 'string' ? proposal.value : '',
                    reasoning: typeof proposal.reasoning === 'string' ? proposal.reasoning : '',
                  }))
              );
            }

            const ticketStatusCards = extractTicketStatusCards(evt as Record<string, any>);
            if (ticketStatusCards) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        ticketStatusCards: [
                          ...(m.ticketStatusCards ?? []),
                          ...ticketStatusCards,
                        ],
                      }
                    : m
                )
              );
            }
          });
        } catch (readErr) {
          // On timeout, abort the request so the connection is torn down
          if (readErr instanceof Error && readErr.message === 'Stream read timeout') {
            controller.abort();
          }
          throw readErr;
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.content
                ? { ...m, content: resources.genericError }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [anonymousAvailable, ensureSession, isStreaming, locale, pathname, token, user]
  );

  const open = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    abortRef.current?.abort();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, []);
  const toggle = useCallback(() => {
    setIsOpen((current) => {
      if (!current) {
        returnFocusRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      } else {
        requestAnimationFrame(() => returnFocusRef.current?.focus());
      }
      return !current;
    });
  }, []);

  return (
    <AllAIContext.Provider
      value={{
        isOpen, open, close, toggle, messages, isStreaming, sendMessage, page: pathname,
        locale, setLocale, anonymousAvailable,
        onFieldProposal: onFieldProposalState, setOnFieldProposal,
        onBatchProposal: onBatchProposalState, setOnBatchProposal,
        formSnapshotGetter: formSnapshotGetterState, setFormSnapshotGetter,
      }}
    >
      {children}
    </AllAIContext.Provider>
  );
}
