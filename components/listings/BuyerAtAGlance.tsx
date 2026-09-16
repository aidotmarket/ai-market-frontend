"use client";
import {useEffect, useState} from 'react';
import {fetchBuyerSummary, type ListingSummary} from '@/lib/api';
import AtAGlance from './AtAGlance';

// Fresh loads use force-dynamic/no-store. An untouched tab retains its summary
// until visibility resumes or bfcache restores it; there is no polling.
export default function BuyerAtAGlance({slug, initialSummary}: {
  slug: string; initialSummary?: ListingSummary | null;
}) {
  const [summary, setSummary] = useState(initialSummary ?? null);
  useEffect(() => {
    let disposed = false;
    let current: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setSummary(initialSummary ?? null);
    async function refresh() {
      if (document.visibilityState === 'hidden' || current) return;
      const controller = new AbortController(); current = controller;
      // Clear even if the transport fails to settle when aborted.
      const requestTimeout = setTimeout(() => {
        controller.abort();
        if (!disposed) setSummary(null);
        if (current === controller) current = null;
      }, 5_000);
      timeout = requestTimeout;
      try {
        const value = await fetchBuyerSummary(slug, controller.signal);
        if (!disposed && !controller.signal.aborted) setSummary(value);
      } catch {
        if (!disposed && !controller.signal.aborted) setSummary(null);
      } finally {
        clearTimeout(requestTimeout);
        if (current === controller) current = null;
      }
    }
    function visibility() {
      if (document.visibilityState === 'visible') void refresh();
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted) void refresh();
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', restore);
    return () => {
      disposed = true; current?.abort(); clearTimeout(timeout);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', restore);
    };
  }, [slug, initialSummary]);
  return <AtAGlance audience="buyer" summary={summary} />;
}
