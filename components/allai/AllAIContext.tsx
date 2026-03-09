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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'allai-session-id';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
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
}

const AllAIContext = createContext<AllAIContextValue | null>(null);

export function useAllAI() {
  const ctx = useContext(AllAIContext);
  if (!ctx) throw new Error('useAllAI must be used within AllAIProvider');
  return ctx;
}

export function AllAIProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      sessionIdRef.current = stored;
      fetch(`${API_URL}/api/allai/support/anonymous/session/${stored}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.messages?.length) {
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

      try {
        const sessionId = await ensureSession();
        const controller = new AbortController();
        abortRef.current = controller;

        const listingMatch = pathname.match(/^\/listings\/([^/]+)/);
        const context: Record<string, string> = { page: pathname };
        if (listingMatch) context.listing_id = listingMatch[1];

        const res = await fetch(`${API_URL}/api/allai/support/anonymous/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            message: trimmed,
            context,
            stream: true,
          }),
          signal: controller.signal,
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
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
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
            } catch {
              // skip malformed JSON
            }
          }
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
      value={{ isOpen, open, close, toggle, messages, isStreaming, sendMessage, page: pathname }}
    >
      {children}
    </AllAIContext.Provider>
  );
}
