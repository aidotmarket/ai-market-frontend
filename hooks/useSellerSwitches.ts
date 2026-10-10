'use client';
import { useEffect, useState } from 'react';
import { getSellerCapability, sellerAdmissionEnabled } from '@/api/pending-actions';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import { useAuthStore } from '@/store/auth';

export interface SellerSwitchReport { seller: boolean; effects: boolean; bulk: boolean }
// Chunk 3 status is owner/org/link scoped, never a global rollout flag.
export function sellerSwitchReport(value: unknown): SellerSwitchReport | null {
  if (!sellerAdmissionEnabled(value)) return null;
  const snapshot = value.switch_snapshot;
  return { seller: snapshot.seller_enabled, effects: value.effective, bulk: snapshot.seller_bulk_enabled };
}
export function useSellerSwitches(): SellerSwitchReport | null {
  const { user, token } = useAuthStore();
  const [saved, setSaved] = useState<{ owner: string; token: string; path: string; report: SellerSwitchReport } | null>(null);
  const [path, setPath] = useState('');
  useEffect(() => {
    const changed = () => {
      const url = new URL(window.location.href);
      setPath(url.pathname === '/dashboard/settings' ? url.searchParams.get('redirect') || '' : url.pathname + url.search);
    };
    changed(); window.addEventListener('popstate', changed); window.addEventListener('hashchange', changed);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener('hashchange', changed); };
  }, []);
  useEffect(() => {
    setSaved(null);
    const match = PENDING_ACTION_CONTINUATION.exec(path);
    if (!user || !token || !match) return;
    let active = true; let request = 0; let inFlight = false; let expiry: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (inFlight) return;
      inFlight = true;
      const generation = ++request;
      // Fail closed if the request stalls, as well as on malformed/stale replies.
      const timeout = setTimeout(() => { if (active && request === generation) { ++request; inFlight = false; setSaved(null); } }, 5000);
      try {
        const admission = await getSellerCapability(match[1], match[2]);
        const report = sellerSwitchReport(admission);
        if (active && request === generation && report) {
          clearTimeout(expiry);
          setSaved({ owner: user.id, token, path, report });
          expiry = setTimeout(() => { if (active) setSaved(null); }, Math.max(0, Date.parse(admission.checked_at) + 15000 - Date.now()));
        } else if (active && request === generation) setSaved(null);
      } catch { if (active && request === generation) setSaved(null); }
      finally { clearTimeout(timeout); if (request === generation) inFlight = false; }
    };
    void read(); const timer = setInterval(() => void read(), 5000);
    const focus = () => void read(); window.addEventListener('focus', focus);
    return () => { active = false; clearInterval(timer); clearTimeout(expiry); window.removeEventListener('focus', focus); };
  }, [user, token, path]);
  return saved && saved.owner === user?.id && saved.token === token && saved.path === path ? saved.report : null;
}
