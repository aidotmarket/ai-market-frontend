'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { markConversationRead } from '@/api/conversations';
import type { ConversationMessage } from '@/types';

export function useMarkThreadRead(
  threadId: string | null,
  messages: ConversationMessage[],
  isCurrent: () => boolean,
  active?: RefObject<boolean>,
) {
  const progress = useRef<{
    threadId: string;
    isCurrent: () => boolean;
    lastMarked: number;
    pending: Set<number>;
  } | null>(null);

  // Each committed message snapshot can retry a failed marker, even at the same count.
  useEffect(() => {
    if (!threadId) return;
    if (progress.current?.threadId !== threadId || progress.current.isCurrent !== isCurrent) {
      progress.current = { threadId, isCurrent, lastMarked: -1, pending: new Set() };
    }
    const thread = progress.current;
    const count = messages.length;
    const mark = async () => {
      if (document.visibilityState !== 'visible' || active?.current === false || !isCurrent()) return;
      if (count <= thread.lastMarked || thread.pending.has(count)) return;
      thread.pending.add(count);
      const marked = await markConversationRead(threadId, count);
      if (marked) thread.lastMarked = Math.max(thread.lastMarked, count);
      thread.pending.delete(count);
    };
    const onVisibility = () => { void mark(); };
    document.addEventListener('visibilitychange', onVisibility);
    void mark();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [threadId, messages, isCurrent, active]);
}
