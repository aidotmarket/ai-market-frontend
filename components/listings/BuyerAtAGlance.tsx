"use client";
import {useEffect, useState} from 'react';
import {fetchBuyerSummary, type ListingSummary} from '@/lib/api';
import AtAGlance from './AtAGlance';

// Refresh every 10s. Expire 20s after REQUEST START, not response arrival:
// a slow or failed request must never extend the life of withdrawn metadata.
export default function BuyerAtAGlance({slug, initialSummary, checkedAt}: {
  slug: string; initialSummary?: ListingSummary | null; checkedAt: number;
}) {
  const [summary, setSummary] = useState(initialSummary ?? null);
  useEffect(() => {
    let disposed = false;
    let current: AbortController | null = null;
    let expiry: ReturnType<typeof setTimeout>;
    const expireAt = (start: number) => {
      clearTimeout(expiry);
      expiry = setTimeout(() => setSummary(null), Math.max(0, start + 20_000 - Date.now()));
    };
    setSummary(Date.now() - checkedAt < 20_000 ? initialSummary ?? null : null);
    expireAt(checkedAt);
    const isVisible = () => document.visibilityState !== 'hidden';
    async function refresh() {
      if (!isVisible() || current) return;
      const controller = new AbortController(); current = controller;
      const started = Date.now();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const value = await fetchBuyerSummary(slug, controller.signal);
        if (!disposed && !controller.signal.aborted && isVisible()) {
          setSummary(Date.now() - started < 20_000 ? value : null);
          expireAt(started);
        }
      } catch {
        if (!disposed) setSummary(null);
      } finally {
        clearTimeout(timeout);
        if (current === controller) current = null;
      }
    }
    function visibility() {
      setSummary(null);
      current?.abort(); current = null;
      if (document.visibilityState !== 'hidden') void refresh();
    }
    const interval = setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', visibility);
    void refresh();
    return () => {
      disposed = true; current?.abort(); clearInterval(interval); clearTimeout(expiry);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', visibility);
    };
  }, [slug, initialSummary, checkedAt]);
  return <AtAGlance audience="buyer" summary={summary} />;
}
