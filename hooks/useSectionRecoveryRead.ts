'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { SectionRecovery } from '@/lib/section-recovery';

// Keep the active read through rotation: its own interceptor may be refreshing
// and replaying it. Decide on section recovery only after that read settles.
export function useSectionRecoveryRead(read: (current: () => boolean, signal: AbortSignal) => Promise<void>) {
  const recovery = useRef(new SectionRecovery());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true, busy = false, failure: unknown = null;
    let token = useAuthStore.getState().token;
    const run = async () => {
      busy = true;
      failure = null;
      try { await read(() => active, controller.signal); }
      catch (error) { failure = error; }
      finally {
        busy = false;
        if (active && recovery.current.recover(failure)) void run();
      }
    };
    const unsubscribe = useAuthStore.subscribe(state => {
      if (state.token === token) return;
      token = state.token;
      if (!busy && !failure) return;
      recovery.current.sessionChanged();
      if (!busy && failure && recovery.current.recover(failure)) void run();
    });
    void run();
    return () => { active = false; controller.abort(); unsubscribe(); };
  }, [read, attempt]);
  return () => { recovery.current.reset(); setAttempt(value => value + 1); };
}
