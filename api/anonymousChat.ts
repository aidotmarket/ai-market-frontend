import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const ANONYMOUS_SESSION_URL = `${API_URL}/api/allai/support/anonymous/session`;
export const ANONYMOUS_MESSAGE_URL = `${API_URL}/api/allai/support/anonymous/message`;
export const ANONYMOUS_STATUS_URL = `${API_URL}/api/allai/support/anonymous/status`;

export interface AnonymousPageContext {
  page: string;
  listing_id?: string;
  referrer?: string;
}

export interface AnonymousMessagePayload {
  session_id: string;
  message: string;
  context: AnonymousPageContext;
  locale?: AnonymousAllAILocale;
  stream: true;
}

export type AnonymousChatEvent = Record<string, unknown>;

export interface AnonymousChatStatus {
  available: boolean;
  reason: string;
  supported_locales: AnonymousAllAILocale[];
  cache_seconds: number;
}

export async function getAnonymousChatStatus(): Promise<AnonymousChatStatus> {
  const response = await fetch(ANONYMOUS_STATUS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Anonymous allAI status is unavailable');
  return response.json() as Promise<AnonymousChatStatus>;
}

export async function createAnonymousSession(): Promise<string> {
  const response = await fetch(ANONYMOUS_SESSION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) throw new Error('Failed to create session');

  const data = await response.json() as { session_id?: unknown };
  if (typeof data.session_id !== 'string' || !data.session_id) {
    throw new Error('Anonymous session response did not include a session id');
  }

  return data.session_id;
}

export function sendAnonymousMessage(
  payload: AnonymousMessagePayload,
  options: { headers?: Record<string, string>; signal?: AbortSignal } = {}
): Promise<Response> {
  return fetch(ANONYMOUS_MESSAGE_URL, {
    method: 'POST',
    headers: options.headers ?? { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
    cache: 'no-store',
  });
}

export async function readAnonymousMessageStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AnonymousChatEvent) => void,
  readTimeoutMs = 30_000
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Stream read timeout')), readTimeoutMs);
      });

      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      if (result.done) break;

      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        try {
          onEvent(JSON.parse(raw) as AnonymousChatEvent);
        } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed.
    }
    reader.releaseLock();
  }
}
