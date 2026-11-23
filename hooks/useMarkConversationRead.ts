'use client';

import { useEffect, useRef } from 'react';
import { markConversationRead } from '@/api/conversations';

export function useMarkConversationRead(id: string | null, isCurrent: () => boolean) {
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (id === null) {
      attempted.current = null;
      return;
    }

    const markVisible = () => {
      if (document.hidden || attempted.current === id || !isCurrent()) return;
      attempted.current = id;
      void markConversationRead(id).catch(() => {
        // Leave the displayed thread usable if marking it read fails.
      });
    };

    markVisible();
    document.addEventListener('visibilitychange', markVisible);
    return () => document.removeEventListener('visibilitychange', markVisible);
  }, [id, isCurrent]);
}
