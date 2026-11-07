"use client";
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { postSessionMutation } from '@/api/session-mutation';
import { authSessionOwner, assertAuthSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';

const unavailable = 'Confirmation outcome unavailable. Use normal support for recovery; no confirmation was replayed.';
const changed = 'The account session changed. Confirmation is unavailable; use normal support for recovery.';
export default function SupportMailboxAccount() {
  const bearer = useRef('');
  const captured = useRef(false);
  const used = useRef(false);
  const live = useRef(false);
  const retired = useRef(false);
  const phase = useRef<'idle' | 'hydrate' | 'admission' | 'posted' | 'done'>('idle');
  const tokenChanges = useRef(0);
  const observedToken = useRef<string | null>(null);
  const session = useRef({ owner: 0, principal: null as string | null, token: null as string | null });
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Confirm support delivery using your current account session.');
  useEffect(() => {
    live.current = true;
    if (!captured.current) {
      captured.current = true;
      bearer.current = location.hash.slice(1);
      history.replaceState(null, '', location.pathname);
      const state = useAuthStore.getState();
      session.current = { owner: authSessionOwner(), principal: state.user?.id ?? null, token: state.token };
      observedToken.current = state.token;
      const valid = /^[A-Za-z0-9_-]{43}$/.test(bearer.current);
      if (!valid) { bearer.current = ''; setStatus('Confirmation link unavailable. Use normal support for recovery.'); }
      setReady(valid);
    }
    const retire = () => {
      retired.current = true; bearer.current = ''; setReady(false); setStatus(changed);
    };
    const fragmentChanged = () => {
      history.replaceState(null, '', location.pathname);
      retire();
    };
    window.addEventListener('hashchange', fragmentChanged);
    const unsubscribeOwner = subscribeAuthSessionOwner(retire);
    const unsubscribeStore = useAuthStore.subscribe(state => {
      const expected = session.current;
      if (state.token !== observedToken.current) {
        observedToken.current = state.token;
        // A restore/preflight may install its one rotated credential. A
        // replacement followed by a late refresh must not revive this link.
        if (++tokenChanges.current > 1) retire();
      }
      if (expected.principal && (state.user?.id !== expected.principal || !state.token || !state.isAuthenticated)) retire();
      else if (phase.current !== 'hydrate' && phase.current !== 'admission' &&
        (state.token !== expected.token || (state.user?.id ?? null) !== expected.principal)) retire();
    });
    return () => { live.current = false; unsubscribeOwner(); unsubscribeStore(); window.removeEventListener('hashchange', fragmentChanged); };
  }, []);
  async function confirm() {
    if (!captured.current || !live.current || retired.current || used.current || !bearer.current) return;
    used.current = true; setReady(false);
    if (location.hash) {
      history.replaceState(null, '', location.pathname);
      bearer.current = ''; retired.current = true; setStatus(changed); return;
    }
    const owner = session.current.owner;
    const assertCurrent = () => {
      assertAuthSessionOwner(owner);
      if (location.hash || location.pathname.replace(/\/$/, '') !== '/support/mailbox-account') {
        history.replaceState(null, '', location.pathname); retired.current = true;
      }
      if (!live.current || retired.current) throw new Error('SUPPORT_CONFIRMATION_RETIRED');
      const current = useAuthStore.getState();
      if (!current.token || !current.isAuthenticated || !current.user ||
        (session.current.principal && current.user.id !== session.current.principal)) throw new Error('CURRENT_CUSTOMER_SESSION_REQUIRED');
      return current;
    };
    try {
      assertAuthSessionOwner(owner);
      phase.current = 'hydrate'; tokenChanges.current = 0;
      const initial = useAuthStore.getState();
      if (!initial.hydrated || !initial.user || !initial.token || !initial.isAuthenticated) {
        await initial.hydrate(); // Existing API-host retained-session flow only.
      }
      const current = assertCurrent();
      session.current.principal = current.user!.id;
      session.current.token = current.token;
      phase.current = 'admission'; tokenChanges.current = 0;
      const result = await postSessionMutation<{ confirmed: boolean; conversation_url: null }>(
        '/support/mailbox-confirm/account', { secret: bearer.current }, headers => {
          const admitted = assertCurrent(); // Runs AFTER shared preflight refresh.
          if (headers.Authorization !== `Bearer ${admitted.token}`) throw new Error('SUPPORT_SESSION_REPLACED');
          session.current.token = admitted.token;
          phase.current = 'posted';
        });
      const completed = assertCurrent();
      if (completed.token !== session.current.token || result?.confirmed !== true || result.conversation_url !== null) throw new Error('SUPPORT_CONFIRMATION_UNAVAILABLE');
      setStatus('Mailbox confirmed. Delivery and message receipt remain separate.');
    } catch {
      if (live.current) setStatus(retired.current ? changed : unavailable);
    } finally { bearer.current = ''; phase.current = 'done'; }
  }
  return <main><p role="status">{status}</p><button disabled={!ready} onClick={confirm}>Confirm support delivery</button></main>;
}
