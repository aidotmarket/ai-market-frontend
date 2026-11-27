'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getSellerCapability, sellerAdmissionEnabled } from '@/api/pending-actions';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import {nativeClient,nativeSession} from '@/api/connector-seller-settings';
import { useAuthStore } from '@/store/auth';

export interface SellerProfileSwitches { floors: boolean; seller_mode: 'full' | 'fallback' | 'off' }
export interface SellerSwitchReport { seller: boolean; effects: boolean; bulk: boolean; profiles?: Record<string, SellerProfileSwitches> }
export function workspaceSellerSwitchReport(value: unknown): SellerSwitchReport | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.seller !== 'boolean' || typeof v.bulk !== 'boolean' || typeof v.floors !== 'boolean') return null;
  // Profiles are advisory display data; website availability uses only the top-level flags.
  let profiles: Record<string, SellerProfileSwitches> = {};
  if (v.profiles && typeof v.profiles === 'object' && !Array.isArray(v.profiles)) {
    const entries = Object.entries(v.profiles);
    if (entries.every(([, profile]) => profile && typeof profile === 'object' && !Array.isArray(profile)
      && typeof profile.floors === 'boolean' && ['full', 'fallback', 'off'].includes(profile.seller_mode)))
      profiles = Object.fromEntries(entries);
  }
  return { seller: v.seller, bulk: v.bulk, effects: v.floors, profiles };
}
// Chunk 3 status is owner/org/link scoped, never a global rollout flag.
export function sellerSwitchReport(value: unknown): SellerSwitchReport | null {
  if (!sellerAdmissionEnabled(value)) return null;
  const snapshot = value.switch_snapshot;
  return { seller: snapshot.seller_enabled, effects: value.effective, bulk: snapshot.seller_bulk_enabled };
}
export function useSellerSwitches(): SellerSwitchReport | null {
  const owner = useAuthStore(state => state.user?.id);
  const token = useAuthStore(state => state.token);
  const pathname = usePathname();
  const query = useSearchParams();
  const search = query?.toString();
  const path = pathname && query ? pathname + (search ? `?${search}` : '') : '';
  const [saved, setSaved] = useState<{ owner: string; token: string; path: string; report: SellerSwitchReport } | null>(null);
  useEffect(() => {
    setSaved(null);
    if (!owner || !token || !path) return;
    const url = new URL(window.location.href);
    if (url.pathname !== pathname || url.searchParams.toString() !== search) return;
    const rawPath = url.pathname + url.search;
    const settings = pathname === '/dashboard/settings';
    const redirect = url.searchParams.get('redirect');
    const match = PENDING_ACTION_CONTINUATION.exec(settings ? redirect ?? '' : rawPath);
    if (!match && !settings && pathname !== '/dashboard/seller-workspace') return;
    const controller = new AbortController();
    let active = true; let request = 0; let inFlight = false; let expiry: ReturnType<typeof setTimeout> | undefined;
    const current = () => {
      const auth = useAuthStore.getState();
      return active && rawPath === window.location.pathname + window.location.search &&
        auth.user?.id === owner && auth.token === token;
    };
    const read = async () => {
      if (inFlight || !current()) return;
      inFlight = true;
      const generation = ++request;
      // Fail closed if the request stalls, as well as on malformed/stale replies.
      const timeout = setTimeout(() => { if (active && request === generation) { ++request; inFlight = false; setSaved(null); } }, 5000);
      try {
        const admission = match ? await getSellerCapability(match[1], match[2]) : null;
        let report: SellerSwitchReport | null = null;
        if (match) report = sellerSwitchReport(admission);
        else {
          const response = await nativeClient.get('/seller-workspace/connector-switches', {
            headers: nativeSession().headers, signal: controller.signal,
          });
          if (response.status === 200) report = workspaceSellerSwitchReport(response.data);
        }
        if (current() && request === generation && report) {
          clearTimeout(expiry);
          setSaved({ owner, token, path, report });
          expiry = setTimeout(() => { if (active) setSaved(null); }, Math.max(0, (admission ? Date.parse(admission.checked_at) : Date.now()) + 15000 - Date.now()));
        } else if (active && request === generation) setSaved(null);
      } catch { if (active && request === generation) setSaved(null); }
      finally { clearTimeout(timeout); if (request === generation) inFlight = false; }
    };
    void read(); const timer = setInterval(() => void read(), 5000);
    const focus = () => void read(); window.addEventListener('focus', focus);
    return () => { active = false; controller.abort(); clearInterval(timer); clearTimeout(expiry); window.removeEventListener('focus', focus); };
  }, [owner, token, pathname, path, search]);
  return saved && saved.owner === owner && saved.token === token && saved.path === path ? saved.report : null;
}
