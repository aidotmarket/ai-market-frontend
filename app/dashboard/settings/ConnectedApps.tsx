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
      {confirmId === grant.id ? <div className="mt-3 space-y-3">
        <p>Revoke access for {grant.client.name}?</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busyId === grant.id} onClick={() => revoke(grant.id)}
            className="min-h-11 cursor-pointer rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors enabled:hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50">Confirm revoke</button>
          <button type="button" disabled={busyId === grant.id} onClick={() => setConfirmId(null)}
            className="min-h-11 cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors enabled:hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3F51B5] disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
        </div>
      </div> : <button type="button" onClick={() => setConfirmId(grant.id)}
        className="mt-3 min-h-11 cursor-pointer rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">Revoke</button>}
    </div>)}
  </section>;
}
