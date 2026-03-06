'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { pollConversation } from '@/api/conversations';
import type { ConversationMessage } from '@/types';

export function useConversationPoll(
  conversationId: string | null,
  initialSince: string | null,
  onNewMessages: (msgs: ConversationMessage[]) => void
) {
  const [polling, setPolling] = useState(false);
  const sinceRef = useRef(initialSince);
  const callbackRef = useRef(onNewMessages);
  callbackRef.current = onNewMessages;

  // Update since watermark externally
  const updateSince = useCallback((s: string) => {
    sinceRef.current = s;
  }, []);

  useEffect(() => {
    if (!conversationId || !sinceRef.current) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!active || !sinceRef.current || document.hidden) {
        if (active) timer = setTimeout(poll, 3000);
        return;
      }

      try {
        setPolling(true);
        const msgs = await pollConversation(conversationId, sinceRef.current);
        if (!active) return;
        if (msgs.length > 0) {
          // Advance watermark to latest message
          sinceRef.current = msgs[msgs.length - 1].created_at;
          callbackRef.current(msgs);
        }
      } catch {
        // Network error — silently retry
      } finally {
        if (active) {
          setPolling(false);
          timer = setTimeout(poll, 3000);
        }
      }
    };

    timer = setTimeout(poll, 1000); // Start after 1s delay

    const onVisibility = () => {
      if (!document.hidden && active) {
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
  }, [conversationId]);

  return { polling, updateSince };
}
