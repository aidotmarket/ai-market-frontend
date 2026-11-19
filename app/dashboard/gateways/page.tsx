'use client';

import VectoraizImport from '@/components/seller-workspace/VectoraizImport';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { loadGatewayAccess } from '@/lib/gateway-access';
import SellerSetupPanel from '@/components/gateways/SellerSetupPanel';
import { createPairingCode } from '@/api/sellerGateways';
import { gatewayErrorCode } from '@/api/gatewayDelivery';
import { dateLabel, gatewaySummary } from '@/components/gateways/presentation';
import type { PairingCode, SellerGateway } from '@/types/sellerGateway';

export default function GatewaysPage() {
  const { isAuthenticated, hydrated } = useAuthStore();
  const [state, setState] = useState<'loading' | 'ready' | 'setup' | 'unavailable' | 'error'>('loading');
  const [missingSteps, setMissingSteps] = useState<string[]>([]);
  const [gateways, setGateways] = useState<SellerGateway[]>([]);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;
    let cancelled = false;
    async function load() {
      const access = await loadGatewayAccess();
      if (cancelled) return;
      if (access.state === 'ready') setGateways(access.gateways);
      if (access.state === 'setup') setMissingSteps(access.missingSteps);
      setState(access.state);
    }
    void load();
    return () => { cancelled = true; };
  }, [hydrated, isAuthenticated]);

  async function addGateway() {
    setError(null);
    try { setPairing(await createPairingCode()); }
    catch (cause) {
      setError(gatewayErrorCode(cause) === 'pairing_rate_limited'
        ? 'Too many pairing codes were requested. Wait and try again.'
        : 'We could not create a pairing code. Try again.');
    }
  }

  if (state === 'loading') return <p>Loading…</p>;
  if (state === 'setup') return <SellerSetupPanel missingSteps={missingSteps} />;
  if (state === 'error') return <p role="alert">We could not load gateways. Please refresh and try again.</p>;
  if (state === 'unavailable') return <p>Gateways are not available.</p>;
  return <section className="space-y-6">
    <VectoraizImport mode="gateway" />
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">Gateways</h1>
      <button type="button" onClick={addGateway} className="rounded bg-indigo-700 px-4 py-2 text-white">Add a gateway</button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {pairing && <section aria-label="Pairing code" className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-semibold">Install your gateway</h2>
      <p>Use this code once before {dateLabel(pairing.expires_at)}.</p>
      <code className="block text-xl font-bold tracking-wider">{pairing.code}</code>
      <p>Image digest: <code className="break-all">{pairing.image}</code></p>
      <p>Version: {pairing.version} · Minimum version: {pairing.minimum_version}</p>
      <pre className="overflow-auto rounded bg-gray-100 p-3 text-sm">{pairing.compose_snippet}</pre>
      <button type="button" onClick={async () => { if (!navigator.clipboard?.writeText) return; try { await navigator.clipboard.writeText(pairing.compose_snippet); setCopied(true); } catch { setCopied(false); } }} className="rounded border px-3 py-2">{copied ? 'Copied' : 'Copy compose snippet'}</button>
      <p><a className="text-indigo-700 underline" href={pairing.install_guide_url}>Read the install guide</a></p>
    </section>}
    {gateways.length === 0 ? <p>No gateways yet.</p> : <ul className="space-y-3">
      {gateways.map(gateway => <li key={gateway.gateway_id} className="rounded border bg-white p-4">
        <Link className="font-semibold text-indigo-700 underline" href={`/dashboard/gateways/${encodeURIComponent(gateway.gateway_id)}`}>{gateway.name}</Link>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt>Status</dt><dd>{gatewaySummary(gateway)}</dd></div>
          <div><dt>Version / minimum</dt><dd>{gateway.version ?? 'Unknown'} / {gateway.minimum_version}</dd></div>
          <div><dt>Last seen</dt><dd>{dateLabel(gateway.last_seen_at)}</dd></div>
          <div><dt>Listings</dt><dd>{gateway.listing_count}</dd></div>
          <div><dt>Open orders</dt><dd>{gateway.open_order_count}</dd></div>
          <div><dt>Can publish</dt><dd>{gateway.can_publish ? 'Yes' : 'No'}</dd></div>
        </dl>
      </li>)}</ul>}
  </section>;
}
