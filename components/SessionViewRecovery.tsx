'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { selectedRecoveryTicket, subscribeRecoveryTicket, SessionViewRecovery, type RecoveryAdapter, type RecoveryDisplay, type RecoveryProgress } from '@/lib/session-view-recovery';

// This lifecycle belongs to the mounted failing view. No service or global timer.
// Initial ticket-context read plus at most 30 admission checks, then leave owned
// unresolved work for ordinary support.
export function useViewRecovery(failed: boolean, adapter: RecoveryAdapter) {
  const binding = useSyncExternalStore(subscribeRecoveryTicket, selectedRecoveryTicket, () => null);
  const latest = useRef(adapter); latest.current = adapter;
  const [attempt, setAttempt] = useState<SessionViewRecovery | null>(null);
  const active = useRef<SessionViewRecovery | null>(null);
  const [progress, setProgress] = useState<RecoveryProgress | null>(null);
  useEffect(() => {
    active.current?.retire(); active.current = null; setAttempt(null); setProgress(null);
    return () => { active.current?.retire(); active.current = null; };
  }, [binding]);
  useEffect(() => {
    if (!failed || !binding || active.current) return;
    const a = latest.current;
    const recovery = new SessionViewRecovery(binding, {
      view: a.view, walletOffset: a.walletOffset,
      current: () => latest.current.current(), snapshot: () => latest.current.snapshot(), install: data => latest.current.install(data),
      prepareRefresh: () => latest.current.prepareRefresh?.(), acceptRefresh: async token => { await latest.current.acceptRefresh?.(token); },
      finish: () => latest.current.finish?.(),
    });
    active.current = recovery; setAttempt(recovery);
  }, [binding, failed]);
  useEffect(() => {
    if (!attempt) return;
    let live = true, reads = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = attempt.subscribe(() => { if (live) setProgress(attempt.getSnapshot()); });
    const read = async () => {
      await attempt.observe();
      if (!live) return;
      const stage = attempt.getSnapshot().stage;
      if (stage === 'rendering') { timer = setTimeout(() => void attempt.stop(), 150000); return; }
      if (stage !== 'waiting') return;
      if (++reads >= 30) { await attempt.stop(); return; }
      timer = setTimeout(() => void read(), 5000);
    };
    setProgress(attempt.getSnapshot()); void read();
    return () => { live = false; unsubscribe(); if (timer) clearTimeout(timer); attempt.retire(); };
  }, [attempt]);
  return { attempt, progress, message: progress?.message ?? (failed ? 'This view is still unavailable. Your drafts and pending work are retained. Continue with support for this issue.' : null) };
}

export function visiblyRendered(element: HTMLElement): boolean {
  if (!element.isConnected || document.visibilityState !== 'visible' || element.getClientRects().length === 0) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('inert')
      || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
  }
  return !element.querySelector('[role="alert"], [data-recovery-render-error]');
}

// Place around the actual rendered returned data, not a status/ACK/loading card.
// Read identity must be the same object the normal controller installed.
export function RecoveryDisplayBoundary({ attempt, display, installed, children }: {
  attempt: SessionViewRecovery | null; display: RecoveryDisplay | null | undefined; installed: object | null | undefined; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!attempt || !display || installed !== display.read) return;
    let live = true;
    const check = () => {
      if (live && root.current && visiblyRendered(root.current)) void attempt.visible(display);
    };
    // Child errors/unmounts must settle before the display assertion.
    const frame = requestAnimationFrame(check);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0)) check();
    });
    if (root.current) observer?.observe(root.current);
    document.addEventListener('visibilitychange', check);
    document.addEventListener('transitionend', check, true);
    return () => {
      live = false; cancelAnimationFrame(frame); observer?.disconnect();
      document.removeEventListener('visibilitychange', check); document.removeEventListener('transitionend', check, true);
    };
  }, [attempt, display, installed]);
  return <div ref={root}>{children}</div>;
}
