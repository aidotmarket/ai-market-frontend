'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { pollConversation } from '@/api/conversations';
import type { ConversationMessage, ConversationStatus } from '@/types';

export function useConversationPoll(
  conversationId: string | null,
  initialSince: string | null,
  onNewMessages: (msgs: ConversationMessage[], status: ConversationStatus) => void,
  isCurrent?: () => boolean
) {
  const [polling, setPolling] = useState(false);
  const cursor = useRef<{ id: string | null; since: string | null }>({ id: null, since: null });
  const revision = useRef(0);
  const callbackRef = useRef(onNewMessages);
  callbackRef.current = onNewMessages;

  const updateSince = useCallback((s: string) => {
    revision.current += 1;
    if (Number.isFinite(Date.parse(s)) && (!cursor.current.since || Date.parse(s) > Date.parse(cursor.current.since))) {
      cursor.current.since = s;
    }
  }, []);

  // A late initial detail may enable polling. Ordinary message rerenders must
  // neither restart the timer nor rewind the cursor.
  const ready = !!initialSince && Number.isFinite(Date.parse(initialSince));
  useEffect(() => {
    if (cursor.current.id !== conversationId) cursor.current = { id: conversationId, since: null };
    if (ready && !cursor.current.since) cursor.current.since = initialSince;
  }, [conversationId, initialSince, ready]);

  useEffect(() => {
    setPolling(false);
    if (!conversationId || !ready) return;
    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active || inFlight || (isCurrent && !isCurrent())) return;
      if (document.hidden || !cursor.current.since) {
        timer = setTimeout(poll, 3000);
        return;
      }
      inFlight = true;
      let delay = 3000;
      try {
        setPolling(true);
        const requestRevision = revision.current;
        const result = await pollConversation(conversationId, cursor.current.since);
        if (!active || (isCurrent && !isCurrent()) || requestRevision !== revision.current) return;
        result.new_messages.forEach((msg) => updateSince(msg.created_at));
        callbackRef.current(result.new_messages, result.inquiry_status);
        if (result.has_more && result.new_messages.length) delay = 500;
      } catch {
        // Retry reads on the normal interval. Never retry a reply here.
      } finally {
        inFlight = false;
        if (active && (!isCurrent || isCurrent())) {
          setPolling(false);
          timer = setTimeout(poll, delay);
        }
      }
    };
    timer = setTimeout(poll, 1000);
    const onVisibility = () => {
      if (!document.hidden && active && !inFlight) {
        clearTimeout(timer);
        timer = setTimeout(poll, 500);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conversationId, ready, updateSince, isCurrent]);

  return { polling, updateSince };
}
