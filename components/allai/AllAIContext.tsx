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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'allai-session-id';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
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
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Wizard bridge callbacks
  const onFieldProposalRef = useRef<((proposal: FieldProposalEvent) => void) | null>(null);
  const onBatchProposalRef = useRef<((proposals: FieldProposalEvent[]) => void) | null>(null);
  const formSnapshotGetterRef = useRef<(() => Record<string, any>) | null>(null);

  const [onFieldProposalState, setOnFieldProposalState] = useState<((proposal: FieldProposalEvent) => void) | null>(null);
  const [onBatchProposalState, setOnBatchProposalState] = useState<((proposals: FieldProposalEvent[]) => void) | null>(null);
  const [formSnapshotGetterState, setFormSnapshotGetterState] = useState<(() => Record<string, any>) | null>(null);

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
            // Session expired or not found — clear stale reference
            sessionStorage.removeItem(SESSION_KEY);
            sessionIdRef.current = null;
            return;
          }
          if (data.messages?.length) {
            setMessages(
              data.messages.map((m: any, i: number) => ({
                id: `restored-${i}`,
                role: m.role,
                content: m.content,
                timestamp: Date.now(),
              }))
            );
          }
        })
        .catch(() => {
          sessionStorage.removeItem(SESSION_KEY);
          sessionIdRef.current = null;
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
        content: "Hey! I'm allAI — your guide to ai.market. I can help you find data, learn about vectorAIz, or answer any questions. What are you looking for?",
        timestamp: Date.now(),
      }]);
    }
  }, [isOpen, messages.length, user]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const res = await fetch(`${API_URL}/api/allai/support/anonymous/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error('Failed to create session');
    const data = await res.json();
    sessionIdRef.current = data.session_id;
    sessionStorage.setItem(SESSION_KEY, data.session_id);
    return data.session_id;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

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

      let readerRef: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        const sessionId = await ensureSession();
        const controller = new AbortController();
        abortRef.current = controller;

        const listingMatch = pathname.match(/^\/listings\/([^/]+)/);
        const context: Record<string, string> = { page: pathname };
        if (listingMatch) context.listing_id = listingMatch[1];
        if (user?.role) context.user_role = user.role;
        if (user?.first_name) context.user_name = user.first_name;
        if (user?.company_name) context.company_name = user.company_name;

        const bodyPayload: Record<string, any> = {
            session_id: sessionId,
            message: trimmed,
            context,
            stream: true,
        };
        const snapshot = formSnapshotGetterRef.current?.();
        if (snapshot && Object.keys(snapshot).length > 0) {
          bodyPayload.form_snapshot = snapshot;
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/api/allai/support/anonymous/message`, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
          cache: 'no-store',
        });

        if (res.status === 429) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "You've reached the message limit for this session. Please try again later." }
                : m
            )
          );
          setIsStreaming(false);
          return;
        }

        if (!res.ok || !res.body) throw new Error('Stream request failed');

        const reader = res.body.getReader();
        readerRef = reader;
        const decoder = new TextDecoder();
        let buffer = '';
        const READ_TIMEOUT_MS = 30_000;

        try {
          while (true) {
            const readPromise = reader.read();
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Stream read timeout')), READ_TIMEOUT_MS)
            );
            const { done, value } = await Promise.race([readPromise, timeoutPromise]);
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (!raw) continue;

              try {
                const evt = JSON.parse(raw);

                // Delta content: support both {"text":"..."} and {"type":"delta","chunk":"..."}
                const delta = evt.text ?? (evt.type === 'delta' ? evt.chunk : undefined);
                if (delta) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: m.content + delta } : m
                    )
                  );
                }

                // Error: support both {"error":"..."} and {"type":"error","message":"..."}
                const error = evt.error ?? (evt.type === 'error' ? evt.message : undefined);
                if (error) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: error || 'Something went wrong.' }
                        : m
                    )
                  );
                }

                // Field proposal from wizard tools
                if (evt.type === 'field_proposal' && evt.field) {
                  onFieldProposalRef.current?.({
                    field: evt.field,
                    value: evt.value ?? '',
                    reasoning: evt.reasoning ?? '',
                  });
                }

                // Batch proposal from wizard tools
                if (evt.type === 'batch_proposal' && Array.isArray(evt.proposals)) {
                  onBatchProposalRef.current?.(
                    evt.proposals.map((p: any) => ({
                      field: p.field,
                      value: p.value ?? '',
                      reasoning: p.reasoning ?? '',
                    }))
                  );
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        } catch (readErr) {
          // On timeout, abort the request so the connection is torn down
          if (readErr instanceof Error && readErr.message === 'Stream read timeout') {
            controller.abort();
          }
          throw readErr;
        } finally {
          reader.releaseLock();
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.content
                ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
                : m
            )
          );
        }
      } finally {
        // Safety net: cancel the reader if it's still locked
        try { readerRef?.cancel(); } catch { /* already released */ }
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, ensureSession, pathname]
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    abortRef.current?.abort();
  }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <AllAIContext.Provider
      value={{
        isOpen, open, close, toggle, messages, isStreaming, sendMessage, page: pathname,
        onFieldProposal: onFieldProposalState, setOnFieldProposal,
        onBatchProposal: onBatchProposalState, setOnBatchProposal,
        formSnapshotGetter: formSnapshotGetterState, setFormSnapshotGetter,
      }}
    >
      {children}
    </AllAIContext.Provider>
  );
}
