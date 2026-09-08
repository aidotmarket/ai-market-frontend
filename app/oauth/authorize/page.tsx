'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { AIM_DATA_CONTINUATION } from '@/lib/redirect';
import { aimDataEnabled, clearContinuation, readContinuation, saveContinuation } from '@/lib/aim-data-continuation';
import { decideAuthorization, getAuthorization, type AuthorizationRequest } from '@/api/aim-data-oauth';

function providerSuffix(): string {
  const provider = new URLSearchParams(window.location.search).get('provider');
  return provider === 'google' || provider === 'github' ? `&provider=${provider}` : '';
}

function errorKind(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { error?: string } } })?.response;
  return response?.data?.error || (response?.status === 401 ? 'login_required'
    : response?.status === 422 || (error instanceof Error && ['invalid_request', 'invalid_redirect'].includes(error.message)) ? 'invalid_request' : 'retry');
}

const messages: Record<string, string> = {
  login_required: 'Please sign in again to continue to AIM Data.',
  invalid_session: 'Please sign in again to continue to AIM Data.',
  insufficient_assurance: 'Please sign in again and complete two-factor authentication.',
  access_denied: 'This account cannot authorize AIM Data. Access was denied.',
  binding_failed: 'This request belongs to another browser. Restart sign-in from AIM Data in this browser.',
  transaction_expired: 'This request has expired. Restart sign-in from AIM Data.',
  csrf_failed: 'This request could not be verified. Restart sign-in from AIM Data.',
  invalid_request: 'This request is invalid. Restart sign-in from AIM Data.',
  invalid_scope: 'This request is invalid. Restart sign-in from AIM Data.',
  unauthorized_client: 'AIM Data sign-in is unavailable. Restart from AIM Data later.',
  retry: 'Unable to complete this request. Retry, or restart sign-in from AIM Data.',
};

export default function AuthorizationPage() {
  const router = useRouter();
  const { user, isAuthenticated, hydrated, isLoading } = useAuthStore();
  const [metadata, setMetadata] = useState<AuthorizationRequest | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);
  const enabled = aimDataEnabled();
  const needsLogin = ['login_required', 'invalid_session', 'insufficient_assurance'].includes(error);

  useEffect(() => {
    if (!enabled) { clearContinuation(); return; }
    if (!hydrated || isLoading) return;
    let active = true;
    setMetadata(null);
    // Keep the provider hint out of the strictly validated continuation.
    const query = window.location.search.slice(1).split('&')
      .filter((param) => !param.startsWith('provider=') && param !== 'provider').join('&');
    const path = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
    const request = AIM_DATA_CONTINUATION.exec(path)?.[1];
    if (!request || !saveContinuation(path)) { setError('invalid_request'); return; }
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(path)}${providerSuffix()}`);
      return;
    }
    setError('');
    getAuthorization(request).then((data) => {
      if (!active) return;
      if (Date.parse(data.expires_at) <= Date.now()) {
        clearContinuation();
        setError('transaction_expired');
      } else setMetadata(data);
    }).catch((cause) => {
      if (!active) return;
      const kind = errorKind(cause);
      if (!['retry', 'login_required', 'invalid_session', 'insufficient_assurance'].includes(kind)) clearContinuation();
      setError(kind);
    });
    return () => { active = false; };
  }, [enabled, hydrated, isLoading, isAuthenticated, user?.id, router, revision]);

  useEffect(() => {
    if (!enabled) return;
    const visible = async () => {
      if (document.visibilityState !== 'visible' || submitting.current) return;
      setMetadata(null);
      await useAuthStore.getState().hydrate();
      setRevision((value) => value + 1);
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [enabled]);

  useEffect(() => {
    if (!metadata) return;
    const deadline = Math.min(Date.parse(metadata.expires_at), readContinuation()?.deadline ?? Date.now());
    const timer = setTimeout(() => {
      setMetadata(null);
      clearContinuation();
      setError('transaction_expired');
    }, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [metadata]);

  const decide = async (decision: 'continue' | 'cancel') => {
    if (!enabled || !metadata || submitting.current) return;
    if (!readContinuation() || Date.parse(metadata.expires_at) <= Date.now()) {
      clearContinuation(); setMetadata(null); setError('transaction_expired'); return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const url = await decideAuthorization(metadata.request, metadata.csrf_nonce, decision);
      clearContinuation();
      setMetadata(null);
      window.location.assign(url);
    } catch (cause) {
      const kind = errorKind(cause);
      setMetadata(null);
      setError(kind);
      if (!['retry', 'login_required', 'invalid_session', 'insufficient_assurance'].includes(kind)) clearContinuation();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const signIn = () => {
    const saved = readContinuation();
    if (!saved) { setError('transaction_expired'); return; }
    router.push(`/login?reauth=aim-data&redirect=${encodeURIComponent(`/oauth/authorize?request=${saved.request}`)}${providerSuffix()}`);
  };

  return (
    <main className="mx-auto max-w-lg px-6 py-16 space-y-6">
      {!enabled ? <h1>AIM Data sign-in is currently unavailable.</h1> : error ? (
        <>
          <p role="alert">{messages[error] || messages.retry}</p>
          {needsLogin && <button onClick={signIn}>Sign in again</button>}
          {!needsLogin && (error === 'retry' || !messages[error]) &&
            <button disabled={busy} onClick={() => setRevision((value) => value + 1)}>Retry</button>}
        </>
      ) : metadata && user && isAuthenticated && !isLoading ? (
        <>
          <h1 className="text-2xl font-bold">Continue to AIM Data as {user.email}</h1>
          <p>Signed in as {user.email}</p>
          <p>AIM Data receives account access equivalent to signing in with your password.</p>
          <div className="flex gap-4">
            <button className="rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => decide('continue')}>Continue</button>
            <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={() => decide('cancel')}>Cancel</button>
          </div>
        </>
      ) : <p role="status">Preparing AIM Data sign-in…</p>}
      <Link href="/listings">Back to ai.market</Link>
    </main>
  );
}
