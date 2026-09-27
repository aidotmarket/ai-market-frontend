'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { CONNECTOR_CONTINUATION } from '@/lib/redirect';
import { clearConnectorContinuation, connectorRequestPath, readConnectorContinuation, saveConnectorContinuation } from '@/lib/aim-data-continuation';
import { decideConnectorRequest, getConnectorRequest, getConnectorStatus, type ConnectorRequest } from '@/api/connector-oauth';

const expiredMessage = 'This connection request expired. Go back to the app and connect again.';

function errorKind(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
  if (response?.status === 410) return 'expired';
  if (response?.status === 401) return 'login';
  if (response?.status === 403) return response.data?.code || 'error';
  return 'error';
}

export default function ConnectorConsentPage() {
  const router = useRouter();
  const { user, hydrated, isLoading, isAuthenticated } = useAuthStore();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [metadata, setMetadata] = useState<ConnectorRequest | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    if (!hydrated || isLoading) return;
    let active = true;
    const path = window.location.pathname + window.location.search + window.location.hash;
    const request = CONNECTOR_CONTINUATION.exec(path)?.[1];
    setMetadata(null);
    getConnectorStatus().then(async (status) => {
      if (!active) return;
      setEnabled(status);
      if (!status) return;
      if (!request) { setError('invalid'); return; }
      saveConnectorContinuation(path);
      if (!isAuthenticated) {
        router.replace(`/login?redirect=${encodeURIComponent(path)}`);
        return;
      }
      try {
        const data = await getConnectorRequest(request);
        if (!active) return;
        if (Date.parse(data.expires_at) <= Date.now()) { clearConnectorContinuation(); setError('expired'); return; }
        saveConnectorContinuation(path);
        setOrganizationId(data.accounts.find((account) => account.kind === 'personal')?.organization_id ?? data.accounts[0]?.organization_id ?? null);
        setError('');
        setMetadata(data);
      } catch (cause) {
        if (!active) return;
        const kind = errorKind(cause);
        if (kind === 'expired') clearConnectorContinuation();
        setError(kind);
      }
    }).catch(() => { if (active) setError('error'); });
    return () => { active = false; };
  }, [hydrated, isLoading, isAuthenticated, user?.id, router, revision]);

  useEffect(() => {
    if (!metadata) return;
    const deadline = Math.min(Date.parse(metadata.expires_at), readConnectorContinuation()?.deadline ?? Date.now());
    const timer = setTimeout(() => { clearConnectorContinuation(); setMetadata(null); setError('expired'); }, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [metadata]);

  const decide = async (decision: 'approve' | 'deny') => {
    if (!metadata || submitting.current) return;
    if (!readConnectorContinuation() || Date.parse(metadata.expires_at) <= Date.now()) {
      clearConnectorContinuation(); setMetadata(null); setError('expired'); return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const url = await decideConnectorRequest(metadata.request, decision, organizationId, metadata.csrf_nonce);
      clearConnectorContinuation();
      window.location.assign(url);
    } catch (cause) {
      const kind = errorKind(cause);
      if (kind === 'expired') { clearConnectorContinuation(); setMetadata(null); }
      setError(kind);
    } finally { submitting.current = false; setBusy(false); }
  };

  const signInAgain = () => {
    const saved = readConnectorContinuation();
    if (!saved) { setError('expired'); return; }
    router.push(`/login?reauth=connector&redirect=${encodeURIComponent(connectorRequestPath(saved.request))}`);
  };

  return <main className="mx-auto max-w-lg space-y-6 px-6 py-16">
    {enabled === false ? <h1>Page not found</h1> : error ? <>
      <p role="alert">{error === 'expired' ? expiredMessage
        : error === 'email_unverified' ? 'Verify your email before connecting this app.'
        : error === 'insufficient_assurance' ? 'Sign in again and complete two-factor authentication to continue.'
        : error === 'sso_required' ? 'Sign in with your organization’s SSO to continue.'
        : error === 'invalid' ? 'This connection request is invalid.'
        : 'Unable to complete this connection request.'}</p>
      {error === 'insufficient_assurance' && <button onClick={signInAgain}>Sign in again</button>}
      {error === 'error' && <button onClick={() => setRevision((value) => value + 1)}>Retry</button>}
    </> : metadata && isAuthenticated && user ? <>
      <h1 className="text-2xl font-bold">Connect {metadata.client.name} to ai.market</h1>
      <p>{metadata.client.host} {metadata.client.verified && <span>Verified</span>}</p>
      <p>Signed in as {user.email}</p>
      <label htmlFor="connector-account">Connect account</label>
      <select id="connector-account" value={organizationId ?? ''} onChange={(event) => setOrganizationId(event.target.value || null)}>
        {[...metadata.accounts].sort((a, b) => (a.kind === 'personal' ? -1 : 1) - (b.kind === 'personal' ? -1 : 1)).map((account) =>
          <option key={account.organization_id ?? 'personal'} value={account.organization_id ?? ''}>{account.kind === 'personal' ? 'Personal' : account.label}</option>)}
      </select>
      <h2>Access requested</h2>
      <ul>{metadata.scopes.map((scope) => <li key={scope.scope}>{scope.description}</li>)}</ul>
      <p>Expires {new Date(metadata.expires_at).toLocaleString()}</p>
      <div className="flex gap-4">
        <button disabled={busy} onClick={() => decide('approve')}>Approve</button>
        <button disabled={busy} onClick={() => decide('deny')}>Deny</button>
      </div>
    </> : <p role="status">Preparing connection request…</p>}
  </main>;
}
