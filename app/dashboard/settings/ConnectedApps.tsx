'use client';

import { useEffect, useState } from 'react';
import { getConnectorGrants, getConnectorStatus, revokeConnectorGrant, type ConnectorGrant } from '@/api/connector-oauth';

export default function ConnectedApps() {
  const [enabled, setEnabled] = useState(false);
  const [grants, setGrants] = useState<ConnectorGrant[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getConnectorStatus().then(async (status) => {
      if (!active || !status) return;
      setEnabled(true);
      try { const data = await getConnectorGrants(); if (active) setGrants(data); }
      catch { if (active) setError('Unable to load connected apps.'); }
    }).catch(() => { if (active) setError('Unable to load connected apps.'); });
    return () => { active = false; };
  }, []);

  const revoke = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError('');
    try {
      await revokeConnectorGrant(id);
      setGrants((current) => current?.filter((grant) => grant.id !== id) ?? null);
      setConfirmId(null);
    } catch { setError('Unable to revoke this app. Please try again.'); }
    finally { setBusyId(null); }
  };

  if (!enabled) return null;
  return <section id="connected-apps" className="scroll-mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
    <h2 className="text-lg font-semibold text-gray-900">Connected apps</h2>
    {error && <p role="alert">{error}</p>}
    {grants?.length === 0 && <p>To connect ai.market, choose it in Claude or ChatGPT.</p>}
    {grants?.map((grant) => <div key={grant.id} className="border-t border-gray-200 py-4">
      <h3>{grant.client.name} {grant.client.verified && <span>Verified</span>}</h3>
      <p>{grant.client.host}</p>
      <p>{grant.organization?.name ?? 'Personal'}</p>
      <ul>{grant.scopes.map((scope) => <li key={scope.scope}>{scope.description}</li>)}</ul>
      <p>Connected {new Date(grant.created_at).toLocaleDateString()}</p>
      <p>Last used {grant.last_used_at ? new Date(grant.last_used_at).toLocaleDateString() : 'Never'}</p>
      {confirmId === grant.id ? <div>
        <p>Revoke access for {grant.client.name}?</p>
        <button disabled={busyId === grant.id} onClick={() => revoke(grant.id)}>Confirm revoke</button>
        <button disabled={busyId === grant.id} onClick={() => setConfirmId(null)}>Cancel</button>
      </div> : <button onClick={() => setConfirmId(grant.id)}>Revoke</button>}
    </div>)}
  </section>;
}
